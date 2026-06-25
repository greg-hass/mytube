/**
 * channel-input-resolver — convert a parsed channel input (handle, custom
 * URL, or channel ID) into a YouTubeChannel record. Used by the
 * AddChannelModal when the user pastes a direct identifier and clicks
 * Add without going through the keyword-search flow.
 */
import type { ParsedChannelInput } from "./youtube-parser";
import type { YouTubeChannel } from "../types/youtube";

/**
 * Build a placeholder thumbnail for a channel that the server hasn't
 * resolved yet. Uses ui-avatars to avoid showing a broken image.
 */
function placeholderThumbnail(name: string): string {
	return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff`;
}

/**
 * Server endpoint for handle / custom-URL resolution. Returns the
 * canonical channel ID plus a fallback title + thumbnail.
 */
async function resolveServerSide(parsedInput: ParsedChannelInput): Promise<{
	id: string;
	title: string;
	thumbnail?: string;
}> {
	if (parsedInput.type !== "handle" && parsedInput.type !== "custom_url") {
		throw new Error("Server-side resolution requires handle or custom URL");
	}

	const response = await fetch("/api/resolve-channel", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ type: parsedInput.type, value: parsedInput.value }),
	});

	if (!response.ok) {
		throw new Error(
			"Unable to resolve channel. Please try a different URL or the channel ID directly.",
		);
	}

	return response.json();
}

/**
 * Convert a parsed input into a YouTubeChannel record.
 *
 * Priority:
 *  1. The pre-resolved channel from the server's channel-search API
 *     (useDirectChannelResolution path).
 *  2. Server-side handle / custom-URL resolution.
 *  3. A placeholder channel keyed by the channel ID.
 */
export async function resolveChannelFromParsedInput(
	parsedInput: ParsedChannelInput,
	resolvedChannel: YouTubeChannel | null,
): Promise<YouTubeChannel> {
	if (parsedInput.type === "invalid") {
		throw new Error("Search for a channel or enter a valid YouTube channel");
	}

	if (resolvedChannel) return resolvedChannel;

	if (parsedInput.type === "handle" || parsedInput.type === "custom_url") {
		const { id, title, thumbnail } = await resolveServerSide(parsedInput);
		return {
			id,
			title: title || parsedInput.originalInput,
			description: "",
			thumbnail: thumbnail || placeholderThumbnail(parsedInput.originalInput),
			customUrl:
				parsedInput.type === "custom_url" ? parsedInput.value : undefined,
		};
	}

	return {
		id: parsedInput.value,
		title: parsedInput.originalInput,
		description: "",
		thumbnail: placeholderThumbnail(parsedInput.originalInput),
	};
}
