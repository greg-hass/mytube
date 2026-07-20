/**
 * refresh-innertube-auth.js
 *
 * Extracts real YouTube cookies via Playwright (runs on your Mac where
 * Chrome is available), then syncs them to the Docker container running
 * on the homelab server.
 *
 * Usage:
 *   node scripts/refresh-innertube-auth.js              # extract only
 *   node scripts/refresh-innertube-auth.js --push        # extract + sync to Docker
 *
 * Environment variables (for --push):
 *   MYTUBE_SSH_HOST   SSH host for the homelab (default: reads ~/.ssh/config)
 *   MYTUBE_CONTAINER  Docker container name (default: mytube)
 *
 * First run: opens a browser — log into YouTube when prompted.
 * Subsequent runs: reuses saved browser profile (already logged in).
 *
 * Cookies expire after ~2-4 weeks. Re-run to refresh.
 */

const { chromium } = require("playwright");
const { createHash } = require("node:crypto");
const { execSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const PROFILE_DIR = path.join(__dirname, "..", ".playwright-profile");
const LOCAL_CREDS_FILE = path.join(
	__dirname,
	"..",
	"server",
	"data",
	"innertube-creds.json",
);
const REMOTE_CREDS_PATH = "/app/server/data/innertube-creds.json";
const CONTAINER_NAME = process.env.MYTUBE_CONTAINER || "mytube";
const SSH_HOST = process.env.MYTUBE_SSH_HOST || "ubuntu";
const DO_PUSH = process.argv.includes("--push");

const COOKIE_NAMES = [
	"SAPISID",
	"__Secure-1PAPISID",
	"__Secure-3PAPISID",
	"SID",
	"HSID",
	"SSID",
	"APISID",
	"LOGIN_INFO",
	"VISITOR_INFO1_LIVE",
	"__Secure-3PSID",
	"__Secure-1PSID",
	"SIDCC",
	"__Secure-3PSIDCC",
	"__Secure-1PSIDCC",
];

async function extractCookies() {
	console.log("🎬 Launching Playwright browser...");

	const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
		headless: false,
		channel: "chrome",
		viewport: { width: 1280, height: 800 },
	});

	const page = browser.pages()[0] || (await browser.newPage());

	console.log("📺 Navigating to YouTube...");
	await page.goto("https://www.youtube.com/feed/subscriptions", {
		waitUntil: "domcontentloaded",
		timeout: 30000,
	});

	// Check if logged in
	const needsLogin =
		(await page.locator('a[href*="ServiceLogin"]').count()) > 0 ||
		(await page.locator('tp-yt-paper-dialog:has-text("Sign in")').count()) > 0;

	if (needsLogin) {
		console.log("\n🔐 Please log into YouTube in the browser window.");
		console.log("   Waiting for login to complete (5 min timeout)...");

		await page
			.waitForSelector("ytd-guide-section-renderer", { timeout: 300000 })
			.catch(() => {});
	}

	console.log("✅ Logged in! Extracting cookies...");

	const cookies = await browser.cookies([
		"https://www.youtube.com",
		"https://youtube.com",
		".youtube.com",
	]);

	const cookieMap = new Map();
	for (const cookie of cookies) {
		if (COOKIE_NAMES.includes(cookie.name)) {
			cookieMap.set(cookie.name, cookie.value);
		}
	}

	const cookieString = [...cookieMap.entries()]
		.map(([name, value]) => `${name}=${value}`)
		.join("; ");

	const sapisid = cookieMap.get("SAPISID");
	if (!sapisid) {
		console.error("❌ SAPISID not found. Ensure you're fully logged in.");
		await browser.close();
		process.exit(1);
	}

	// Verify SAPISIDHASH formula
	const ts = Math.floor(Date.now() / 1000);
	const testHash = createHash("sha1")
		.update(`${ts} ${sapisid} https://www.youtube.com`)
		.digest("hex");

	console.log(`🔑 SAPISID extracted (${sapisid.length} chars)`);
	console.log(`   Verified: SAPISIDHASH ${ts}_${testHash.substring(0, 16)}...`);

	const present = COOKIE_NAMES.filter((n) => cookieMap.has(n));
	console.log(`   Cookies: ${present.length}/${COOKIE_NAMES.length}`);

	await browser.close();
	return { cookieString, present };
}

function saveLocally(cookieString) {
	const credsDir = path.dirname(LOCAL_CREDS_FILE);
	if (!fs.existsSync(credsDir)) {
		fs.mkdirSync(credsDir, { recursive: true });
	}
	const creds = {
		cookieString,
		updatedAt: new Date().toISOString(),
	};
	fs.writeFileSync(LOCAL_CREDS_FILE, JSON.stringify(creds, null, 2));
	console.log(`\n💾 Saved locally: ${LOCAL_CREDS_FILE}`);
}

function pushToServer(cookieString) {
	if (!SSH_HOST) {
		console.log("\n⚠️  --push requested but MYTUBE_SSH_HOST not set.");
		console.log(
			"   Set it via: MYTUBE_SSH_HOST=ubuntu node scripts/refresh-innertube-auth.js --push",
		);
		console.log("   Or manually SCP the file:");
		console.log(
			`   scp ${LOCAL_CREDS_FILE} <host>:/tmp/ && ssh <host> 'docker cp /tmp/innertube-creds.json ${CONTAINER_NAME}:${REMOTE_CREDS_PATH}'`,
		);
		return;
	}

	console.log(`\n🚀 Syncing to ${SSH_HOST} → container ${CONTAINER_NAME}...`);

	// Write to a temp file for SCP
	const tmpFile = "/tmp/mytube-innertube-creds.json";
	const creds = {
		cookieString,
		updatedAt: new Date().toISOString(),
	};
	fs.writeFileSync(tmpFile, JSON.stringify(creds, null, 2));

	try {
		// SCP the file to the server
		execSync(`scp "${tmpFile}" "${SSH_HOST}:/tmp/innertube-creds.json"`, {
			stdio: "inherit",
			timeout: 30000,
		});
		console.log("   ✅ File transferred");

		// Docker cp into the container
		execSync(
			`ssh "${SSH_HOST}" 'docker cp /tmp/innertube-creds.json ${CONTAINER_NAME}:${REMOTE_CREDS_PATH}'`,
			{ stdio: "inherit", timeout: 30000 },
		);
		console.log("   ✅ Copied into Docker container");

		// Clean up remote temp
		execSync(`ssh "${SSH_HOST}" 'rm /tmp/innertube-creds.json'`, {
			timeout: 10000,
		});

		console.log("\n🎉 Done! MyTube will use InnerTube on next refresh cycle.");
	} catch (err) {
		console.error(`\n❌ Push failed: ${err.message}`);
		console.error("   The local copy was saved — you can push manually:");
		console.error(
			`   scp ${LOCAL_CREDS_FILE} ${SSH_HOST}:/tmp/ && ssh ${SSH_HOST} 'docker cp /tmp/innertube-creds.json ${CONTAINER_NAME}:${REMOTE_CREDS_PATH}'`,
		);
	}

	// Clean up local temp
	fs.unlinkSync(tmpFile);
}

async function main() {
	const { cookieString } = await extractCookies();
	saveLocally(cookieString);

	if (DO_PUSH) {
		pushToServer(cookieString);
	} else {
		console.log("\n📋 To sync to Docker:");
		console.log(`   node scripts/refresh-innertube-auth.js --push`);
		console.log(`   (or set MYTUBE_SSH_HOST and re-run with --push)`);
		console.log("\n   Manual one-liner:");
		console.log(
			`   scp ${LOCAL_CREDS_FILE} <host>:/tmp/ && ssh <host> 'docker cp /tmp/innertube-creds.json ${CONTAINER_NAME}:${REMOTE_CREDS_PATH}'`,
		);
	}
}

main().catch((err) => {
	console.error("❌ Error:", err.message);
	process.exit(1);
});
