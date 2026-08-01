/**
 * SettingsModalSections — focused subcomponents for SettingsModal.
 * Each section is a small focused function with low cyclomatic
 * complexity, so the SettingsModal body just orchestrates them.
 */
import {
	useState,
	useCallback,
	useEffect,
	type ChangeEvent,
	type RefObject,
} from "react";
import {
	Key,
	ShieldCheck,
	Download,
	Upload,
	Database,
	Server,
	CheckCircle2,
	Brain,
	RotateCw,
	Loader2,
	Trash2,
} from "lucide-react";
import { useStore } from "../store/useStore";
import type {
	ServerHealth,
	ServerVersion,
	FailedChannel,
} from "../types/server";
import type { ServerStatus } from "../hooks/useServerStatus";
import type { StoredSubscription } from "../lib/indexeddb";
import type { SubscriptionHealth } from "../lib/subscription-health";
import { getRefreshFailureGuidance } from "../lib/refresh-failure";
import type { BackupRestorePreview } from "../hooks/useBackupActions";

const SETTINGS_CLASSES = {
	card: "rounded-xl border border-gray-200 dark:border-ios-800 bg-white dark:bg-ios-900 space-y-4",
	input:
		"w-full pl-4 pr-10 py-2.5 rounded-lg bg-gray-100 dark:bg-ios-800/90 border-2 border-transparent focus:border-red-500 transition-all outline-none text-sm",
	primaryBtn:
		"w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium bg-gray-800 dark:bg-ios-700 text-white hover:bg-gray-700 dark:hover:bg-ios-600 transition-colors",
	secondaryBtn:
		"w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium bg-gray-100 text-gray-900 hover:bg-gray-200 dark:bg-ios-800/90 dark:text-ios-100 dark:hover:bg-ios-700 transition-colors",
	statItem:
		"rounded-lg border border-gray-200 dark:border-ios-800 bg-white dark:bg-ios-900 px-3 py-3 text-sm font-medium text-gray-800 dark:text-ios-100",
} as const;

// ─── Section header ───────────────────────────────────────────────────────

export function SectionHeader({
	icon,
	children,
}: {
	icon: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-center gap-2 text-red-600">
			{icon}
			<h3 className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-ios-400">
				{children}
			</h3>
		</div>
	);
}

// ─── API configuration section ───────────────────────────────────────────

export function ApiConfigSection({
	inputKey,
	setInputKey,
	serverApiTokenInput,
	setServerApiTokenInput,
	isSaved,
	onSave,
}: {
	inputKey: string;
	setInputKey: (v: string) => void;
	serverApiTokenInput: string;
	setServerApiTokenInput: (v: string) => void;
	isSaved: boolean;
	onSave: () => void;
}) {
	return (
		<section className="space-y-3">
			<SectionHeader icon={<Key className="w-4 h-4" />}>
				API Configuration
			</SectionHeader>
			<div className={`${SETTINGS_CLASSES.card} p-4`}>
				<ApiKeyField
					label="YouTube Data API Key"
					value={inputKey}
					onChange={setInputKey}
					placeholder="Enter your API key..."
					isSaved={isSaved}
					description={
						<>
							Optional fallback for channel discovery. It is sent only to
							your same-origin MyTube server and is not included in backups
							or sync data.{" "}
							<a
								href="https://console.cloud.google.com/apis/credentials"
								target="_blank"
								rel="noopener noreferrer"
								className="text-red-600 hover:underline ml-1"
							>
								Get a key
							</a>
						</>
					}
				/>
				<ApiKeyField
					label="Server API Token"
					value={serverApiTokenInput}
					onChange={setServerApiTokenInput}
					placeholder="Match the required SERVER_API_TOKEN"
					isSaved={false}
					description={
						<>
							Stored only in this browser and sent as a bearer token to
							same-origin API requests.
						</>
					}
				/>
				<button
					onClick={onSave}
					disabled={isSaved}
					className={`${isSaved ? "bg-green-600 dark:bg-green-700 hover:bg-green-700 dark:hover:bg-green-800" : ""} ${SETTINGS_CLASSES.primaryBtn}`}
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
	);
}

function ApiKeyField({
	label,
	labelExtra,
	value,
	onChange,
	placeholder,
	isSaved,
	description,
	type = "password",
}: {
	label: string;
	labelExtra?: string;
	value: string;
	onChange: (v: string) => void;
	placeholder: string;
	isSaved: boolean;
	description: React.ReactNode;
	type?: "text" | "password";
}) {
	return (
		<div className="space-y-2">
			<label className="text-sm font-medium text-gray-700 dark:text-ios-300">
				{label}
				{labelExtra && (
					<span className="ml-2 text-xs text-gray-500 dark:text-ios-400 font-normal">
						{labelExtra}
					</span>
				)}
			</label>
			<div className="relative">
				<input
					type={type}
					value={value}
					onChange={(e: ChangeEvent<HTMLInputElement>) =>
						onChange(e.target.value)
					}
					placeholder={placeholder}
					className={SETTINGS_CLASSES.input}
				/>
				<div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
					{isSaved ? (
						<CheckCircle2 className="w-4 h-4 text-green-500" />
					) : (
						<ShieldCheck className="w-4 h-4" />
					)}
				</div>
			</div>
			<p className="text-xs text-gray-500 dark:text-ios-400">{description}</p>
		</div>
	);
}

function ModelSelector({
	model,
	setModel,
	models,
	modelsLoading,
	modelsError,
	onRefresh,
	provider,
	providerLabel,
}: {
	model: string;
	setModel: (v: string) => void;
	models: string[];
	modelsLoading: boolean;
	modelsError: string | null;
	onRefresh: () => void;
	provider: string;
	providerLabel: string;
}) {
	return (
		<div className="space-y-2">
			<label className="text-sm font-medium text-gray-700 dark:text-ios-300">
				Model
			</label>
			<div className="flex gap-2">
				{models.length > 0 ? (
					<select
						value={model}
						onChange={(e: ChangeEvent<HTMLSelectElement>) =>
							setModel(e.target.value)
						}
						className={`${SETTINGS_CLASSES.input} flex-1 appearance-none cursor-pointer`}
					>
						{!models.includes(model) && model && (
							<option value={model}>{model} (custom)</option>
						)}
						{models.map((m) => (
							<option key={m} value={m}>
								{m}
							</option>
						))}
					</select>
				) : (
					<input
						type="text"
						value={model}
						onChange={(e: ChangeEvent<HTMLInputElement>) =>
							setModel(e.target.value)
						}
						placeholder="big-pickle, deepseek-v4-flash, etc."
						className={`${SETTINGS_CLASSES.input} flex-1`}
					/>
				)}
				<button
					type="button"
					onClick={onRefresh}
					disabled={modelsLoading || provider === "custom"}
					className="px-3 py-2.5 rounded-lg bg-gray-100 dark:bg-ios-800/90 hover:bg-gray-200 dark:hover:bg-ios-700 disabled:opacity-40 transition-colors shrink-0"
					title="Refresh models from API"
				>
					{modelsLoading ? (
						<Loader2 className="w-4 h-4 animate-spin" />
					) : (
						<RotateCw className="w-4 h-4" />
					)}
				</button>
			</div>
			<p className="text-xs text-gray-500 dark:text-ios-400">
				{models.length > 0 && modelsError
					? `${models.length} models available (live fetch failed: ${modelsError}).`
					: models.length > 0
						? `${models.length} models available for ${providerLabel}.`
						: modelsLoading
							? "Loading available models..."
							: modelsError
								? `Could not load models (${modelsError}). Type manually or refresh.`
								: provider === "custom"
									? "Enter the model name for your custom endpoint."
									: "No models loaded. Refresh to fetch available models."}
			</p>
		</div>
	);
}

export function BackupSection({
	backupStatus,
	restoreInputRef,
	restorePreview,
	isRestoring,
	isResetConfirmationOpen,
	isResetting,
	cachedVideoCount,
	onDownload,
	onRestoreFile,
	onConfirmRestore,
	onCancelRestore,
	onResetCache,
	onConfirmResetCache,
	onCancelResetCache,
}: {
	backupStatus: string;
	restoreInputRef: RefObject<HTMLInputElement | null>;
	restorePreview: BackupRestorePreview | null;
	isRestoring: boolean;
	isResetConfirmationOpen: boolean;
	isResetting: boolean;
	cachedVideoCount: number | null;
	onDownload: () => void;
	onRestoreFile: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
	onConfirmRestore: () => Promise<void>;
	onCancelRestore: () => void;
	onResetCache: () => void;
	onConfirmResetCache: () => Promise<void>;
	onCancelResetCache: () => void;
}) {
	const formatExportedAt = (value: string | null) => {
		if (!value) return "Export date unavailable";
		const date = new Date(value);
		return Number.isNaN(date.getTime())
			? "Export date unavailable"
			: `Exported ${date.toLocaleString()}`;
	};

	return (
		<section className="space-y-3">
			<SectionHeader icon={<ShieldCheck className="w-4 h-4" />}>
				Backup &amp; Restore
			</SectionHeader>
			<div className={`${SETTINGS_CLASSES.card} p-4`}>
				<p className="text-sm text-gray-600 dark:text-ios-300">
					Subscriptions, watched videos, favorites, feed filters, groups,
					and settings.
				</p>
				<input
					ref={restoreInputRef}
					type="file"
					accept="application/json,.json"
					onChange={onRestoreFile}
					className="hidden"
				/>
				<button
					type="button"
					onClick={onDownload}
					className={SETTINGS_CLASSES.primaryBtn}
				>
					<Download className="h-4 w-4" />
					Download Backup
				</button>
				<button
					type="button"
					onClick={() => restoreInputRef.current?.click()}
					className={SETTINGS_CLASSES.secondaryBtn}
				>
					<Upload className="h-4 w-4" />
					Restore Backup
				</button>
				<button
					type="button"
					onClick={onResetCache}
					className={SETTINGS_CLASSES.secondaryBtn}
				>
					Reset Feed Cache
				</button>
				{restorePreview && (
					<div
						role="alertdialog"
						aria-labelledby="restore-backup-review-title"
						className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/30"
						data-testid="restore-backup-review"
					>
						<div>
							<h4
								id="restore-backup-review-title"
								className="text-sm font-semibold text-gray-900 dark:text-ios-100"
							>
								Review backup restore
							</h4>
							<p className="mt-1 break-all text-xs text-gray-600 dark:text-ios-300">
								{restorePreview.fileName} · {formatExportedAt(restorePreview.exportedAt)}
							</p>
						</div>
						<div className="grid grid-cols-2 gap-2 text-xs text-gray-700 dark:text-ios-200">
							<div className={SETTINGS_CLASSES.statItem}>
								{restorePreview.subscriptionCount} subscription{restorePreview.subscriptionCount === 1 ? "" : "s"}
							</div>
							<div className={SETTINGS_CLASSES.statItem}>
								{restorePreview.watchedCount} watched video{restorePreview.watchedCount === 1 ? "" : "s"}
							</div>
							<div className={SETTINGS_CLASSES.statItem}>
								{restorePreview.favoriteCount} favorite video{restorePreview.favoriteCount === 1 ? "" : "s"}
							</div>
							<div className={SETTINGS_CLASSES.statItem}>
								{restorePreview.activeFilterCount} active filter{restorePreview.activeFilterCount === 1 ? "" : "s"}
							</div>
							<div className={SETTINGS_CLASSES.statItem}>
								{restorePreview.feedViewCount} saved view{restorePreview.feedViewCount === 1 ? "" : "s"}
							</div>
							<div className={SETTINGS_CLASSES.statItem}>
								{restorePreview.subscriptionGroupCount} subscription group{restorePreview.subscriptionGroupCount === 1 ? "" : "s"}
							</div>
						</div>
						<p className="text-xs leading-5 text-gray-700 dark:text-ios-200">
							Existing subscriptions stay in place. Watched state, favorites, and feed preferences will be replaced only after you confirm.
						</p>
						<div className="flex gap-2">
							<button
								type="button"
								onClick={() => void onConfirmRestore()}
								disabled={isRestoring}
								className="flex-1 rounded-lg bg-amber-700 px-3 py-2 text-xs font-medium text-white hover:bg-amber-800 disabled:cursor-wait disabled:opacity-60"
							>
								{isRestoring ? "Restoring..." : "Confirm restore"}
							</button>
							<button
								type="button"
								onClick={onCancelRestore}
								disabled={isRestoring}
								className="rounded-lg px-3 py-2 text-xs font-medium text-gray-700 hover:bg-amber-100 dark:text-ios-200 dark:hover:bg-amber-900/40"
							>
								Cancel
							</button>
						</div>
					</div>
				)}
				{isResetConfirmationOpen && (
					<div
						role="alertdialog"
						aria-labelledby="reset-feed-cache-review-title"
						className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/60 dark:bg-red-950/30"
						data-testid="reset-feed-cache-review"
					>
						<div>
							<h4
								id="reset-feed-cache-review-title"
								className="text-sm font-semibold text-gray-900 dark:text-ios-100"
							>
								Reset feed cache?
							</h4>
							<p className="mt-1 text-xs leading-5 text-gray-700 dark:text-ios-200">
								{cachedVideoCount === null
									? "The current cached video count is unavailable."
									: `This will remove ${cachedVideoCount} cached video${cachedVideoCount === 1 ? "" : "s"} from the browser and server.`}
							</p>
						</div>
						<p className="text-xs leading-5 text-gray-700 dark:text-ios-200">
							Subscriptions, watched state, favorites, and settings will remain unchanged.
						</p>
						<div className="flex gap-2">
							<button
								type="button"
								onClick={() => void onConfirmResetCache()}
								disabled={isResetting}
								className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-wait disabled:opacity-60"
							>
								{isResetting ? "Resetting..." : "Confirm reset"}
							</button>
							<button
								type="button"
								onClick={onCancelResetCache}
								disabled={isResetting}
								className="rounded-lg px-3 py-2 text-xs font-medium text-gray-700 hover:bg-red-100 dark:text-ios-200 dark:hover:bg-red-900/40"
							>
								Cancel
							</button>
						</div>
					</div>
				)}
				{backupStatus && (
					<p className="text-sm text-gray-600 dark:text-ios-300" role="status">
						{backupStatus}
					</p>
				)}
			</div>
		</section>
	);
}

// ─── Data health section ─────────────────────────────────────────────────

export function DataHealthSection({
	rawSubscriptionCount,
	watchedCount,
	favoriteCount,
	activeFeedFilterCount,
	storageHealthLabel,
}: {
	rawSubscriptionCount: number;
	watchedCount: number;
	favoriteCount: number;
	activeFeedFilterCount: number;
	storageHealthLabel: string;
}) {
	const items = [
		`${rawSubscriptionCount} subscription${rawSubscriptionCount === 1 ? "" : "s"}`,
		`${watchedCount} watched`,
		`${favoriteCount} favorite${favoriteCount === 1 ? "" : "s"}`,
		`${activeFeedFilterCount} feed filter${activeFeedFilterCount === 1 ? "" : "s"}`,
		storageHealthLabel,
	];
	return (
		<section className="space-y-3">
			<SectionHeader icon={<Database className="w-4 h-4" />}>
				Data Health
			</SectionHeader>
			<div className="grid grid-cols-2 gap-2">
				{items.map((item) => (
					<div key={item} className={SETTINGS_CLASSES.statItem}>
						{item}
					</div>
				))}
			</div>
		</section>
	);
}

// ─── Subscription health section ─────────────────────────────────────────

export function SubscriptionHealthSection({
	health,
	hasYouTubeApiKey,
	isRepairing,
	repairStatus,
	onResolveChannelIds,
	onRepairArtwork,
	isRemovingDuplicateId,
	onRemoveSubscription,
}: {
	health: SubscriptionHealth;
	hasYouTubeApiKey: boolean;
	isRepairing: "ids" | "artwork" | null;
	repairStatus: string;
	onResolveChannelIds: () => Promise<void>;
	onRepairArtwork: () => Promise<void>;
	isRemovingDuplicateId: string | null;
	onRemoveSubscription: (subscription: StoredSubscription) => Promise<void>;
}) {
	const hasIssues = health.issueCount > 0;
	const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null);

	const handleConfirmRemoval = async (subscription: StoredSubscription) => {
		try {
			await onRemoveSubscription(subscription);
			setPendingRemovalId(null);
		} catch {
			// The parent displays the failure status; keep the review open so the
			// user can retry or cancel without losing their selection.
		}
	};

	return (
		<section className="space-y-3" data-testid="subscription-health">
			<SectionHeader icon={<ShieldCheck className="w-4 h-4" />}>
				Subscription Health
			</SectionHeader>
			<div className={`${SETTINGS_CLASSES.card} p-4 space-y-3`}>
				<p className="text-sm text-gray-600 dark:text-ios-300">
					{hasIssues
						? `${health.issueCount} subscription finding${health.issueCount === 1 ? "" : "s"} ${health.issueCount === 1 ? "needs" : "need"} attention.`
						: "No subscription metadata issues found."}
				</p>
				<div className="grid grid-cols-2 gap-2">
					<div className={SETTINGS_CLASSES.statItem}>
						{health.unresolved.length} need
						{health.unresolved.length === 1 ? "s" : ""} channel ID
						{health.unresolved.length === 1 ? "" : "s"}
					</div>
					<div className={SETTINGS_CLASSES.statItem}>
						{health.placeholderThumbnails.length} need artwork
					</div>
					<div className={SETTINGS_CLASSES.statItem}>
						{health.missingTitles.length} missing name
						{health.missingTitles.length === 1 ? "" : "s"}
					</div>
					<div className={SETTINGS_CLASSES.statItem}>
						{health.duplicateIdentityGroups.length} possible duplicate
						{health.duplicateIdentityGroups.length === 1 ? "" : "s"}
					</div>
				</div>

				{health.duplicateIdentityGroups.length > 0 && (
					<div className="space-y-2 text-xs text-gray-600 dark:text-ios-300">
						<p className="font-medium text-gray-800 dark:text-ios-100">
							Review possible duplicates before removing anything. Matching titles
							alone are not enough to remove a channel.
						</p>
						{health.duplicateIdentityGroups.map((group) => (
							<div
								key={group.map(({ id }) => id).join("-")}
								className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/30"
								data-testid="duplicate-review-group"
							>
								<p className="font-medium text-gray-800 dark:text-ios-100">
									Possible duplicate group
								</p>
								{group.map((subscription) => {
									const isPending = pendingRemovalId === subscription.id;
									const isRemoving =
										isRemovingDuplicateId === subscription.id;
									const title =
										typeof subscription.title === "string" &&
										subscription.title.trim()
										? subscription.title.trim()
										: "Unnamed channel";
									return (
										<div
											key={subscription.id}
											className="rounded-md bg-white/70 p-2 dark:bg-ios-900/50"
										>
											<div className="flex items-start justify-between gap-2">
												<div className="min-w-0">
													<p className="font-medium text-gray-900 dark:text-ios-100">
														{title}
													</p>
													<p className="break-all text-[11px] text-gray-500 dark:text-ios-400">
														{subscription.customUrl
															? `${subscription.customUrl} · `
															: ""}
														{subscription.id}
													</p>
												</div>
												{!isPending && (
													<button
														type="button"
														onClick={() => setPendingRemovalId(subscription.id)}
														className="flex flex-none items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100 dark:hover:bg-red-950/40"
														aria-label={`Review removal for ${title}`}
													>
														<Trash2 className="h-3.5 w-3.5" />
														Review removal
													</button>
												)}
											</div>
											{isPending && (
												<div className="mt-2 space-y-2 border-t border-amber-200 pt-2 dark:border-amber-900/60">
													<p className="text-xs text-gray-700 dark:text-ios-200">
														Remove this subscription from the server and this browser?
													</p>
													<div className="flex gap-2">
														<button
															type="button"
															onClick={() => void handleConfirmRemoval(subscription)}
															disabled={isRemovingDuplicateId !== null}
															className="flex items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
														>
															{isRemoving ? (
																<Loader2 className="h-3.5 w-3.5 animate-spin" />
															) : (
																<Trash2 className="h-3.5 w-3.5" />
															)}
															Confirm remove {title}
														</button>
														<button
															type="button"
															onClick={() => setPendingRemovalId(null)}
															disabled={isRemovingDuplicateId !== null}
															className="rounded-md px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:text-ios-200 dark:hover:bg-ios-800"
														>
															Cancel
														</button>
													</div>
												</div>
											)}
										</div>
									);
								})}
							</div>
						))}
					</div>
				)}

				{health.unresolved.length > 0 && (
					<div className="space-y-2">
						<button
							type="button"
								onClick={onResolveChannelIds}
								disabled={
									!hasYouTubeApiKey ||
									isRepairing !== null ||
									isRemovingDuplicateId !== null
								}
							className={SETTINGS_CLASSES.primaryBtn}
						>
							{isRepairing === "ids" ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<RotateCw className="h-4 w-4" />
							)}
							Resolve Channel IDs
						</button>
						{!hasYouTubeApiKey && (
							<p className="text-xs text-gray-500 dark:text-ios-400">
								Save a YouTube Data API key to resolve these channels.
							</p>
						)}
					</div>
				)}

				{health.placeholderThumbnails.length > 0 && (
					<button
						type="button"
						onClick={onRepairArtwork}
						disabled={
							isRepairing !== null || isRemovingDuplicateId !== null
						}
						className={SETTINGS_CLASSES.secondaryBtn}
					>
						{isRepairing === "artwork" ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<RotateCw className="h-4 w-4" />
						)}
						Repair Channel Artwork
					</button>
				)}

				{repairStatus && (
					<p className="text-sm text-gray-600 dark:text-ios-300" role="status">
						{repairStatus}
					</p>
				)}
			</div>
		</section>
	);
}

// ─── Server section ──────────────────────────────────────────────────────

export function ServerSection({
	serverStatus,
	serverVersion,
	serverHealth,
}: {
	serverStatus: ServerStatus;
	serverVersion: ServerVersion | null;
	serverHealth: ServerHealth | null;
}) {
	const statusLabel =
		serverStatus === "online"
			? "Online"
			: serverStatus === "offline"
				? "Offline"
				: "Checking";
	const serverSubscriptionCount = serverHealth?.subscriptions ?? 0;
	const cachedVideoCount = serverHealth?.videos ?? 0;
	const items = [
		statusLabel,
		`Server ${serverVersion?.version || "unknown"}`,
		`App ${serverVersion?.appVersion || "unknown"}`,
		`${serverSubscriptionCount} server subscription${serverSubscriptionCount === 1 ? "" : "s"}`,
		`${cachedVideoCount} cached video${cachedVideoCount === 1 ? "" : "s"}`,
	];
	return (
		<section className="space-y-3">
			<SectionHeader icon={<Server className="w-4 h-4" />}>
				Server
			</SectionHeader>
			<div className="grid grid-cols-2 gap-2">
				{items.map((item) => (
					<div key={item} className={SETTINGS_CLASSES.statItem}>
						{item}
					</div>
				))}
			</div>
		</section>
	);
}

// ─── Refresh issues section ──────────────────────────────────────────────

export function RefreshIssuesSection({
	failedChannels,
	onRetry,
	onRetryChannel,
	retryingChannelId,
}: {
	failedChannels: FailedChannel[];
	onRetry: () => Promise<void>;
	onRetryChannel: (channelId: string) => Promise<void>;
	retryingChannelId: string | null;
}) {
	return (
		<section className="space-y-3">
			<SectionHeader icon={<ShieldCheck className="w-4 h-4" />}>
				Refresh Issues
			</SectionHeader>
			<div className="space-y-2">
				<button
					type="button"
					onClick={onRetry}
					className={SETTINGS_CLASSES.primaryBtn}
				>
					Retry Failed Channels
				</button>
				{failedChannels.map((channel) => {
					const guidance = getRefreshFailureGuidance(channel);
					return (
						<div
							key={channel.id}
							className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm dark:border-amber-900/60 dark:bg-amber-950/30"
						>
							<p className="font-medium text-gray-900 dark:text-ios-100">
								{channel.title}
							</p>
							<div className="mt-1 flex items-start justify-between gap-3">
								<div className="min-w-0">
									<p className="text-xs text-gray-600 dark:text-ios-300">
										{channel.reason}
									</p>
									<p className="mt-1 font-medium text-gray-800 dark:text-ios-100">
										{guidance.label}
									</p>
									<p className="mt-1 text-xs text-gray-600 dark:text-ios-300">
										{guidance.hint}
									</p>
									<p className="mt-1 text-[0.7rem] text-gray-500 dark:text-ios-400">
										{channel.lastSuccessfulFetchAt
											? `Last successful refresh ${formatRelativeAge(new Date(channel.lastSuccessfulFetchAt).getTime())}`
											: "No successful refresh recorded"}
									</p>
								</div>
								<button
									type="button"
									onClick={() => void onRetryChannel(channel.id)}
									disabled={Boolean(retryingChannelId)}
									className="inline-flex shrink-0 items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-[0.7rem] font-medium text-gray-800 hover:bg-gray-100 disabled:cursor-wait disabled:opacity-60 dark:border-ios-700 dark:text-ios-100 dark:hover:bg-ios-800"
									aria-label={`Retry ${channel.title}`}
								>
									{retryingChannelId === channel.id ? (
										<Loader2 className="h-3 w-3 animate-spin" />
									) : (
										<RotateCw className="h-3 w-3" />
									)}
									Retry this channel
								</button>
							</div>
						</div>
					);
				})}
			</div>
		</section>
	);
}

function formatRelativeAge(timestamp: number): string {
	if (!timestamp || !Number.isFinite(timestamp)) return "unknown";
	const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
	if (seconds < 60) return "just now";
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
	return `${Math.floor(seconds / 86400)}d ago`;
}

// ─── LLM Smart Search & Discovery section ────────────────────────────────

const PROVIDER_OPTIONS: { value: string; label: string }[] = [
	{ value: "deepseek", label: "DeepSeek" },
	{ value: "custom", label: "Custom" },
];

const DEFAULT_MODELS: Record<string, string> = {
	deepseek: "deepseek-v4-flash",
	custom: "",
};

/** Models API endpoints for known providers (OpenAI-compatible /v1/models). */
const MODELS_ENDPOINTS: Record<string, string> = {
	deepseek: "https://api.deepseek.com/v1/models",
};

/**
 * Known free-model lists per provider, used as an instant fallback
 * when the live endpoint can't be reached (ad blockers, service workers,
 * captive portals, etc.). Keeps the model dropdown working regardless
 * of network restrictions.
 */
const FALLBACK_MODELS: Record<string, string[]> = {
	deepseek: ["deepseek-v4-flash", "deepseek-v4-pro"],
};

async function fetchAvailableModels(
	provider: string,
	apiKey: string,
): Promise<string[]> {
	const endpoint = MODELS_ENDPOINTS[provider];
	if (!endpoint) return [];

	const headers: Record<string, string> = {};
	if (apiKey) {
		headers["Authorization"] = `Bearer ${apiKey}`;
	}

	try {
		const res = await fetch(endpoint, { headers });
		if (!res.ok) {
			throw new Error(
				`${res.status}${res.status === 401 ? " — invalid API key" : ""}`,
			);
		}

		const data: { data?: { id: string }[] } = await res.json();
		const ids = (data.data || []).map((m) => m.id);
		const unique = [...new Set(ids)].sort((a, b) => a.localeCompare(b));

		return unique;
	} catch (err) {
		if (err instanceof TypeError && err.message.includes("fetch")) {
			throw new Error("Network error — check your connection");
		}
		// Re-throw to let loadModels catch and update the error state
		throw err;
	}
}

export function LlmConfigSection({
	provider,
	setProvider,
	model,
	setModel,
	deepseekInputKey,
	customApiKeyInput,
}: {
	provider: string;
	setProvider: (v: string) => void;
	model: string;
	setModel: (v: string) => void;
	deepseekInputKey: string;
	customApiKeyInput: string;
}) {
	const [showEndpoint, setShowEndpoint] = useState(false);
	const [models, setModels] = useState<string[]>(
		FALLBACK_MODELS[provider] ?? [],
	);
	const [modelsLoading, setModelsLoading] = useState(false);
	const [modelsError, setModelsError] = useState<string | null>(null);

	// Subscribe to provider-specific keys from the store so the model
	// list re-fetches when the user enters a key in API Configuration.
	const deepseekKey = useStore((s) => s.deepseekApiKey);
	const currentKey =
		provider === "deepseek" ? deepseekKey : "";

	const loadModels = useCallback(async () => {
		if (provider === "custom") {
			setModels([]);
			setModelsError(null);
			return;
		}

		// For providers that need auth for the models endpoint,
		// show fallback models until a key is available.
		if (provider === "deepseek" && !currentKey) {
			setModels(FALLBACK_MODELS[provider] ?? []);
			setModelsError(null);
			return;
		}

		setModelsLoading(true);
		setModelsError(null);
		try {
			const list = await fetchAvailableModels(provider, currentKey);
			// If live fetch returned results, use them. Otherwise fall
			// back to the hardcoded list so the dropdown always works.
			setModels(list.length > 0 ? list : (FALLBACK_MODELS[provider] ?? []));
		} catch (err) {
			setModelsError(
				err instanceof Error ? err.message : "Failed to load models",
			);
			// Restore the fallback list on error — the previous code only
			// avoided clearing, which meant switching to DeepSeek (empty)
			// then back to OpenCode left models empty with no restore.
			setModels(FALLBACK_MODELS[provider] ?? []);
		} finally {
			setModelsLoading(false);
		}
	}, [provider, currentKey]);

	// Auto-fetch when provider changes or apiKey becomes available
	useEffect(() => {
		loadModels();
	}, [loadModels]);

	const providerLabel =
		PROVIDER_OPTIONS.find((p) => p.value === provider)?.label || provider;

	const handleProviderChange = (newProvider: string) => {
		setProvider(newProvider);
		// Auto-fill the default model when switching providers
		const defaultModel = DEFAULT_MODELS[newProvider];
		const newModel = defaultModel || model;
		if (defaultModel) {
			setModel(newModel);
		}
		// Persist provider and model immediately so Discover Channels
		// can use them without needing Save in API Configuration.
		useStore.getState().setLlmProvider(newProvider);
		useStore.getState().setLlmModel(newModel);
		// Auto-save the matching API key from the FORM INPUTS (not
		// just the store) so the key reaches the store even if the
		// user hasn't clicked Save in API Configuration yet.
		const inputKey =
			newProvider === "deepseek" ? deepseekInputKey : customApiKeyInput;
		if (inputKey) {
			// Persist the provider-specific key to the store
			if (newProvider === "deepseek")
				useStore.getState().setDeepseekApiKey(inputKey);
			if (newProvider === "custom")
				useStore.getState().setCustomApiKey(inputKey);
			// Derive llmApiKey from the provider-specific key
			useStore.getState().setLlmApiKey(inputKey);
		}
	};

	// Persist model changes immediately when the user types/selects.
	// Wraps setModel so ModelSelector's onChange auto-saves.
	const handleModelChange = (newModel: string) => {
		setModel(newModel);
		useStore.getState().setLlmModel(newModel);
	};

	return (
		<section className="space-y-3">
			<SectionHeader icon={<Brain className="w-4 h-4" />}>
				Smart Search &amp; Discovery
			</SectionHeader>
			<div className={`${SETTINGS_CLASSES.card} p-4`}>
				<p className="text-sm text-gray-600 dark:text-ios-300">
					Powers channel suggestions based on your subscriptions and LLM-powered
					fuzzy search when keyword searches fail.
				</p>

				<div className="space-y-2">
					<label className="text-sm font-medium text-gray-700 dark:text-ios-300">
						Provider
					</label>
					<select
						value={provider}
						onChange={(e: ChangeEvent<HTMLSelectElement>) =>
							handleProviderChange(e.target.value)
						}
						className={`${SETTINGS_CLASSES.input} appearance-none cursor-pointer`}
					>
						{PROVIDER_OPTIONS.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{opt.label}
							</option>
						))}
					</select>
				</div>

				{/* Model selector — dropdown when models loaded, text input otherwise */}
				<ModelSelector
					model={model}
					setModel={handleModelChange}
					models={models}
					modelsLoading={modelsLoading}
					modelsError={modelsError}
					onRefresh={loadModels}
					provider={provider}
					providerLabel={providerLabel}
				/>

				{provider === "custom" && (
					<div className="space-y-2">
						<button
							type="button"
							onClick={() => setShowEndpoint(!showEndpoint)}
							className="text-xs text-red-600 hover:underline"
						>
							{showEndpoint ? "Hide" : "Configure"} custom endpoint
						</button>
						{showEndpoint && (
							<p className="text-xs text-gray-500 dark:text-ios-400">
								Custom endpoints are configured on the server via environment
								variables (LLM_ENDPOINT, LLM_API_KEY, LLM_MODEL).
							</p>
						)}
					</div>
				)}

				<div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-900/60 dark:bg-amber-950/30">
					<p className="text-xs font-medium text-amber-800 dark:text-amber-300">
						⚠ A provider API key must be saved in{" "}
						<strong>API Configuration</strong> above for channel
						suggestions/discovery. Provider and model selections save
						automatically — no need to click Save.
					</p>
				</div>
			</div>
		</section>
	);
}
