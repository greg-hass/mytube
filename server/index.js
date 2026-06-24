const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");

// Load .env from the project root for local dev. In production (Docker),
// env vars are injected by docker-compose — existing values are NOT overridden.
(function loadEnv() {
	const envPath = path.join(__dirname, "..", ".env");
	try {
		const content = fs.readFileSync(envPath, "utf8");
		for (const line of content.split("\n")) {
			const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
			if (match && !(match[1] in process.env)) {
				process.env[match[1]] = match[2].trim();
			}
		}
	} catch {
		// No .env file — env vars come from the environment (Docker/CI)
	}
})();
const appStore = require("./app-store");
const feedAggregatorModule = require("./feed-aggregator");
const { createApp } = require("./app-factory");
const {
	describeAllowlist,
	parseAllowedOrigins,
} = require("./security-middleware");

let feedAggregator = null;
let server = null;
let shutdownPromise = null;

async function init() {
	try {
		await fsPromises.mkdir(path.dirname(appStore.DEFAULT_DATA_FILE), {
			recursive: true,
		});
		await appStore.init();
		const data = await appStore.readData(appStore.DEFAULT_DATA);

		try {
			const staticRedirectsFile = path.join(__dirname, "redirects.json");
			const staticRedirectsContent = await fsPromises.readFile(
				staticRedirectsFile,
				"utf8",
			);
			const staticRedirects = JSON.parse(staticRedirectsContent);
			data.redirects = { ...data.redirects, ...staticRedirects };
			console.log("✅ Merged static redirects:", Object.keys(staticRedirects));
			await appStore.writeData(data);
		} catch (_err) {
			// No static redirects or error reading, ignore
		}
	} catch (err) {
		console.error("Failed to initialize data storage:", err);
		throw err;
	}
}

function closeHttpServer() {
	if (!server) {
		return Promise.resolve();
	}
	return new Promise((resolve, reject) => {
		server.close((error) => {
			if (error) {
				reject(error);
				return;
			}
			resolve();
		});
	});
}

async function shutdown(signal) {
	if (shutdownPromise) {
		return shutdownPromise;
	}
	console.log(`Received ${signal}, shutting down gracefully`);
	shutdownPromise = (async () => {
		feedAggregator?.stopScheduledRefresh?.();
		await closeHttpServer();
		appStore.close();
	})();
	try {
		await shutdownPromise;
		process.exit(0);
	} catch (error) {
		console.error("Graceful shutdown failed:", error);
		process.exit(1);
	}
}

process.on("SIGTERM", () => {
	shutdown("SIGTERM");
});

process.on("SIGINT", () => {
	shutdown("SIGINT");
});

process.on("unhandledRejection", (reason, promise) => {
	console.error("Unhandled Rejection at:", promise, "reason:", reason);
	process.exit(1);
});

process.on("uncaughtException", (error) => {
	console.error("Uncaught Exception:", error);
	process.exit(1);
});

init()
	.then(() => {
		const PORT = process.env.PORT || 3001;
		const ALLOWED_ORIGINS = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
		const API_WRITE_RATE_LIMIT_WINDOW_MS =
			Number(process.env.API_WRITE_RATE_LIMIT_WINDOW_MS) || 60 * 1000;
		const API_WRITE_RATE_LIMIT_MAX =
			Number(process.env.API_WRITE_RATE_LIMIT_MAX) || 30;
		const ALLOW_INSECURE_UNAUTHENTICATED_API =
			process.env.ALLOW_INSECURE_UNAUTHENTICATED_API === "true";

		console.log(
			`[startup] Allowed browser origins: ${describeAllowlist(new Set(ALLOWED_ORIGINS))}`,
		);

		feedAggregator = feedAggregatorModule;
		feedAggregator.start();
		const { app } = createApp({
			appStore,
			feedAggregator,
			config: {
				allowedOrigins: ALLOWED_ORIGINS,
				apiKey: process.env.SERVER_API_TOKEN,
				allowInsecureUnauthenticatedApi: ALLOW_INSECURE_UNAUTHENTICATED_API,
				rateLimitWindowMs: API_WRITE_RATE_LIMIT_WINDOW_MS,
				rateLimitMax: API_WRITE_RATE_LIMIT_MAX,
				defaultData: appStore.DEFAULT_DATA,
				defaultVideoCache: appStore.DEFAULT_VIDEO_CACHE,
			},
		});
		server = app.listen(PORT, () => {
			console.log(`Sync server running on port ${PORT}`);
		});
	})
	.catch((error) => {
		console.error("Server startup failed:", error);
		process.exitCode = 1;
	});
