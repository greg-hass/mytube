import { X } from "lucide-react";
import { useEffect } from "react";
import { useSettingsState } from "../hooks/useSettingsState";
import { useModalFocus } from "../hooks/useModalFocus";
import {
	ApiConfigSection,
	BackupSection,
	DataHealthSection,
	RefreshIssuesSection,
	ServerSection,
	SubscriptionHealthSection,
} from "./SettingsModalSections";

interface SettingsModalProps {
	isOpen: boolean;
	onClose: () => void;
}

export const SettingsModal = ({ isOpen, onClose }: SettingsModalProps) => {
	const state = useSettingsState(onClose);
	useBodyScrollLock(isOpen);
	const modalFocus = useModalFocus<HTMLDivElement>({ isOpen, onClose });

	return (
		isOpen && (
			<>
				<SettingsBackdrop onClose={onClose} />
				<SettingsModalContainer {...modalFocus}>
					<SettingsHeader onClose={onClose} />
					<SettingsBody state={state} />
				</SettingsModalContainer>
			</>
		)
	);
};

// ─── Layout pieces ───────────────────────────────────────────────────────

function SettingsBackdrop({ onClose }: { onClose: () => void }) {
	return (
		<div
			data-testid="settings-backdrop"
			onClick={onClose}
			className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
		/>
	);
}

function useBodyScrollLock(isLocked: boolean) {
	useEffect(() => {
		if (!isLocked) return;

		const body = document.body;
		const html = document.documentElement;
		const scrollY = window.scrollY;
		const previousStyles = {
			bodyOverflow: body.style.overflow,
			bodyPosition: body.style.position,
			bodyTop: body.style.top,
			bodyLeft: body.style.left,
			bodyRight: body.style.right,
			bodyWidth: body.style.width,
			htmlOverflow: html.style.overflow,
		};

		html.style.overflow = "hidden";
		body.style.position = "fixed";
		body.style.top = `-${scrollY}px`;
		body.style.left = "0";
		body.style.right = "0";
		body.style.width = "100%";
		body.style.overflow = "hidden";

		return () => {
			html.style.overflow = previousStyles.htmlOverflow;
			body.style.overflow = previousStyles.bodyOverflow;
			body.style.position = previousStyles.bodyPosition;
			body.style.top = previousStyles.bodyTop;
			body.style.left = previousStyles.bodyLeft;
			body.style.right = previousStyles.bodyRight;
			body.style.width = previousStyles.bodyWidth;
			window.scrollTo({ top: scrollY, behavior: "auto" });
		};
	}, [isLocked]);
}

function SettingsModalContainer({
	children,
	modalRef,
	onKeyDown,
}: {
	children: React.ReactNode;
	modalRef: React.RefObject<HTMLDivElement | null>;
	onKeyDown: React.KeyboardEventHandler<HTMLDivElement>;
}) {
	return (
		<div
			ref={modalRef}
			role="dialog"
			aria-modal="true"
			aria-labelledby="settings-modal-label"
			tabIndex={-1}
			onKeyDown={onKeyDown}
			data-testid="settings-modal-container"
			className="fixed inset-0 z-[100] md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-xl bg-gray-50 dark:bg-ios-950 md:rounded-2xl shadow-2xl flex flex-col h-[100dvh] md:h-auto md:max-h-[85vh] overflow-hidden border border-gray-200 dark:border-ios-800 "
		>
			{children}
		</div>
	);
}

function SettingsHeader({ onClose }: { onClose: () => void }) {
	return (
		<div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-ios-800/80 glass safe-top sticky top-0 z-10">
			<div className="flex items-center gap-3 min-w-0">
				<img
					src="/icon-192.png"
					alt="MyTube"
					className="h-9 w-9 rounded-xl shadow-lg flex-none"
				/>
				<div className="min-w-0">
					<h2 id="settings-modal-title" className="text-lg font-bold tracking-tight">
						<span className="text-gray-900 dark:text-ios-50">My</span>
						<span className="text-red-600 dark:text-red-500">Tube</span>
					</h2>
					<p
						id="settings-modal-label"
						className="text-xs text-gray-500 dark:text-ios-400"
					>
						Settings
					</p>
				</div>
			</div>
			<button
				aria-label="Close Settings"
				onClick={onClose}
				className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-ios-400 dark:hover:bg-ios-800 dark:hover:text-white"
			>
				<X className="w-5 h-5" />
			</button>
		</div>
	);
}

function SettingsBody({
	state,
}: {
	state: ReturnType<typeof useSettingsState>;
}) {
	return (
		<div
			data-testid="settings-modal-body"
			className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-6 custom-scrollbar"
		>
			<ApiConfigSection
				inputKey={state.inputKey}
				setInputKey={state.setInputKey}
				serverApiTokenInput={state.serverApiTokenInput}
				setServerApiTokenInput={state.setServerApiTokenInput}
				isSaved={state.isSaved}
				onSave={state.handleSave}
			/>
			<BackupSection
				backupStatus={state.backupStatus}
				restoreInputRef={state.restoreInputRef}
				restorePreview={state.restorePreview}
				isRestoring={state.isRestoring}
				isResetConfirmationOpen={state.isResetConfirmationOpen}
				isResetting={state.isResetting}
				cachedVideoCount={state.serverHealth?.videos ?? null}
				onDownload={state.handleDownloadBackup}
				onRestoreFile={state.handleRestoreBackup}
				onConfirmRestore={state.handleConfirmRestore}
				onCancelRestore={state.handleCancelRestore}
				onResetCache={state.handleResetFeedCache}
				onConfirmResetCache={state.handleConfirmResetFeedCache}
				onCancelResetCache={state.handleCancelResetFeedCache}
			/>
			<DataHealthSection
				rawSubscriptionCount={state.rawSubscriptions.length}
				watchedCount={state.watchedVideos.size}
				favoriteCount={state.favoriteCount}
				activeFeedFilterCount={state.activeFeedFilterCount}
				storageHealthLabel={state.storageHealthLabel}
			/>
			<SubscriptionHealthSection
				health={state.subscriptionHealth}
				hasYouTubeApiKey={state.hasYouTubeApiKey}
				isRepairing={state.subscriptionRepairAction}
				repairStatus={state.subscriptionRepairStatus}
				onResolveChannelIds={state.handleResolveChannelIds}
				onRepairArtwork={state.handleRepairSubscriptionArtwork}
				isRemovingDuplicateId={state.isRemovingDuplicateId}
				onRemoveSubscription={state.handleRemoveDuplicateSubscription}
			/>
			<ServerSection
				serverStatus={state.serverStatus}
				serverVersion={state.serverVersion}
				serverHealth={state.serverHealth}
			/>
			{state.failedChannels.length > 0 && (
				<RefreshIssuesSection
					failedChannels={state.failedChannels}
					onRetry={state.handleRetryFailedChannels}
					onRetryChannel={state.handleRetryChannel}
					retryingChannelId={state.retryingChannelId}
				/>
			)}
		</div>
	);
}
