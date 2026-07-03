import { AuthError } from "./api-auth";
import type { StoredSubscription } from "./indexeddb";
import {
	applySubscriptionTombstones,
	areStringSetsEqual,
	mergeRemoteSubscriptionMetadata,
	subscriptionsEqual,
} from "./subscription-sync";

export type ServerSyncData = {
	subscriptions?: StoredSubscription[];
	watchedVideos?: string[];
	redirects?: Record<string, string>;
	subscriptionTombstones?: Array<{ id: string; revision: number }>;
	settings?: Record<string, unknown>;
	syncRevision?: number;
};

export type PushResult = {
	ok: boolean;
	status?: number;
	currentRevision?: number | null;
	body?: unknown;
};

export type RevisionRecorder = (
	snapshot: { syncRevision?: number | null } | null | undefined,
) => void;

/** Fetch the current server sync snapshot. */
export async function fetchServerSyncData(): Promise<ServerSyncData> {
	const response = await fetch(`/api/sync?t=${Date.now()}`);
	if (response.status === 401) throw new AuthError();
	if (!response.ok) throw new Error("Failed to fetch from backend");
	return response.json();
}

/**
 * Apply server-side redirects and tombstones to local subscriptions.
 * Returns the cleaned list and flags indicating whether changes were made.
 */
export function applyServerRedirects(
	localSubs: StoredSubscription[],
	tombstones: Array<{ id: string; revision: number }>,
	redirects: Record<string, string>,
): {
	subs: StoredSubscription[];
	tombstonesApplied: boolean;
	redirectsApplied: boolean;
} {
	let subs = applySubscriptionTombstones(localSubs, tombstones);
	const tombstonesApplied = subs.length !== localSubs.length;

	let redirectsApplied = false;
	if (Object.keys(redirects).length > 0) {
		subs = subs.map((sub) => {
			if (redirects[sub.id]) {
				redirectsApplied = true;
				return { ...sub, id: redirects[sub.id] };
			}
			return sub;
		});

		// Deduplicate after redirect (e.g. both handle_X and UC_Y existed)
		const unique = new Map<string, StoredSubscription>();
		for (const sub of subs) {
			if (!unique.has(sub.id)) unique.set(sub.id, sub);
		}
		subs = Array.from(unique.values());
	}

	return { subs, tombstonesApplied, redirectsApplied };
}

/**
 * Union-merge local and remote subscription lists.
 * Server metadata (title/thumbnail/description) wins when present.
 */
export function mergeSubscriptionLists(
	localSubs: StoredSubscription[],
	remoteSubs: StoredSubscription[],
): StoredSubscription[] {
	const locallyMerged = mergeRemoteSubscriptionMetadata(localSubs, remoteSubs);
	const localIds = new Set(locallyMerged.map((sub) => sub.id));
	return [
		...locallyMerged,
		...remoteSubs.filter((sub) => !localIds.has(sub.id)),
	];
}

/** Check whether local subscriptions differ from merged result. */
export function subscriptionsChanged(
	localSubs: StoredSubscription[],
	mergedSubs: StoredSubscription[],
): boolean {
	return !subscriptionsEqual(localSubs, mergedSubs);
}

/** Check whether watched video sets differ. */
export function watchedVideosChanged(
	local: string[],
	remote: string[],
): boolean {
	return !areStringSetsEqual(local, remote);
}

export type SyncSettingsHandler = {
	onQuotaExceeded: () => void;
	onQuotaWarning: (percentage: number) => void;
	setQuota: (quota: number) => void;
	setApiExhausted: (exhausted: boolean) => void;
	getCurrentQuota: () => number;
};

/** Apply server-side settings (quota, apiExhausted) to the local store via callbacks. */
export function applyServerSettings(
	settings: Record<string, unknown> | undefined,
	handler: SyncSettingsHandler,
): void {
	if (!settings) return;

	const remoteQuota = Number(settings.quotaUsed);
	if (Number.isFinite(remoteQuota)) {
		const currentQuota = handler.getCurrentQuota();
		if (remoteQuota > currentQuota) {
			handler.setQuota(remoteQuota);
			if (remoteQuota >= 10000) {
				handler.onQuotaExceeded();
			} else if (remoteQuota >= 8000 && currentQuota < 8000) {
				handler.onQuotaWarning(Math.round(remoteQuota / 100));
			}
		}
	}

	if (typeof settings.apiExhausted === "boolean") {
		handler.setApiExhausted(settings.apiExhausted);
	}
}

/**
 * Push a payload to the server with optional optimistic concurrency via If-Match.
 * On 412, updates the revision recorder so the next attempt uses the fresh revision.
 */
export async function pushToServer(
	payload: object,
	knownRevision: number | null,
	recordRevision: RevisionRecorder,
): Promise<PushResult> {
	try {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (knownRevision !== null) {
			headers["If-Match"] = String(knownRevision);
		}

		const response = await fetch("/api/sync", {
			method: "POST",
			headers,
			body: JSON.stringify(payload),
		});

		if (response.status === 412) {
			const body = await response.json().catch(() => ({}));
			if (typeof body?.currentRevision === "number") {
				recordRevision({ syncRevision: body.currentRevision });
			}
			return {
				ok: false,
				status: 412,
				currentRevision: body?.currentRevision ?? null,
			};
		}

		if (!response.ok) {
			return { ok: false, status: response.status };
		}

		const body = await response.json().catch(() => ({}));
		recordRevision(body);
		return { ok: true, body };
	} catch (err) {
		return { ok: false, status: 0, body: err };
	}
}

/**
 * Force-push local state to the backend, retrying once on 412.
 * Used by delete/clear flows where the local change must land on the server.
 */
export async function forcePushToServer(
	payload: object,
	knownRevision: number | null,
	recordRevision: RevisionRecorder,
): Promise<void> {
	const result = await pushToServer(payload, knownRevision, recordRevision);
	if (!result.ok && result.status === 412) {
		await pushToServer(payload, result.currentRevision ?? null, recordRevision);
	}
}
