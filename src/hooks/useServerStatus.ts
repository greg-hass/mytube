/**
 * useServerStatus — fetches server health, version, and failed-channel
 * status when the Settings modal opens. Owns the cancellation flag and
 * the loading → online/offline transitions.
 */
import { useEffect, useState } from "react";
import type { ServerHealth, ServerVersion, FailedChannel } from "../types/server";

export type ServerStatus = "checking" | "online" | "offline";

interface UseServerStatusResult {
	serverHealth: ServerHealth | null;
	serverVersion: ServerVersion | null;
	serverStatus: ServerStatus;
	failedChannels: FailedChannel[];
}

interface ServerStatusPayload {
	health: ServerHealth;
	version: ServerVersion;
	failedChannels: FailedChannel[];
}

async function fetchServerStatusPayload(): Promise<ServerStatusPayload> {
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

	const failedChannels: FailedChannel[] = [];
	const statusResponse = await fetch("/api/videos/status");
	if (statusResponse.ok) {
		const status = await statusResponse.json();
		if (Array.isArray(status.failedChannels)) {
			failedChannels.push(...status.failedChannels);
		}
	}

	return { health, version, failedChannels };
}

export function useServerStatus(): UseServerStatusResult {
	const [serverHealth, setServerHealth] = useState<ServerHealth | null>(null);
	const [serverVersion, setServerVersion] = useState<ServerVersion | null>(null);
	const [failedChannels, setFailedChannels] = useState<FailedChannel[]>([]);
	const [serverStatus, setServerStatus] = useState<ServerStatus>("checking");

	useEffect(() => {
		let isCancelled = false;
		void (async () => {
			try {
				const payload = await fetchServerStatusPayload();
				if (isCancelled) return;
				setServerHealth(payload.health);
				setServerVersion(payload.version);
				setFailedChannels(payload.failedChannels);
				setServerStatus("online");
			} catch {
				if (!isCancelled) {
					setServerStatus("offline");
				}
			}
		})();
		return () => {
			isCancelled = true;
		};
	}, []);

	return { serverHealth, serverVersion, serverStatus, failedChannels };
}
