import { LoaderCircle, ShieldAlert } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
	AuthError,
	getServerApiToken,
	setServerApiToken,
	verifyServerApiToken,
} from "../lib/api-auth";

interface ServerAuthSetupProps {
	onAuthenticated: () => void | Promise<void>;
	onOpenSettings: () => void;
}

export function ServerAuthSetup({
	onAuthenticated,
	onOpenSettings,
}: ServerAuthSetupProps) {
	const [token, setToken] = useState(() => getServerApiToken());
	const [isChecking, setIsChecking] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const trimmedToken = token.trim();
		if (!trimmedToken) {
			setErrorMessage("Enter the server API token to continue.");
			return;
		}

		setIsChecking(true);
		setErrorMessage(null);
		setServerApiToken(trimmedToken);

		try {
			await verifyServerApiToken();
			await onAuthenticated();
		} catch (error) {
			setErrorMessage(
				error instanceof AuthError
					? "That token was rejected by the server. Check it and try again."
					: error instanceof Error
						? error.message
						: "Could not connect to the server. Check your connection and try again.",
			);
		} finally {
			setIsChecking(false);
		}
	};

	return (
		<main
			data-testid="auth-required"
			className="mx-auto flex min-h-[calc(100dvh-var(--app-header-height))] max-w-md flex-col items-center justify-center px-4 py-8"
		>
			<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-50 dark:bg-red-900/20">
				<ShieldAlert className="h-6 w-6 text-red-600 dark:text-red-400" />
			</div>
			<h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-ios-50">
				Connect to your MyTube server
			</h2>
			<p className="mt-2 text-center text-sm text-gray-500 dark:text-ios-400">
				Your server requires an API token before subscriptions and video feeds can
				be loaded.
			</p>

			<form onSubmit={handleSubmit} className="mt-6 w-full space-y-3">
				<label
					className="block text-sm font-medium text-gray-700 dark:text-ios-300"
					htmlFor="server-auth-token"
				>
					Server API token
				</label>
				<input
					id="server-auth-token"
					name="server-api-token"
					type="password"
					autoComplete="off"
					value={token}
					onChange={(event) => setToken(event.target.value)}
					placeholder="Paste SERVER_API_TOKEN"
					disabled={isChecking}
					className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-base text-gray-900 outline-none focus:border-red-500 disabled:opacity-60 dark:border-ios-800 dark:bg-ios-950 dark:text-ios-100"
				/>
				<button
					type="submit"
					disabled={isChecking}
					className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-wait disabled:opacity-70"
				>
					{isChecking && <LoaderCircle className="h-4 w-4 animate-spin" />}
					{isChecking ? "Checking connection…" : "Connect to server"}
				</button>
				{errorMessage && (
					<p role="alert" className="text-sm text-red-600 dark:text-red-400">
						{errorMessage}
					</p>
				)}
			</form>

			<button
				type="button"
				onClick={onOpenSettings}
				className="mt-4 text-sm font-medium text-gray-500 underline-offset-4 hover:text-gray-900 hover:underline dark:text-ios-400 dark:hover:text-ios-100"
			>
				Open full Settings
			</button>
		</main>
	);
}
