/**
 * useBackupActions — owns the backup-status banner message and the
 * three backup flows: download, restore-from-file, and feed-cache reset.
 * Failed-channel retry lives here too since it shares the same status
 * banner UX.
 */
import { useCallback, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useStore } from "../store/useStore";
import { useSubscriptionStorage } from "../hooks/useSubscriptionStorage";
import { readBackupLocalData, createAppBackup, restoreAppBackup } from "../lib/app-backup";
import { clearAllCachedVideos } from "../lib/indexeddb";

export interface UseBackupActionsOptions {
	/** Mirror the persisted apiKey into the local form field when a backup restore changes it. */
	onRestoredApiKey?: (apiKey: string) => void;
}

export interface UseBackupActionsResult {
	backupStatus: string;
	restoreInputRef: React.RefObject<HTMLInputElement | null>;
	handleDownloadBackup: () => void;
	handleRestoreBackup: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
	handleResetFeedCache: () => Promise<void>;
	handleRetryFailedChannels: () => Promise<void>;
}

type RawSubscription = ReturnType<typeof useSubscriptionStorage>["rawSubscriptions"][number];
type StatusSetter = (message: string) => void;

function buildBackupFilename(): string {
	const today = new Date().toISOString().split("T")[0];
	return `mytube-backup-${today}.json`;
}

function buildBackupBlob(
	subscriptions: RawSubscription[],
	watchedVideoIds: string[],
	settings: { apiKey: string },
): Blob {
	const backup = createAppBackup({
		subscriptions,
		watchedVideoIds,
		settings,
		localData: readBackupLocalData(),
	});
	return new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
}

function triggerDownload(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}

function pluralize(count: number, singular: string, plural: string): string {
	return `${count} ${count === 1 ? singular : plural}`;
}

function errorMessage(error: unknown, fallback: string): string {
	return error instanceof Error ? error.message : fallback;
}

function normalizeRestoredSubscription(
	subscription: ReturnType<typeof restoreAppBackup>["subscriptions"][number],
) {
	return {
		...subscription,
		title: subscription.title,
		thumbnail: subscription.thumbnail || "",
		description: subscription.description || "",
		addedAt: subscription.addedAt || Date.now(),
	};
}

function buildRestoreStatus(
	subscriptionCount: number,
	watchedCount: number,
): string {
	return `Backup restored: ${pluralize(subscriptionCount, "subscription", "subscriptions")} and ${pluralize(watchedCount, "watched video", "watched videos")}`;
}

// ─── Module-level action functions ───────────────────────────────────────

function performBackupDownload(
	rawSubs: RawSubscription[],
	watchedVideoIds: string[],
	apiKey: string,
	setStatus: StatusSetter,
): void {
	const blob = buildBackupBlob(rawSubs, watchedVideoIds, { apiKey });
	triggerDownload(blob, buildBackupFilename());
	setStatus("Backup downloaded");
}

async function performBackupRestore(
	file: File,
	addSubscriptions: ReturnType<typeof useSubscriptionStorage>["addSubscriptions"],
	setWatchedVideos: (ids: string[]) => void,
	setApiKey: (key: string) => void,
	onRestoredApiKey: ((key: string) => void) | undefined,
	setStatus: StatusSetter,
): Promise<void> {
	try {
		const restored = restoreAppBackup(await file.text());
		await addSubscriptions(restored.subscriptions.map(normalizeRestoredSubscription));
		setWatchedVideos(restored.watchedVideoIds);
		if (restored.settings.apiKey) {
			setApiKey(restored.settings.apiKey);
			onRestoredApiKey?.(restored.settings.apiKey);
		}
		setStatus(
			buildRestoreStatus(restored.subscriptions.length, restored.watchedVideoIds.length),
		);
	} catch (error) {
		setStatus(errorMessage(error, "Restore failed"));
	}
}

async function performFeedCacheReset(
	queryClient: QueryClient,
	setStatus: StatusSetter,
): Promise<void> {
	try {
		await clearAllCachedVideos();
		const response = await fetch("/api/videos/cache/reset", { method: "POST" });
		if (!response.ok) {
			throw new Error("Server feed cache reset failed");
		}
		queryClient.invalidateQueries({ queryKey: ["server-videos"] });
		queryClient.invalidateQueries({ queryKey: ["server-videos-status"] });
		setStatus("Feed cache reset");
	} catch (error) {
		setStatus(errorMessage(error, "Feed cache reset failed"));
	}
}

async function performRetryFailedChannels(
	queryClient: QueryClient,
	setStatus: StatusSetter,
): Promise<void> {
	try {
		const response = await fetch("/api/videos/refresh", { method: "POST" });
		if (!response.ok) {
			throw new Error("Retry failed");
		}
		queryClient.invalidateQueries({ queryKey: ["server-videos"] });
		queryClient.invalidateQueries({ queryKey: ["server-videos-status"] });
		setStatus("Retry started");
	} catch (error) {
		setStatus(errorMessage(error, "Retry failed"));
	}
}

// ─── Main composable hook ────────────────────────────────────────────────

export function useBackupActions(
	options: UseBackupActionsOptions = {},
): UseBackupActionsResult {
	const { onRestoredApiKey } = options;
	const queryClient = useQueryClient();
	const { apiKey, watchedVideos, setWatchedVideos, setApiKey } = useStore();
	const { rawSubscriptions, addSubscriptions } = useSubscriptionStorage();

	const [backupStatus, setBackupStatus] = useState("");
	const restoreInputRef = useRef<HTMLInputElement>(null);

	const handleDownloadBackup = useCallback(() => {
		performBackupDownload(
			rawSubscriptions,
			Array.from(watchedVideos),
			apiKey,
			setBackupStatus,
		);
	}, [rawSubscriptions, watchedVideos, apiKey]);

	const handleRestoreBackup = useCallback(
		async (event: ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0];
			if (!file) return;
			try {
				await performBackupRestore(
					file,
					addSubscriptions,
					setWatchedVideos,
					setApiKey,
					onRestoredApiKey,
					setBackupStatus,
				);
			} finally {
				event.target.value = "";
			}
		},
		[addSubscriptions, setWatchedVideos, setApiKey, onRestoredApiKey],
	);

	const handleResetFeedCache = useCallback(async () => {
		await performFeedCacheReset(queryClient, setBackupStatus);
	}, [queryClient]);

	const handleRetryFailedChannels = useCallback(async () => {
		await performRetryFailedChannels(queryClient, setBackupStatus);
	}, [queryClient]);

	return {
		backupStatus,
		restoreInputRef,
		handleDownloadBackup,
		handleRestoreBackup,
		handleResetFeedCache,
		handleRetryFailedChannels,
	};
}
