/** Thrown when the server returns 401 — distinguishes auth failures from transient errors. */
export class AuthError extends Error {
	constructor(message = "Server authentication required") {
		super(message);
		this.name = "AuthError";
	}
}

/** True when *error* is an AuthError (401 from the server). */
export function isAuthError(error: unknown): boolean {
	return error instanceof AuthError;
}

export const SERVER_API_TOKEN_STORAGE_KEY = "mytube.serverApiToken";
export const SERVER_AUTH_REQUIRED_EVENT = "mytube:server-auth-required";
const LEGACY_SERVER_API_TOKEN_STORAGE_KEY =
	"youtube-subscriptions.serverApiToken";

let installed = false;
let originalFetch: typeof fetch | null = null;

function getDefaultStorage(): Pick<
	Storage,
	"getItem" | "setItem" | "removeItem"
> | null {
	if (typeof window === "undefined" || !window.localStorage) return null;
	return window.localStorage;
}

export function getServerApiToken(
	storage: Pick<
		Storage,
		"getItem" | "setItem" | "removeItem"
	> | null = getDefaultStorage(),
): string {
	if (!storage) return "";
	const token = (
		storage.getItem(SERVER_API_TOKEN_STORAGE_KEY) ||
		storage.getItem(LEGACY_SERVER_API_TOKEN_STORAGE_KEY) ||
		""
	).trim();

	if (token && storage.getItem(SERVER_API_TOKEN_STORAGE_KEY) !== token) {
		storage.setItem(SERVER_API_TOKEN_STORAGE_KEY, token);
		storage.removeItem(LEGACY_SERVER_API_TOKEN_STORAGE_KEY);
	}

	return token;
}

export function setServerApiToken(
	token: string,
	storage: Pick<Storage, "removeItem" | "setItem"> | null = typeof window ===
	"undefined"
		? null
		: window.localStorage,
): void {
	if (!storage) return;

	const trimmedToken = token.trim();
	if (trimmedToken) {
		storage.setItem(SERVER_API_TOKEN_STORAGE_KEY, trimmedToken);
		storage.removeItem(LEGACY_SERVER_API_TOKEN_STORAGE_KEY);
	} else {
		storage.removeItem(SERVER_API_TOKEN_STORAGE_KEY);
		storage.removeItem(LEGACY_SERVER_API_TOKEN_STORAGE_KEY);
	}
}

/** Verify that the currently stored token can access the authenticated API. */
export async function verifyServerApiToken(
	fetchImpl: typeof fetch = globalThis.fetch,
): Promise<void> {
	const response = await fetchImpl(`/api/sync?t=${Date.now()}`, {
		cache: "no-store",
		credentials: "same-origin",
	});

	if (response.status === 401) throw new AuthError();
	if (!response.ok) {
		throw new Error(`Server connection failed (${response.status})`);
	}
}

function isSameOriginApiRequest(input: RequestInfo | URL): boolean {
	if (typeof input === "string") {
		if (input.startsWith("/api/")) return true;
		try {
			const url = new URL(input, window.location.origin);
			return (
				url.origin === window.location.origin &&
				url.pathname.startsWith("/api/")
			);
		} catch {
			return false;
		}
	}

	if (input instanceof URL) {
		return (
			input.origin === window.location.origin &&
			input.pathname.startsWith("/api/")
		);
	}

	const url = new URL(input.url, window.location.origin);
	return (
		url.origin === window.location.origin && url.pathname.startsWith("/api/")
	);
}

function withAuthorizationHeader(
	init: RequestInit | undefined,
	token: string,
): RequestInit {
	const nextInit = init ? { ...init } : {};
	const headers = new Headers(nextInit.headers);
	if (!headers.has("Authorization")) {
		headers.set("Authorization", `Bearer ${token}`);
	}

	return {
		...nextInit,
		headers,
	};
}

export function installAuthenticatedFetch(): void {
	if (installed || typeof window === "undefined") return;

	const activeFetch = globalThis.fetch.bind(globalThis);
	originalFetch = activeFetch;
	globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
		const token = getServerApiToken();
		const isApiRequest = isSameOriginApiRequest(input);
		const request =
			token && isApiRequest
				? activeFetch(input, withAuthorizationHeader(init, token))
				: activeFetch(input, init);

		if (!isApiRequest) return request;

		return request.then(
			(response) => {
				if (response.status === 401) {
					window.dispatchEvent(new Event(SERVER_AUTH_REQUIRED_EVENT));
				}
				return response;
			},
		);
	}) as typeof fetch;

	installed = true;
}

export function uninstallAuthenticatedFetchForTests(): void {
	if (originalFetch) {
		globalThis.fetch = originalFetch;
	}
	originalFetch = null;
	installed = false;
}
