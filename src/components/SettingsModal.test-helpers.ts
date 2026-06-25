/**
 * Shared test fixtures for SettingsModal — the inline fetch mock and
 * localStorage stub are large enough that inlining them in beforeEach
 * triggers the high-fan-out warning. Keeping them here means the test
 * body itself reads like a list of user-visible assertions.
 */
import { vi } from "vitest";

export interface HealthDataIntegrityEvent {
	file: string;
	status: "ok" | "restored" | string;
	backupFile: string | null;
}

export interface HealthPayload {
	status: string;
	subscriptions: number;
	videos: number;
	lastUpdated: string;
	dataIntegrity: HealthDataIntegrityEvent[];
}

export interface VersionPayload {
	name: string;
	version: string;
	appVersion: string;
}

export interface VideosStatusPayload {
	errors?: number;
	failedChannels: Array<{
		id: string;
		title: string;
		reason: string;
	}>;
}

export const HEALTH_PAYLOAD: HealthPayload = {
	status: "ok",
	subscriptions: 3,
	videos: 42,
	lastUpdated: "2026-05-09T20:00:00.000Z",
	dataIntegrity: [
		{ file: "/data/db.json", status: "ok", backupFile: null },
		{ file: "/data/videos.json", status: "ok", backupFile: null },
	],
};

export const VERSION_PAYLOAD: VersionPayload = {
	name: "youtube-subscriptions-api",
	version: "1.0.0",
	appVersion: "0.0.0",
};

export const VIDEOS_STATUS_PAYLOAD: VideosStatusPayload = {
	errors: 1,
	failedChannels: [
		{
			id: "UC_BAD",
			title: "Broken Channel",
			reason: "No RSS videos or metadata returned",
		},
	],
};

const DEFAULT_PAYLOAD = { success: true } as const;

function jsonResponse(payload: unknown): Response {
	return {
		ok: true,
		json: async () => payload,
	} as Response;
}

const FETCH_RESPONSES: Record<string, () => Response> = {
	"/api/health": () => jsonResponse(HEALTH_PAYLOAD),
	"/api/version": () => jsonResponse(VERSION_PAYLOAD),
	"/api/videos/status": () => jsonResponse(VIDEOS_STATUS_PAYLOAD),
};

/**
 * Install a global `fetch` mock that serves canned responses for the
 * server-status, version, and videos-status endpoints. Other URLs get
 * a generic `{ success: true }` 200 response. Pass `overrides` to swap
 * individual endpoint payloads for a specific test.
 */
export function installFetchMock(
	overrides: Partial<HealthPayload & VersionPayload & VideosStatusPayload> = {},
): void {
	const responses: Record<string, () => Response> = { ...FETCH_RESPONSES };
	if (
		"status" in overrides ||
		"subscriptions" in overrides ||
		"videos" in overrides ||
		"lastUpdated" in overrides ||
		"dataIntegrity" in overrides
	) {
		responses["/api/health"] = () =>
			jsonResponse({ ...HEALTH_PAYLOAD, ...overrides });
	}
	if ("name" in overrides || "version" in overrides || "appVersion" in overrides) {
		responses["/api/version"] = () =>
			jsonResponse({ ...VERSION_PAYLOAD, ...overrides });
	}
	if ("errors" in overrides || "failedChannels" in overrides) {
		responses["/api/videos/status"] = () =>
			jsonResponse({ ...VIDEOS_STATUS_PAYLOAD, ...overrides });
	}

	vi.stubGlobal(
		"fetch",
		vi.fn((input: URL | RequestInfo) => {
			const url = String(input);
			const builder = responses[url];
			return Promise.resolve(
				builder ? builder() : jsonResponse(DEFAULT_PAYLOAD),
			);
		}),
	);
}

export const BACKUP_STORAGE_SEED: ReadonlyArray<readonly [string, string]> = [
	["favorite-video-ids", JSON.stringify(["fav-1"])],
	["queued-video-ids", JSON.stringify(["queue-1", "queue-2"])],
	[
		"feed-quality-filters",
		JSON.stringify({ hidePremieres: true, mutedKeywordText: "rumor" }),
	],
];

/**
 * Install a global `localStorage` mock seeded with the backup
 * fixtures used by the SettingsModal tests.
 */
export function installLocalStorageMock(
	seed: ReadonlyArray<readonly [string, string]> = BACKUP_STORAGE_SEED,
): void {
	const storage = new Map<string, string>(
		seed.map(([key, value]) => [key, value]),
	);
	vi.stubGlobal("localStorage", {
		getItem: vi.fn((key: string) => storage.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
		removeItem: vi.fn((key: string) => storage.delete(key)),
		clear: vi.fn(() => storage.clear()),
	});
}
