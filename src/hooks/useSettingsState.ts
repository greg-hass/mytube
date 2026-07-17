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
import { setServerApiToken } from "../lib/api-auth";
import { readBackupLocalData } from "../lib/app-backup";
import { useServerStatus } from "../hooks/useServerStatus";
import { useBackupActions } from "../hooks/useBackupActions";
import { useSettingsFormState } from "../hooks/useSettingsFormState";

const SAVED_BANNER_DURATION_MS = 1000;

function countActiveFeedFilters(): number {
	const filters = readBackupLocalData().feedQualityFilters || {};
	return Object.values(filters).filter((value) => {
		if (typeof value === "boolean") return value;
		if (typeof value === "string")
			return value.trim().length > 0 && value !== "any";
		return false;
	}).length;
}

function deriveStorageHealthLabel(
	serverHealth: ReturnType<typeof useServerStatus>["serverHealth"],
): string {
	return serverHealth?.dataIntegrity?.some(
		(event) => event.status === "restored",
	)
		? "Recovered from backup on startup"
		: "Storage healthy";
}

export function useSettingsState(onClose: () => void) {
	const queryClient = useQueryClient();
	const form = useSettingsFormState();
	const { watchedVideos } = useStore();
	const { rawSubscriptions, syncWithBackend } = useSubscriptionStorage();

	const [isSaved, setIsSaved] = useState(false);

	const server = useServerStatus();
	const backup = useBackupActions({
		onRestoredApiKey: form.setInputKey,
	});

	const localBackupData = readBackupLocalData();
	const activeFeedFilterCount = countActiveFeedFilters();
	const storageHealthLabel = deriveStorageHealthLabel(server.serverHealth);
	const queuedCount = localBackupData.queuedVideoIds?.length || 0;
	const favoriteCount = localBackupData.favoriteVideoIds?.length || 0;

	const handleSave = useCallback(() => {
		form.setApiKey(form.inputKey);
		form.setDeepseekApiKey(form.deepseekInputKey);
		form.setCustomApiKey(form.customApiKeyInput);
		form.setLlmProvider(form.llmProviderInput);
		// Derive llmApiKey from the provider-specific key so the Smart
		// Search section doesn't need its own API key field.
		const derivedKey =
			form.llmProviderInput === "deepseek"
				? form.deepseekInputKey
				: form.customApiKeyInput;
		form.setLlmApiKey(derivedKey);
		form.setLlmModel(form.llmModelInput);
		setServerApiToken(form.serverApiTokenInput);
		void syncWithBackend({ importRemoteWatched: true });
		queryClient.invalidateQueries({ queryKey: ["server-videos"] });
		queryClient.invalidateQueries({ queryKey: ["server-videos-status"] });
		setIsSaved(true);
		window.setTimeout(() => {
			setIsSaved(false);
			onClose();
		}, SAVED_BANNER_DURATION_MS);
	}, [form, syncWithBackend, queryClient, onClose]);

	return {
		// Form state (via sub-hook)
		inputKey: form.inputKey,
		setInputKey: form.setInputKey,
		deepseekInputKey: form.deepseekInputKey,
		setDeepseekInputKey: form.setDeepseekInputKey,
		customApiKeyInput: form.customApiKeyInput,
		setCustomApiKeyInput: form.setCustomApiKeyInput,
		llmProviderInput: form.llmProviderInput,
		setLlmProviderInput: form.setLlmProviderInput,
		llmModelInput: form.llmModelInput,
		setLlmModelInput: form.setLlmModelInput,
		serverApiTokenInput: form.serverApiTokenInput,
		setServerApiTokenInput: form.setServerApiTokenInput,
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
