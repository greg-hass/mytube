import type { YouTubeChannel } from "../types/youtube";

type ChannelIdentitySource = Pick<YouTubeChannel, "id" | "customUrl">;

function normalizeIdentityValue(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/^https?:\/\/(?:www\.|m\.)?youtube\.com/i, "")
		.replace(/^\/+/, "")
		.replace(/\/+$/, "");
}

function addKey(keys: Set<string>, type: "handle" | "custom", value: string) {
	const normalized = normalizeIdentityValue(value)
		.replace(/^@/, "")
		.replace(/^c\//, "");
	if (normalized) keys.add(`${type}:${normalized}`);
}

function addIdentityValue(keys: Set<string>, value: string, type: "handle" | "custom") {
	const normalized = normalizeIdentityValue(value);
	if (!normalized) return;

	if (normalized.startsWith("@")) {
		addKey(keys, "handle", normalized);
		return;
	}

	if (normalized.startsWith("c/")) {
		addKey(keys, "custom", normalized);
		return;
	}

	addKey(keys, type, normalized);
}

/**
 * Return stable identity keys for a channel and its known YouTube URL forms.
 * Temporary IDs are included deliberately: older subscriptions may still be
 * waiting for handle/custom-URL resolution, while newer search results may
 * already contain the canonical UC... ID.
 */
export function getChannelIdentityKeys(
	channel: ChannelIdentitySource,
): string[] {
	const keys = new Set<string>();
	const id = String(channel.id || "").trim();

	if (id) {
		if (id.startsWith("handle_")) {
			addKey(keys, "handle", id.slice("handle_".length));
		} else if (id.startsWith("custom_")) {
			addIdentityValue(keys, id.slice("custom_".length), "custom");
		} else {
			keys.add(`id:${id}`);
		}
	}

	if (channel.customUrl) {
		addIdentityValue(keys, channel.customUrl, "custom");
	}

	return Array.from(keys);
}

export function hasChannelIdentity(
	channel: ChannelIdentitySource,
	knownIdentityKeys: ReadonlySet<string>,
): boolean {
	return getChannelIdentityKeys(channel).some((key) =>
		knownIdentityKeys.has(key),
	);
}

export function buildChannelIdentitySet(
	channels: ChannelIdentitySource[],
): Set<string> {
	return new Set(channels.flatMap(getChannelIdentityKeys));
}
