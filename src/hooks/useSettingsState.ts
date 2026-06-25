/**
 * useSettingsState — owns the SettingsModal's state and the
 * save handler. Server-status and backup/retry actions live in
 * dedicated sub-hooks so the main hook stays focused on form
 * state and the save flow.
 */
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useStore } from "../store/useStore";
import { useSubscriptionStorage } from "../hooks/useSubscriptionStorage";
import { getServerApiToken, setServerApiToken } from "../lib/api-auth";
import { readBackupLocalData } from "../lib/app-backup";
import { useServerStatus } from "../hooks/useServerStatus";
import { useBackupActions } from "../hooks/useBackupActions";

const SAVED_BANNER_DURATION_MS = 1000;

function countActiveFeedFilters(): number {
	const filters = readBackupLocalData().feedQualityFilters || {};
	return Object.values(filters).filter((value) => {
		if (typeof value === "boolean") return value;
		if (typeof value === "string") return value.trim().length > 0 && value !== "any";
		return false;
	}).length;
}

function deriveStorageHealthLabel(
	serverHealth: ReturnType<typeof useServerStatus>["serverHealth"],
): string {
	return serverHealth?.dataIntegrity?.some((event) => event.status === "restored")
		? "Recovered from backup on startup"
		: "Storage healthy";
}

export function useSettingsState(onClose: () => void) {
	const queryClient = useQueryClient();
	const {
		apiKey,
		braveApiKey,
		opencodeApiKey,
		setApiKey,
		setBraveApiKey,
		setOpencodeApiKey,
		watchedVideos,
	} = useStore();
	const { rawSubscriptions, syncWithBackend } = useSubscriptionStorage();

	const [inputKey, setInputKey] = useState(apiKey);
	const [braveInputKey, setBraveInputKey] = useState(braveApiKey);
	const [opencodeInputKey, setOpencodeInputKey] = useState(opencodeApiKey);
	const [serverApiTokenInput, setServerApiTokenInput] = useState(() =>
		getServerApiToken(),
	);
	const [isSaved, setIsSaved] = useState(false);

	const server = useServerStatus();
	const backup = useBackupActions({
		onRestoredApiKey: setInputKey,
	});

	const localBackupData = readBackupLocalData();
	const activeFeedFilterCount = countActiveFeedFilters();
	const storageHealthLabel = deriveStorageHealthLabel(server.serverHealth);
	const queuedCount = localBackupData.queuedVideoIds?.length || 0;
	const favoriteCount = localBackupData.favoriteVideoIds?.length || 0;

	const handleSave = useCallback(() => {
		setApiKey(inputKey);
		setBraveApiKey(braveInputKey);
		setOpencodeApiKey(opencodeInputKey);
		setServerApiToken(serverApiTokenInput);
		void syncWithBackend({ importRemoteWatched: true });
		queryClient.invalidateQueries({ queryKey: ["server-videos"] });
		queryClient.invalidateQueries({ queryKey: ["server-videos-status"] });
		setIsSaved(true);
		window.setTimeout(() => {
			setIsSaved(false);
			onClose();
		}, SAVED_BANNER_DURATION_MS);
	}, [
		inputKey,
		braveInputKey,
		opencodeInputKey,
		serverApiTokenInput,
		setApiKey,
		setBraveApiKey,
		setOpencodeApiKey,
		syncWithBackend,
		queryClient,
		onClose,
	]);

	return {
		// Form state
		inputKey,
		setInputKey,
		braveInputKey,
		setBraveInputKey,
		opencodeInputKey,
		setOpencodeInputKey,
		serverApiTokenInput,
		setServerApiTokenInput,
		isSaved,
		// Backup state
		backupStatus: backup.backupStatus,
		restoreInputRef: backup.restoreInputRef,
		// Server state
		serverHealth: server.serverHealth,
		serverVersion: server.serverVersion,
		serverStatus: server.serverStatus,
		failedChannels: server.failedChannels,
		// Derived stats
		rawSubscriptions,
		watchedVideos,
		activeFeedFilterCount,
		queuedCount,
		favoriteCount,
		storageHealthLabel,
		// Handlers
		handleSave,
		handleDownloadBackup: backup.handleDownloadBackup,
		handleRestoreBackup: backup.handleRestoreBackup,
		handleResetFeedCache: backup.handleResetFeedCache,
		handleRetryFailedChannels: backup.handleRetryFailedChannels,
	};
}
