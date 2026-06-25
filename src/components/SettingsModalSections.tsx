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
	apiKey,
}: {
	model: string;
	setModel: (v: string) => void;
	models: string[];
	modelsLoading: boolean;
	modelsError: string | null;
	onRefresh: () => void;
	provider: string;
	providerLabel: string;
	apiKey: string;
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
									: provider === "deepseek" && !apiKey
										? "Enter an API key, then refresh to list available models."
										: "No models loaded. Refresh to fetch available models."}
			</p>
		</div>
	);
}

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

// ─── LLM Smart Search & Discovery section ────────────────────────────────

const PROVIDER_OPTIONS: { value: string; label: string }[] = [
	{ value: "opencode", label: "OpenCode (free)" },
	{ value: "deepseek", label: "DeepSeek" },
	{ value: "custom", label: "Custom" },
];

const DEFAULT_MODELS: Record<string, string> = {
	opencode: "big-pickle",
	deepseek: "deepseek-v4-flash",
	custom: "",
};

/** Models API endpoints for known providers (OpenAI-compatible /v1/models). */
const MODELS_ENDPOINTS: Record<string, string> = {
	opencode: "https://opencode.ai/zen/v1/models",
	deepseek: "https://api.deepseek.com/v1/models",
};

/**
 * Known free-model lists per provider, used as an instant fallback
 * when the live endpoint can't be reached (ad blockers, service workers,
 * captive portals, etc.). Keeps the model dropdown working regardless
 * of network restrictions.
 */
const FALLBACK_MODELS: Record<string, string[]> = {
	opencode: [
		"big-pickle",
		"deepseek-v4-flash-free",
		"mimo-v2.5-free",
		"minimax-m3-free",
		"nemotron-3-ultra-free",
		"north-mini-code-free",
		"qwen3.6-plus-free",
	],
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

		// OpenCode: only show free models (big-pickle + -free suffix)
		if (provider === "opencode") {
			return unique.filter((m) => m === "big-pickle" || m.endsWith("-free"));
		}

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
	apiKey,
	setApiKey,
	model,
	setModel,
}: {
	provider: string;
	setProvider: (v: string) => void;
	apiKey: string;
	setApiKey: (v: string) => void;
	model: string;
	setModel: (v: string) => void;
}) {
	const [showEndpoint, setShowEndpoint] = useState(false);
	const [models, setModels] = useState<string[]>(
	FALLBACK_MODELS[provider] ?? [],
);
	const [modelsLoading, setModelsLoading] = useState(false);
	const [modelsError, setModelsError] = useState<string | null>(null);

	const loadModels = useCallback(async () => {
		if (provider === "custom") {
			setModels([]);
			setModelsError(null);
			return;
		}

		// For providers that need auth for the models endpoint,
		// don't try without a key.
		if (provider === "deepseek" && !apiKey) {
			setModels([]);
			setModelsError(null);
			return;
		}

		setModelsLoading(true);
		setModelsError(null);
		try {
			const list = await fetchAvailableModels(provider, apiKey);
			setModels(list);
		} catch (err) {
			setModelsError(
				err instanceof Error ? err.message : "Failed to load models",
			);
			// Keep the fallback list (if one exists) when the live fetch fails,
			// so the dropdown works even with network blockers or ad-blockers.
			if (!FALLBACK_MODELS[provider]) {
				setModels([]);
			}
		} finally {
			setModelsLoading(false);
		}
	}, [provider, apiKey]);

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
		if (defaultModel) {
			setModel(defaultModel);
		}
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

				<ApiKeyField
					label="API Key"
					value={apiKey}
					onChange={setApiKey}
					placeholder={
						{
							opencode: "Enter your OpenCode API key...",
							deepseek: "Enter your DeepSeek API key...",
							custom: "Enter your API key...",
						}[provider] || "Enter your API key..."
					}
					isSaved={false}
					description={
						provider === "opencode" ? (
							<>
								Free. Used for channel suggestions and LLM-powered search.{" "}
								<a
									href="https://opencode.ai/auth"
									target="_blank"
									rel="noopener noreferrer"
									className="text-red-600 hover:underline ml-1"
								>
									Get a key
								</a>
							</>
						) : provider === "deepseek" ? (
							<>
								~$0.60/M output tokens. DeepSeek v4 Flash is fast and cheap.{" "}
								<a
									href="https://platform.deepseek.com/api_keys"
									target="_blank"
									rel="noopener noreferrer"
									className="text-red-600 hover:underline ml-1"
								>
									Get a key
								</a>
							</>
						) : (
							"Any OpenAI-compatible provider."
						)
					}
				/>

				{/* Model selector — dropdown when models loaded, text input otherwise */}
				<ModelSelector
					model={model}
					setModel={setModel}
					models={models}
					modelsLoading={modelsLoading}
					modelsError={modelsError}
					onRefresh={loadModels}
					provider={provider}
					providerLabel={providerLabel}
					apiKey={apiKey}
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
						⚠ A Smart Search provider API key is required for channel
						suggestions/discovery.
					</p>
				</div>
			</div>
		</section>
	);
}
