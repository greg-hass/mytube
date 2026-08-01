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
import {
	applyRestoredAppBackup,
	createAppBackup,
	parseAppBackup,
	readBackupLocalData,
	type ParsedAppBackup,
} from "../lib/app-backup";
import { clearAllCachedVideos } from "../lib/indexeddb";

export interface UseBackupActionsOptions {
	/** Mirror the persisted apiKey into the local form field when a backup restore changes it. */
	onRestoredApiKey?: (apiKey: string) => void;
}

export interface UseBackupActionsResult {
	backupStatus: string;
	restoreInputRef: React.RefObject<HTMLInputElement | null>;
	restorePreview: BackupRestorePreview | null;
	isRestoring: boolean;
	isResetConfirmationOpen: boolean;
	isResetting: boolean;
	handleDownloadBackup: () => void;
	handleRestoreBackup: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
	handleConfirmRestore: () => Promise<void>;
	handleCancelRestore: () => void;
	handleResetFeedCache: () => void;
	handleConfirmResetFeedCache: () => Promise<void>;
	handleCancelResetFeedCache: () => void;
	handleRetryFailedChannels: () => Promise<void>;
	handleRetryChannel: (channelId: string) => Promise<void>;
	retryingChannelId: string | null;
}

type RawSubscription = ReturnType<typeof useSubscriptionStorage>["rawSubscriptions"][number];
type StatusSetter = (message: string) => void;

export interface BackupRestorePreview {
	fileName: string;
	exportedAt: string | null;
	subscriptionCount: number;
	watchedCount: number;
	favoriteCount: number;
	activeFilterCount: number;
	feedViewCount: number;
	subscriptionGroupCount: number;
}

type PendingRestore = BackupRestorePreview & { backup: ParsedAppBackup };

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
	subscription: ParsedAppBackup["subscriptions"][number],
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
	restored: ParsedAppBackup,
	addSubscriptions: ReturnType<typeof useSubscriptionStorage>["addSubscriptions"],
	setWatchedVideos: (ids: string[]) => void,
	setApiKey: (key: string) => void,
	onRestoredApiKey: ((key: string) => void) | undefined,
	setStatus: StatusSetter,
): Promise<boolean> {
	try {
		await addSubscriptions(restored.subscriptions.map(normalizeRestoredSubscription));
		setWatchedVideos(restored.watchedVideoIds);
		if (restored.settings.apiKey) {
			setApiKey(restored.settings.apiKey);
			onRestoredApiKey?.(restored.settings.apiKey);
		}
		applyRestoredAppBackup(restored);
		setStatus(
			buildRestoreStatus(restored.subscriptions.length, restored.watchedVideoIds.length),
		);
		return true;
	} catch (error) {
		setStatus(errorMessage(error, "Restore failed"));
		return false;
	}
}

async function performFeedCacheReset(
	queryClient: QueryClient,
	setStatus: StatusSetter,
): Promise<boolean> {
	try {
		await clearAllCachedVideos();
		const response = await fetch("/api/videos/cache/reset", { method: "POST" });
		if (!response.ok) {
			throw new Error("Server feed cache reset failed");
		}
		queryClient.invalidateQueries({ queryKey: ["server-videos"] });
		queryClient.invalidateQueries({ queryKey: ["server-videos-status"] });
		setStatus("Feed cache reset");
		return true;
	} catch (error) {
		setStatus(errorMessage(error, "Feed cache reset failed"));
		return false;
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

async function performRetryChannel(
	channelId: string,
	queryClient: QueryClient,
	setStatus: StatusSetter,
): Promise<void> {
	try {
		const response = await fetch(
			`/api/videos/refresh/channel/${encodeURIComponent(channelId)}`,
			{
				method: "POST",
				cache: "no-store",
				credentials: "same-origin",
			},
		);
		if (!response.ok) {
			throw new Error(`Channel refresh failed (${response.status})`);
		}
		queryClient.invalidateQueries({ queryKey: ["server-videos"] });
		queryClient.invalidateQueries({ queryKey: ["server-videos-status"] });
		setStatus("Channel refresh queued");
	} catch (error) {
		setStatus(errorMessage(error, "Channel refresh failed"));
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
	const [restorePreview, setRestorePreview] = useState<PendingRestore | null>(
		null,
	);
	const [isRestoring, setIsRestoring] = useState(false);
	const [isResetConfirmationOpen, setIsResetConfirmationOpen] = useState(false);
	const [isResetting, setIsResetting] = useState(false);
	const [retryingChannelId, setRetryingChannelId] = useState<string | null>(
		null,
	);
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
				const backup = parseAppBackup(await file.text());
				setRestorePreview({
					backup,
					fileName: file.name,
					exportedAt: backup.exportedAt,
					subscriptionCount: backup.subscriptions.length,
					watchedCount: backup.watchedVideoIds.length,
					favoriteCount: backup.favorites.videoIds.length,
					activeFilterCount: Object.values(backup.feedQualityFilters).filter(
						(value) =>
							(typeof value === "boolean" && value) ||
							(typeof value === "string" && value.trim().length > 0 && value !== "any"),
					).length,
					feedViewCount: backup.feedViewPresets.length,
					subscriptionGroupCount: backup.subscriptionGroups.length,
				});
				setBackupStatus("");
			} catch (error) {
				setRestorePreview(null);
				setBackupStatus(errorMessage(error, "Backup preview failed"));
			} finally {
				event.target.value = "";
			}
		},
		[],
	);

	const handleConfirmRestore = useCallback(async () => {
		if (!restorePreview || isRestoring) return;
		setIsRestoring(true);
		try {
			const succeeded = await performBackupRestore(
				restorePreview.backup,
				addSubscriptions,
				setWatchedVideos,
				setApiKey,
				onRestoredApiKey,
				setBackupStatus,
			);
			if (succeeded) setRestorePreview(null);
		} finally {
			setIsRestoring(false);
		}
	}, [
		addSubscriptions,
		isRestoring,
		onRestoredApiKey,
		restorePreview,
		setApiKey,
		setWatchedVideos,
	]);

	const handleCancelRestore = useCallback(() => {
		if (isRestoring) return;
		setRestorePreview(null);
	}, [isRestoring]);

	const handleResetFeedCache = useCallback(() => {
		if (!isResetting) setIsResetConfirmationOpen(true);
	}, [isResetting]);

	const handleConfirmResetFeedCache = useCallback(async () => {
		if (isResetting) return;
		setIsResetting(true);
		try {
			const succeeded = await performFeedCacheReset(queryClient, setBackupStatus);
			if (succeeded) setIsResetConfirmationOpen(false);
		} finally {
			setIsResetting(false);
		}
	}, [isResetting, queryClient]);

	const handleCancelResetFeedCache = useCallback(() => {
		if (!isResetting) setIsResetConfirmationOpen(false);
	}, [isResetting]);

	const handleRetryFailedChannels = useCallback(async () => {
		await performRetryFailedChannels(queryClient, setBackupStatus);
	}, [queryClient]);

	const handleRetryChannel = useCallback(
		async (channelId: string) => {
			setRetryingChannelId(channelId);
			try {
				await performRetryChannel(channelId, queryClient, setBackupStatus);
			} finally {
				setRetryingChannelId(null);
			}
		},
		[queryClient],
	);

	return {
		backupStatus,
		restoreInputRef,
		restorePreview,
		isRestoring,
		isResetConfirmationOpen,
		isResetting,
		handleDownloadBackup,
		handleRestoreBackup,
		handleConfirmRestore,
		handleCancelRestore,
		handleResetFeedCache,
		handleConfirmResetFeedCache,
		handleCancelResetFeedCache,
		handleRetryFailedChannels,
		handleRetryChannel,
		retryingChannelId,
	};
}
