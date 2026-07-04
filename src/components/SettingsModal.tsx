import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useSettingsState } from "../hooks/useSettingsState";
import {
	ApiConfigSection,
	BackupSection,
	DataHealthSection,
	RefreshIssuesSection,
	ServerSection,
} from "./SettingsModalSections";

interface SettingsModalProps {
	isOpen: boolean;
	onClose: () => void;
}

export const SettingsModal = ({ isOpen, onClose }: SettingsModalProps) => {
	const state = useSettingsState(onClose);

	return (
		<AnimatePresence>
			{isOpen && (
				<>
					<SettingsBackdrop onClose={onClose} />
					<SettingsModalContainer>
						<SettingsHeader onClose={onClose} />
						<SettingsBody state={state} />
					</SettingsModalContainer>
				</>
			)}
		</AnimatePresence>
	);
};

// ─── Layout pieces ───────────────────────────────────────────────────────

function SettingsBackdrop({ onClose }: { onClose: () => void }) {
	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			onClick={onClose}
			className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
		/>
	);
}

function SettingsModalContainer({ children }: { children: React.ReactNode }) {
	return (
		<motion.div
			initial={{ opacity: 0, scale: 0.95, y: 20 }}
			animate={{ opacity: 1, scale: 1, y: 0 }}
			exit={{ opacity: 0, scale: 0.95, y: 20 }}
			className="fixed inset-0 z-[100] md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-xl bg-gray-50 dark:bg-ios-950 md:rounded-2xl shadow-2xl flex flex-col h-[100dvh] md:h-auto md:max-h-[85vh] overflow-hidden border border-gray-200 dark:border-ios-800 "
		>
			{children}
		</motion.div>
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
					<h2 className="text-lg font-bold tracking-tight">
						<span className="text-gray-900 dark:text-ios-50">My</span>
						<span className="text-red-600 dark:text-red-500">Tube</span>
					</h2>
					<p className="text-xs text-gray-500 dark:text-ios-400">Settings</p>
				</div>
			</div>
			<button
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
		<div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
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
				onDownload={state.handleDownloadBackup}
				onRestoreFile={state.handleRestoreBackup}
				onResetCache={state.handleResetFeedCache}
			/>
			<DataHealthSection
				rawSubscriptionCount={state.rawSubscriptions.length}
				watchedCount={state.watchedVideos.size}
				queuedCount={state.queuedCount}
				favoriteCount={state.favoriteCount}
				activeFeedFilterCount={state.activeFeedFilterCount}
				storageHealthLabel={state.storageHealthLabel}
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
				/>
			)}
		</div>
	);
}
