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
import { inspectSubscriptionHealth } from "../lib/subscription-health";
import type { StoredSubscription } from "../lib/indexeddb";

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
	const { watchedVideos, apiKey } = useStore();
	const {
		rawSubscriptions,
		syncWithBackend,
		resolveChannelIds,
		repairChannelIcons,
		removeSubscription,
	} = useSubscriptionStorage();

	const [isSaved, setIsSaved] = useState(false);
	const [subscriptionRepairAction, setSubscriptionRepairAction] = useState<
		"ids" | "artwork" | null
	>(null);
	const [subscriptionRepairStatus, setSubscriptionRepairStatus] = useState("");
	const [isRemovingDuplicateId, setIsRemovingDuplicateId] = useState<
		string | null
	>(null);

	const server = useServerStatus();
	const backup = useBackupActions({
		onRestoredApiKey: form.setInputKey,
	});

	const localBackupData = readBackupLocalData();
	const activeFeedFilterCount = countActiveFeedFilters();
	const storageHealthLabel = deriveStorageHealthLabel(server.serverHealth);
	const favoriteCount = localBackupData.favoriteVideoIds?.length || 0;
	const subscriptionHealth = inspectSubscriptionHealth(rawSubscriptions);

	const handleResolveChannelIds = useCallback(async () => {
		if (!apiKey.trim()) {
			setSubscriptionRepairStatus(
				"Save a YouTube Data API key before resolving channel IDs.",
			);
			return;
		}

		setSubscriptionRepairAction("ids");
		setSubscriptionRepairStatus("");
		try {
			await resolveChannelIds();
			setSubscriptionRepairStatus("Channel ID resolution finished.");
		} catch (error) {
			setSubscriptionRepairStatus(
				error instanceof Error
					? error.message
					: "Channel ID resolution failed.",
			);
		} finally {
			setSubscriptionRepairAction(null);
		}
	}, [apiKey, resolveChannelIds]);

	const handleRepairSubscriptionArtwork = useCallback(async () => {
		setSubscriptionRepairAction("artwork");
		setSubscriptionRepairStatus("");
		try {
			const repairedCount = await repairChannelIcons();
			setSubscriptionRepairStatus(
				repairedCount > 0
					? `Repaired artwork for ${repairedCount} channel${repairedCount === 1 ? "" : "s"}.`
					: "No channel artwork was repaired.",
			);
		} catch (error) {
			setSubscriptionRepairStatus(
				error instanceof Error
					? error.message
					: "Channel artwork repair failed.",
			);
		} finally {
			setSubscriptionRepairAction(null);
		}
	}, [repairChannelIcons]);

	const handleRemoveDuplicateSubscription = useCallback(
		async (subscription: StoredSubscription) => {
			const title =
				typeof subscription.title === "string" && subscription.title.trim()
					? subscription.title.trim()
					: subscription.id;
			setIsRemovingDuplicateId(subscription.id);
			setSubscriptionRepairStatus("");
			try {
				await removeSubscription(subscription.id);
				setSubscriptionRepairStatus(`Removed subscription ${title}.`);
			} catch (error) {
				setSubscriptionRepairStatus(
					error instanceof Error
						? error.message
						: "Subscription removal failed.",
				);
				throw error;
			} finally {
				setIsRemovingDuplicateId(null);
			}
		},
		[removeSubscription],
	);

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
		restorePreview: backup.restorePreview,
		isRestoring: backup.isRestoring,
		isResetConfirmationOpen: backup.isResetConfirmationOpen,
		isResetting: backup.isResetting,
		// Server state
		serverHealth: server.serverHealth,
		serverVersion: server.serverVersion,
		serverStatus: server.serverStatus,
		failedChannels: server.failedChannels,
		// Derived stats
		rawSubscriptions,
		watchedVideos,
		activeFeedFilterCount,
		favoriteCount,
		storageHealthLabel,
		subscriptionHealth,
		hasYouTubeApiKey: Boolean(apiKey.trim()),
		subscriptionRepairAction,
		subscriptionRepairStatus,
		isRemovingDuplicateId,
		// Handlers
		handleSave,
		handleDownloadBackup: backup.handleDownloadBackup,
		handleRestoreBackup: backup.handleRestoreBackup,
		handleConfirmRestore: backup.handleConfirmRestore,
		handleCancelRestore: backup.handleCancelRestore,
		handleResetFeedCache: backup.handleResetFeedCache,
		handleConfirmResetFeedCache: backup.handleConfirmResetFeedCache,
		handleCancelResetFeedCache: backup.handleCancelResetFeedCache,
		handleRetryFailedChannels: backup.handleRetryFailedChannels,
		handleRetryChannel: backup.handleRetryChannel,
		retryingChannelId: backup.retryingChannelId,
		handleResolveChannelIds,
		handleRepairSubscriptionArtwork,
		handleRemoveDuplicateSubscription,
	};
}
