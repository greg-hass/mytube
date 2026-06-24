import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
	X,
	Key,
	CheckCircle2,
	ShieldCheck,
	Download,
	Upload,
	Database,
	Server,
} from "lucide-react";
import { useStore } from "../store/useStore";
import { useSubscriptionStorage } from "../hooks/useSubscriptionStorage";
import {
	createAppBackup,
	readBackupLocalData,
	restoreAppBackup,
} from "../lib/app-backup";
import { getServerApiToken, setServerApiToken } from "../lib/api-auth";
import { clearAllCachedVideos } from "../lib/indexeddb";
import { useQueryClient } from "@tanstack/react-query";

interface SettingsModalProps {
	isOpen: boolean;
	onClose: () => void;
}

type ServerHealth = {
	status: string;
	subscriptions: number;
	videos: number;
	lastUpdated: string | null;
	dataIntegrity?: Array<{
		file: string;
		status: "ok" | "initialized" | "restored";
		backupFile: string | null;
	}>;
};

type ServerVersion = {
	version: string;
	appVersion?: string;
};

type FailedChannel = {
	id: string;
	title: string;
	reason: string;
};

export const SettingsModal = ({ isOpen, onClose }: SettingsModalProps) => {
	const queryClient = useQueryClient();
	const {
		apiKey,
		braveApiKey,
		setApiKey,
		setBraveApiKey,
		watchedVideos,
		setWatchedVideos,
	} = useStore();
	const { rawSubscriptions, addSubscriptions, syncWithBackend } =
		useSubscriptionStorage();
	const [inputKey, setInputKey] = useState(apiKey);
	const [braveInputKey, setBraveInputKey] = useState(braveApiKey);
	const [serverApiTokenInput, setServerApiTokenInput] = useState(() =>
		getServerApiToken(),
	);
	const [isSaved, setIsSaved] = useState(false);
	const [backupStatus, setBackupStatus] = useState("");
	const [serverHealth, setServerHealth] = useState<ServerHealth | null>(null);
	const [serverVersion, setServerVersion] = useState<ServerVersion | null>(
		null,
	);
	const [failedChannels, setFailedChannels] = useState<FailedChannel[]>([]);
	const [serverStatus, setServerStatus] = useState<
		"checking" | "online" | "offline"
	>("checking");
	const restoreInputRef = useRef<HTMLInputElement>(null);
	const localBackupData = readBackupLocalData();
	const activeFeedFilterCount = Object.values(
		localBackupData.feedQualityFilters || {},
	).filter((value) => {
		if (typeof value === "boolean") return value;
		if (typeof value === "string")
			return value.trim().length > 0 && value !== "any";
		return false;
	}).length;
	const storageHealthLabel = serverHealth?.dataIntegrity?.some(
		(event) => event.status === "restored",
	)
		? "Recovered from backup on startup"
		: "Storage healthy";

	const handleSave = () => {
		setApiKey(inputKey);
		setBraveApiKey(braveInputKey);
		setServerApiToken(serverApiTokenInput);
		void syncWithBackend({ importRemoteWatched: true });
		queryClient.invalidateQueries({ queryKey: ["server-videos"] });
		queryClient.invalidateQueries({ queryKey: ["server-videos-status"] });
		setIsSaved(true);
		setTimeout(() => {
			setIsSaved(false);
			onClose();
		}, 1000);
	};

	useEffect(() => {
		if (!isOpen) return;

		let isCancelled = false;

		const fetchServerStatus = async () => {
			try {
				const [healthResponse, versionResponse] = await Promise.all([
					fetch("/api/health"),
					fetch("/api/version"),
				]);
				if (!healthResponse.ok || !versionResponse.ok) {
					throw new Error("Server status unavailable");
				}
				const [health, version] = await Promise.all([
					healthResponse.json(),
					versionResponse.json(),
				]);
				if (isCancelled) return;
				setServerHealth(health);
				setServerVersion(version);
				setServerStatus("online");

				const statusResponse = await fetch("/api/videos/status");
				if (statusResponse.ok && !isCancelled) {
					const status = await statusResponse.json();
					setFailedChannels(
						Array.isArray(status.failedChannels) ? status.failedChannels : [],
					);
				}
			} catch {
				if (!isCancelled) {
					setServerStatus("offline");
				}
			}
		};

		void fetchServerStatus();

		return () => {
			isCancelled = true;
		};
	}, [isOpen]);

	const handleDownloadBackup = () => {
		const backup = createAppBackup({
			subscriptions: rawSubscriptions,
			watchedVideoIds: Array.from(watchedVideos),
			settings: { apiKey },
			localData: readBackupLocalData(),
		});
		const blob = new Blob([JSON.stringify(backup, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `mytube-backup-${new Date().toISOString().split("T")[0]}.json`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
		setBackupStatus("Backup downloaded");
	};

	const handleRestoreBackup = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;

		try {
			const restored = restoreAppBackup(await file.text());
			await addSubscriptions(
				restored.subscriptions.map((subscription) => ({
					...subscription,
					title: subscription.title,
					thumbnail: subscription.thumbnail || "",
					description: subscription.description || "",
					addedAt: subscription.addedAt || Date.now(),
				})),
			);
			setWatchedVideos(restored.watchedVideoIds);
			if (restored.settings.apiKey) {
				setApiKey(restored.settings.apiKey);
				setInputKey(restored.settings.apiKey);
			}
			setBackupStatus(
				`Backup restored: ${restored.subscriptions.length} subscription${restored.subscriptions.length === 1 ? "" : "s"} and ${restored.watchedVideoIds.length} watched video${restored.watchedVideoIds.length === 1 ? "" : "s"}`,
			);
		} catch (error) {
			setBackupStatus(
				error instanceof Error ? error.message : "Restore failed",
			);
		} finally {
			event.target.value = "";
		}
	};

	const handleResetFeedCache = async () => {
		try {
			await clearAllCachedVideos();
			const response = await fetch("/api/videos/cache/reset", {
				method: "POST",
			});
			if (!response.ok) {
				throw new Error("Server feed cache reset failed");
			}
			queryClient.invalidateQueries({ queryKey: ["server-videos"] });
			queryClient.invalidateQueries({ queryKey: ["server-videos-status"] });
			setBackupStatus("Feed cache reset");
		} catch (error) {
			setBackupStatus(
				error instanceof Error ? error.message : "Feed cache reset failed",
			);
		}
	};

	const handleRetryFailedChannels = async () => {
		try {
			const response = await fetch("/api/videos/refresh", { method: "POST" });
			if (!response.ok) {
				throw new Error("Retry failed");
			}
			queryClient.invalidateQueries({ queryKey: ["server-videos"] });
			queryClient.invalidateQueries({ queryKey: ["server-videos-status"] });
			setBackupStatus("Retry started");
		} catch (error) {
			setBackupStatus(error instanceof Error ? error.message : "Retry failed");
		}
	};

	const inputClass =
		"w-full pl-4 pr-10 py-2.5 rounded-lg bg-gray-100 dark:bg-ios-800/90 border-2 border-transparent focus:border-red-500 transition-all outline-none text-sm";

	const primaryBtnClass =
		"w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium bg-gray-800 dark:bg-ios-700 text-white hover:bg-gray-700 dark:hover:bg-ios-600 transition-colors";

	const secondaryBtnClass =
		"w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium bg-gray-100 text-gray-900 hover:bg-gray-200 dark:bg-ios-800/90 dark:text-ios-100 dark:hover:bg-ios-700 transition-colors";

	const cardClass =
		"rounded-xl border border-gray-200 dark:border-ios-800 bg-white dark:bg-ios-900 space-y-4";

	const statItemClass =
		"rounded-lg border border-gray-200 dark:border-ios-800 bg-white dark:bg-ios-900 px-3 py-3 text-sm font-medium text-gray-800 dark:text-ios-100";

	return (
		<AnimatePresence>
			{isOpen && (
				<>
					{/* Backdrop */}
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						onClick={onClose}
						className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
					/>

					{/* Modal */}
					<motion.div
						initial={{ opacity: 0, scale: 0.95, y: 20 }}
						animate={{ opacity: 1, scale: 1, y: 0 }}
						exit={{ opacity: 0, scale: 0.95, y: 20 }}
						className="fixed inset-0 z-[100] md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-xl bg-gray-50 dark:bg-ios-950 md:rounded-2xl shadow-2xl flex flex-col h-[100dvh] md:h-auto md:max-h-[85vh] overflow-hidden border border-gray-200 dark:border-ios-800 pt-[env(safe-area-inset-top)] md:pt-0"
					>
						{/* Header — glass, matching app Header */}
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
									<p className="text-xs text-gray-500 dark:text-ios-400">
										Settings
									</p>
								</div>
							</div>
							<button
								onClick={onClose}
								className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-ios-400 dark:hover:bg-ios-800 dark:hover:text-white"
							>
								<X className="w-5 h-5" />
							</button>
						</div>

						{/* Content */}
						<div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
							{/* API Configuration Section */}
							<section className="space-y-3">
								<div className="flex items-center gap-2 text-red-600">
									<Key className="w-4 h-4" />
									<h3 className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-ios-400">
										API Configuration
									</h3>
								</div>

								<div className={`${cardClass} p-4`}>
									<div className="space-y-2">
										<label className="text-sm font-medium text-gray-700 dark:text-ios-300">
											YouTube Data API Key
										</label>
										<div className="relative">
											<input
												type="password"
												value={inputKey}
												onChange={(e: ChangeEvent<HTMLInputElement>) =>
													setInputKey(e.target.value)
												}
												placeholder="Enter your API key..."
												className={inputClass}
											/>
											<div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
												{isSaved ? (
													<CheckCircle2 className="w-4 h-4 text-green-500" />
												) : (
													<ShieldCheck className="w-4 h-4" />
												)}
											</div>
										</div>
										<p className="text-xs text-gray-500 dark:text-ios-400">
											Optional browser-only fallback for channel handle
											resolution. Backups and server sync do not include this
											key.{" "}
											<a
												href="https://console.cloud.google.com/apis/credentials"
												target="_blank"
												rel="noopener noreferrer"
												className="text-red-600 hover:underline ml-1"
											>
												Get a key
											</a>
										</p>
									</div>

									<div className="space-y-2">
										<label className="text-sm font-medium text-gray-700 dark:text-ios-300">
											Brave Search API Key
										</label>
										<div className="relative">
											<input
												type="password"
												value={braveInputKey}
												onChange={(e: ChangeEvent<HTMLInputElement>) =>
													setBraveInputKey(e.target.value)
												}
												placeholder="Enter your Brave Search API key..."
												className={inputClass}
											/>
											<div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
												{isSaved ? (
													<CheckCircle2 className="w-4 h-4 text-green-500" />
												) : (
													<ShieldCheck className="w-4 h-4" />
												)}
											</div>
										</div>
										<p className="text-xs text-gray-500 dark:text-ios-400">
											Used for Brave fallback channel search only. Stored in
											this browser and not sent to the server.{" "}
											<a
												href="https://brave.com/search/api/"
												target="_blank"
												rel="noopener noreferrer"
												className="text-red-600 hover:underline ml-1"
											>
												Get a key
											</a>
										</p>
									</div>

									<div className="space-y-2">
										<label className="text-sm font-medium text-gray-700 dark:text-ios-300">
											Server API Token
										</label>
										<div className="relative">
											<input
												type="password"
												value={serverApiTokenInput}
												onChange={(e: ChangeEvent<HTMLInputElement>) =>
													setServerApiTokenInput(e.target.value)
												}
												placeholder="Match the required SERVER_API_TOKEN"
												className={inputClass}
											/>
											<div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
												<ShieldCheck className="w-4 h-4" />
											</div>
										</div>
										<p className="text-xs text-gray-500 dark:text-ios-400">
											Stored only in this browser and sent as a bearer token to
											same-origin API requests.
										</p>
									</div>

									<button
										onClick={handleSave}
										disabled={isSaved}
										className={`${isSaved ? "bg-green-600 dark:bg-green-700 hover:bg-green-700 dark:hover:bg-green-800" : ""} ${primaryBtnClass}`}
									>
										{isSaved ? (
											<>
												<CheckCircle2 className="h-4 w-4" />
												Saved Successfully
											</>
										) : (
											"Save Changes"
										)}
									</button>
								</div>
							</section>

							<section className="space-y-3">
								<div className="flex items-center gap-2 text-red-600">
									<ShieldCheck className="w-4 h-4" />
									<h3 className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-ios-400">
										Backup & Restore
									</h3>
								</div>

								<div className={`${cardClass} p-4`}>
									<p className="text-sm text-gray-600 dark:text-ios-300">
										Subscriptions, watched videos, favorites, queue, feed
										filters, groups, and settings.
									</p>
									<input
										ref={restoreInputRef}
										type="file"
										accept="application/json,.json"
										onChange={handleRestoreBackup}
										className="hidden"
									/>
									<button
										type="button"
										onClick={handleDownloadBackup}
										className={primaryBtnClass}
									>
										<Download className="h-4 w-4" />
										Download Backup
									</button>
									<button
										type="button"
										onClick={() => restoreInputRef.current?.click()}
										className={secondaryBtnClass}
									>
										<Upload className="h-4 w-4" />
										Restore Backup
									</button>
									<button
										type="button"
										onClick={handleResetFeedCache}
										className={secondaryBtnClass}
									>
										Reset Feed Cache
									</button>
									{backupStatus && (
										<p className="text-sm text-gray-600 dark:text-ios-300">
											{backupStatus}
										</p>
									)}
								</div>
							</section>

							<section className="space-y-3">
								<div className="flex items-center gap-2 text-red-600">
									<Database className="w-4 h-4" />
									<h3 className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-ios-400">
										Data Health
									</h3>
								</div>

								<div className="grid grid-cols-2 gap-2">
									{[
										`${rawSubscriptions.length} subscription${rawSubscriptions.length === 1 ? "" : "s"}`,
										`${watchedVideos.size} watched`,
										`${localBackupData.queuedVideoIds?.length || 0} queued`,
										`${localBackupData.favoriteVideoIds?.length || 0} favorite${(localBackupData.favoriteVideoIds?.length || 0) === 1 ? "" : "s"}`,
										`${activeFeedFilterCount} feed filter${activeFeedFilterCount === 1 ? "" : "s"}`,
										storageHealthLabel,
									].map((item) => (
										<div key={item} className={statItemClass}>
											{item}
										</div>
									))}
								</div>
							</section>

							<section className="space-y-3">
								<div className="flex items-center gap-2 text-red-600">
									<Server className="w-4 h-4" />
									<h3 className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-ios-400">
										Server
									</h3>
								</div>

								<div className="grid grid-cols-2 gap-2">
									{[
										serverStatus === "online"
											? "Online"
											: serverStatus === "offline"
												? "Offline"
												: "Checking",
										`Server ${serverVersion?.version || "unknown"}`,
										`App ${serverVersion?.appVersion || "unknown"}`,
										`${serverHealth?.subscriptions ?? 0} server subscription${serverHealth?.subscriptions === 1 ? "" : "s"}`,
										`${serverHealth?.videos ?? 0} cached video${serverHealth?.videos === 1 ? "" : "s"}`,
									].map((item) => (
										<div key={item} className={statItemClass}>
											{item}
										</div>
									))}
								</div>
							</section>

							{failedChannels.length > 0 && (
								<section className="space-y-3">
									<div className="flex items-center gap-2 text-red-600">
										<ShieldCheck className="w-4 h-4" />
										<h3 className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-ios-400">
											Refresh Issues
										</h3>
									</div>

									<div className="space-y-2">
										<button
											type="button"
											onClick={handleRetryFailedChannels}
											className={primaryBtnClass}
										>
											Retry Failed Channels
										</button>
										{failedChannels.map((channel) => (
											<div
												key={channel.id}
												className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm dark:border-amber-900/60 dark:bg-amber-950/30"
											>
												<p className="font-medium text-gray-900 dark:text-ios-100">
													{channel.title}
												</p>
												<p className="mt-1 text-xs text-gray-600 dark:text-ios-300">
													{channel.reason}
												</p>
											</div>
										))}
									</div>
								</section>
							)}
						</div>
					</motion.div>
				</>
			)}
		</AnimatePresence>
	);
};
