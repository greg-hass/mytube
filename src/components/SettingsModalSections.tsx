/**
 * SettingsModalSections — focused subcomponents for SettingsModal.
 * Each section is a small focused function with low cyclomatic
 * complexity, so the SettingsModal body just orchestrates them.
 */
import type { ChangeEvent, RefObject } from "react";
import {
	Key,
	ShieldCheck,
	Download,
	Upload,
	Database,
	Server,
	CheckCircle2,
} from "lucide-react";
import type {
	ServerHealth,
	ServerVersion,
	FailedChannel,
} from "../types/server";
import type { ServerStatus } from "../hooks/useServerStatus";

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
	braveInputKey,
	setBraveInputKey,
	opencodeInputKey,
	setOpencodeInputKey,
	serverApiTokenInput,
	setServerApiTokenInput,
	isSaved,
	onSave,
}: {
	inputKey: string;
	setInputKey: (v: string) => void;
	braveInputKey: string;
	setBraveInputKey: (v: string) => void;
	opencodeInputKey: string;
	setOpencodeInputKey: (v: string) => void;
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
							Optional browser-only fallback for channel handle resolution.
							Backups and server sync do not include this key.{" "}
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
					label="Brave Search API Key"
					value={braveInputKey}
					onChange={setBraveInputKey}
					placeholder="Enter your Brave Search API key..."
					isSaved={isSaved}
					description={
						<>
							Used for Brave fallback channel search only. Stored in this
							browser and not sent to the server.{" "}
							<a
								href="https://brave.com/search/api/"
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
					label="OpenCode API Key"
					labelExtra="(Killer feature — free, runs by default)"
					value={opencodeInputKey}
					onChange={setOpencodeInputKey}
					placeholder="Enter your OpenCode API key..."
					isSaved={isSaved}
					description={
						<>
							Powers the smart resolver: when keyword search fails, the
							big-pickle model searches the live web (via DuckDuckGo or Brave)
							and suggests the right channel. The model is free.{" "}
							<a
								href="https://opencode.ai/auth"
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
}: {
	label: string;
	labelExtra?: string;
	value: string;
	onChange: (v: string) => void;
	placeholder: string;
	isSaved: boolean;
	description: React.ReactNode;
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
					type="password"
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

// ─── Backup & restore section ────────────────────────────────────────────

export function BackupSection({
	backupStatus,
	restoreInputRef,
	onDownload,
	onRestoreFile,
	onResetCache,
}: {
	backupStatus: string;
	restoreInputRef: RefObject<HTMLInputElement | null>;
	onDownload: () => void;
	onRestoreFile: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
	onResetCache: () => Promise<void>;
}) {
	return (
		<section className="space-y-3">
			<SectionHeader icon={<ShieldCheck className="w-4 h-4" />}>
				Backup &amp; Restore
			</SectionHeader>
			<div className={`${SETTINGS_CLASSES.card} p-4`}>
				<p className="text-sm text-gray-600 dark:text-ios-300">
					Subscriptions, watched videos, favorites, queue, feed filters, groups,
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
				{backupStatus && (
					<p className="text-sm text-gray-600 dark:text-ios-300">
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
	queuedCount,
	favoriteCount,
	activeFeedFilterCount,
	storageHealthLabel,
}: {
	rawSubscriptionCount: number;
	watchedCount: number;
	queuedCount: number;
	favoriteCount: number;
	activeFeedFilterCount: number;
	storageHealthLabel: string;
}) {
	const items = [
		`${rawSubscriptionCount} subscription${rawSubscriptionCount === 1 ? "" : "s"}`,
		`${watchedCount} watched`,
		`${queuedCount} queued`,
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
}: {
	failedChannels: FailedChannel[];
	onRetry: () => Promise<void>;
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
	);
}
