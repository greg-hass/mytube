/**
 * refresh-innertube-auth.cjs
 *
 * Reads YouTube cookies from Chrome's encrypted cookie database and syncs
 * them to the Docker container running on the homelab server.
 *
 * Chrome must be fully quit while this script runs so the cookie database is
 * flushed and available for SQLite.
 *
 * Usage:
 *   node scripts/refresh-innertube-auth.cjs              # extract only
 *   node scripts/refresh-innertube-auth.cjs --push        # extract + sync to Docker
 *
 * Requirements:
 *   - Be logged into YouTube in Chrome.
 *
 * Environment variables (for --push):
 *   MYTUBE_SSH_HOST   SSH host for the homelab (default: reads ~/.ssh/config)
 *   MYTUBE_CONTAINER  Docker container name (default: mytube)
 *
 * Cookies expire after ~2-4 weeks. Re-run to refresh.
 */

const { createHash, createDecipheriv, pbkdf2Sync } = require("node:crypto");
const { execFileSync, execSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const YOUTUBE_ORIGIN = "https://www.youtube.com";
const INNERTUBE_BROWSE_URL = `${YOUTUBE_ORIGIN}/youtubei/v1/browse?prettyPrint=false`;
const REAL_PROFILE_DIR = path.join(
	os.homedir(),
	"Library/Application Support/Google/Chrome",
);
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
	"__Secure-1PSIDTS",
	"__Secure-3PSIDTS",
	"__Secure-1PSIDRTS",
	"__Secure-3PSIDRTS",
];

const COOKIE_DOMAIN_PREFERENCE = {
	SAPISID: [".google.com", ".google.co.uk", ".youtube.com"],
	APISID: [".google.com", ".google.co.uk", ".youtube.com"],
	SID: [".google.com", ".google.co.uk", ".youtube.com"],
	HSID: [".google.com", ".google.co.uk", ".youtube.com"],
	SSID: [".google.com", ".google.co.uk", ".youtube.com"],
	LOGIN_INFO: [".google.com", ".google.co.uk", ".youtube.com"],
};

/**
 * Chrome's cookie database stores v10 values encrypted with the macOS
 * Keychain's "Chrome Safe Storage" secret. Decrypt locally instead of
 * copying the profile or automating a Google login.
 */
function cookieDomainRank(cookie, preferYouTube) {
	const preferred = COOKIE_DOMAIN_PREFERENCE[cookie.name] || [];
	const domain = cookie.domain.toLowerCase();
	if (preferYouTube && domain.endsWith("youtube.com")) return 0;
	const preferredRank = preferred.indexOf(domain);
	if (preferredRank >= 0) return preferredRank;
	if (domain.endsWith("google.com")) return 10;
	return 20;
}

function getChromeSafeStoragePassword() {
	try {
		return execFileSync(
			"security",
			[
				"find-generic-password",
				"-a",
				"Chrome",
				"-s",
				"Chrome Safe Storage",
				"-w",
			],
			{ encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
		).trim();
	} catch {
		throw new Error(
			'Keychain denied access to "Chrome Safe Storage". Run this script from your logged-in macOS session and allow Terminal access when prompted.',
		);
	}
}

function decryptChromeCookie(hexValue, hostKey, databaseVersion, keys) {
	if (!hexValue) return null;
	const encrypted = Buffer.from(hexValue, "hex");
	if (encrypted.subarray(0, 3).toString() !== "v10") return null;

	for (const key of keys) {
		try {
			const decipher = createDecipheriv(
				"aes-128-cbc",
				key,
				Buffer.alloc(16, " "),
			);
			let plaintext = Buffer.concat([
				decipher.update(encrypted.subarray(3)),
				decipher.final(),
			]);
			if (databaseVersion >= 24) {
				const hostHash = createHash("sha256").update(hostKey).digest();
				if (!plaintext.subarray(0, 32).equals(hostHash)) continue;
				plaintext = plaintext.subarray(32);
			}
			const value = new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
			if (/^[\x21-\x7e]+$/.test(value)) return value;
		} catch {
			// Try the next key candidate.
		}
	}
	return null;
}

function readChromeCookies() {
	const databases = [
		path.join(REAL_PROFILE_DIR, "Default", "Network", "Cookies"),
		path.join(REAL_PROFILE_DIR, "Default", "Cookies"),
	].filter((database) => fs.existsSync(database));
	if (databases.length === 0) return [];

	const passwords = [getChromeSafeStoragePassword(), "peanuts"];
	const keys = passwords.map((password) =>
		pbkdf2Sync(password, "saltysalt", 1003, 16, "sha1"),
	);
	const query = `SELECT host_key, name, hex(encrypted_value), value FROM cookies WHERE name IN (${COOKIE_NAMES.map((name) => `'${name}'`).join(",")})`;
	return databases.flatMap((database) => {
		const versionOutput = execFileSync(
			"sqlite3",
			[database, "SELECT value FROM meta WHERE key='version'"],
			{ encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
		);
		const databaseVersion = Number.parseInt(versionOutput.trim(), 10) || 0;
		const output = execFileSync(
			"sqlite3",
			["-separator", "\t", database, query],
			{
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			},
		);
		return output
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((line) => {
				const [domain, name, encrypted, plain] = line.split("\t");
				return {
					domain,
					name,
					value:
						decryptChromeCookie(encrypted, domain, databaseVersion, keys) ||
						plain,
				};
			})
			.filter((cookie) => cookie.value);
	});
}

function buildCookieString(cookies, preferYouTube = false) {
	const selected = new Map();
	for (const name of COOKIE_NAMES) {
		const matches = cookies
			.filter((cookie) => cookie.name === name && cookie.value)
			.sort(
				(a, b) =>
					cookieDomainRank(a, preferYouTube) -
					cookieDomainRank(b, preferYouTube),
			);
		if (matches[0]) selected.set(name, matches[0].value);
	}
	return {
		cookieString: [...selected.entries()]
			.map(([name, value]) => `${name}=${value}`)
			.join("; "),
		present: [...selected.keys()],
	};
}

function isYouTubeCookie(cookie) {
	const domain = cookie.domain.toLowerCase();
	return domain === "youtube.com" || domain.endsWith(".youtube.com");
}

function buildAuthorizationHeader(cookieString, hashSuffix, names) {
	const timestamp = Math.floor(Date.now() / 1000);
	const hashes = [];
	for (const [scheme, name] of names) {
		const match = cookieString.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
		if (!match) continue;
		const digest = createHash("sha1")
			.update(`${timestamp} ${match[1]} ${YOUTUBE_ORIGIN}`)
			.digest("hex");
		hashes.push(`${scheme} ${timestamp}_${digest}${hashSuffix}`);
	}
	return hashes.join(" ");
}

const AUTH_HASH_VARIANTS = [
	{
		name: "combined_u",
		suffix: "_u",
		names: [
			["SAPISIDHASH", "SAPISID"],
			["SAPISID1PHASH", "__Secure-1PAPISID"],
			["SAPISID3PHASH", "__Secure-3PAPISID"],
		],
	},
	{
		name: "combined",
		suffix: "",
		names: [
			["SAPISIDHASH", "SAPISID"],
			["SAPISID1PHASH", "__Secure-1PAPISID"],
			["SAPISID3PHASH", "__Secure-3PAPISID"],
		],
	},
	{
		name: "sapisid_u",
		suffix: "_u",
		names: [["SAPISIDHASH", "SAPISID"]],
	},
	{
		name: "sapisid",
		suffix: "",
		names: [["SAPISIDHASH", "SAPISID"]],
	},
];

async function inspectYouTubeHomepage(cookieString) {
	const response = await fetch(YOUTUBE_ORIGIN, {
		headers: {
			Cookie: cookieString,
			"User-Agent": "Mozilla/5.0 Chrome/150.0.0.0 Safari/537.36",
		},
	});
	const body = await response.text();
	return {
		status: response.status,
		loggedIn: /["']LOGGED_IN["']\s*:\s*true/.test(body),
		sessionIndex:
			body.match(/["']SESSION_INDEX["']\s*:\s*["']?(\d+)/)?.[1] || "0",
		clientVersion:
			body.match(
				/["']INNERTUBE_CONTEXT_CLIENT_VERSION["']\s*:\s*["']([^"']+)/,
			)?.[1] || "2.20260715.04.00",
	};
}

async function verifyCookieString(cookieString, homepage) {
	const diagnostics = [];
	for (const variant of AUTH_HASH_VARIANTS) {
		const response = await fetch(INNERTUBE_BROWSE_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Cookie: cookieString,
				Authorization: buildAuthorizationHeader(
					cookieString,
					variant.suffix,
					variant.names,
				),
				Origin: YOUTUBE_ORIGIN,
				"X-Origin": YOUTUBE_ORIGIN,
				Referer: `${YOUTUBE_ORIGIN}/feed/subscriptions`,
				"X-Goog-AuthUser": homepage.sessionIndex,
				"X-Youtube-Client-Name": "1",
				"X-Youtube-Client-Version": homepage.clientVersion,
				"User-Agent":
					"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
					"AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
			},
			body: JSON.stringify({
				context: {
					client: {
						hl: "en-GB",
						gl: "GB",
						clientName: "WEB",
						clientVersion: homepage.clientVersion,
					},
				},
				browseId: "FEsubscriptions",
			}),
		});
		const body = await response.text();
		const loggedIn = body.includes('"key":"logged_in","value":"1"');
		const anonymous = body.includes('"key":"logged_in","value":"0"');
		const hasFeedRenderer =
			/videoRenderer|gridVideoRenderer|richItemRenderer/.test(body);
		diagnostics.push(
			`${variant.name}: http=${response.status} logged_in=${loggedIn} anonymous=${anonymous} feed=${hasFeedRenderer}`,
		);
		if (loggedIn || (!anonymous && hasFeedRenderer)) {
			return {
				hashSuffix: variant.suffix,
				hashVariant: variant.name,
				authUser: homepage.sessionIndex,
				clientVersion: homepage.clientVersion,
				diagnostics,
			};
		}
	}
	console.error(`   InnerTube checks: ${diagnostics.join("; ")}`);
	return null;
}

async function extractCookies() {
	const realCookies = path.join(REAL_PROFILE_DIR, "Default", "Cookies");
	if (!fs.existsSync(realCookies)) {
		console.error(`❌ Chrome cookie store not found: ${realCookies}`);
		console.error("   Make sure you're logged into YouTube in Chrome.");
		process.exit(1);
	}

	console.log("🔐 Reading Chrome cookies through macOS Keychain...");
	let cookies;
	try {
		cookies = readChromeCookies();
	} catch (err) {
		console.error(`❌ Could not decrypt Chrome cookies: ${err.message}`);
		return null;
	}

	const authCookieNames = new Set([
		"SAPISID",
		"__Secure-1PAPISID",
		"__Secure-3PAPISID",
	]);
	if (!cookies.some((cookie) => authCookieNames.has(cookie.name))) {
		console.error("❌ No logged-in YouTube cookies found in Chrome.");
		console.error(
			"   Log into YouTube in normal Chrome, quit Chrome completely, then run this again.",
		);
		return null;
	}

	const youtubeCookies = cookies.filter(isYouTubeCookie);
	const candidates = [buildCookieString(youtubeCookies, true)];
	const candidate = candidates[0];
	console.log(
		`   YouTube cookie rows: ${youtubeCookies.length}; selected: ${candidate.present.length}/${COOKIE_NAMES.length}`,
	);
	const lengths = candidate.cookieString
		.split(/;\s*/)
		.filter(Boolean)
		.map((part) => `${part.split("=", 1)[0]}:${part.length}`)
		.join(", ");
	console.log(`   Cookie metadata: ${lengths}`);

	if (!candidate.present.includes("SAPISID")) {
		console.error("❌ No YouTube-domain SAPISID cookie found.");
		return null;
	}

	const homepage = await inspectYouTubeHomepage(candidate.cookieString);
	console.log(
		`   Homepage: http=${homepage.status} logged_in=${homepage.loggedIn} session=${homepage.sessionIndex} client=${homepage.clientVersion}`,
	);
	if (!homepage.loggedIn) {
		console.error(
			"❌ Chrome cookies are not authenticated on YouTube homepage.",
		);
		return null;
	}

	const auth = await verifyCookieString(candidate.cookieString, homepage);
	if (!auth) {
		console.error("❌ InnerTube rejected every safe auth variant.");
		return null;
	}

	const sapisid = candidate.cookieString.match(
		/(?:^|;\s*)SAPISID=([^;]+)/,
	)?.[1];
	console.log(`🔑 SAPISID verified (${sapisid.length} chars)`);
	console.log(
		`   InnerTube authentication check: passed (${auth.hashVariant})`,
	);
	console.log(`   Cookies: ${candidate.present.length}/${COOKIE_NAMES.length}`);

	return { ...candidate, auth };
}

function saveLocally(cookieString, auth) {
	const credsDir = path.dirname(LOCAL_CREDS_FILE);
	if (!fs.existsSync(credsDir)) {
		fs.mkdirSync(credsDir, { recursive: true });
	}
	const creds = {
		cookieString,
		...auth,
		updatedAt: new Date().toISOString(),
	};
	fs.writeFileSync(LOCAL_CREDS_FILE, JSON.stringify(creds, null, 2));
	console.log(`\n💾 Saved locally: ${LOCAL_CREDS_FILE}`);
}

function pushToServer(cookieString, auth) {
	if (!SSH_HOST) {
		console.log("\n⚠️  --push requested but MYTUBE_SSH_HOST not set.");
		console.log(
			"   Set it via: MYTUBE_SSH_HOST=ubuntu node scripts/refresh-innertube-auth.cjs --push",
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
		...auth,
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
	const result = await extractCookies();
	if (!result) {
		process.exit(1);
	}
	const { cookieString, auth } = result;
	saveLocally(cookieString, auth);

	if (DO_PUSH) {
		pushToServer(cookieString, auth);
	} else {
		console.log("\n📋 To sync to Docker:");
		console.log(`   node scripts/refresh-innertube-auth.cjs --push`);
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
