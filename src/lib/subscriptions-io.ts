import type { StoredSubscription } from "./indexeddb";
import { escapeXml } from "./opml-parser";
import type { YouTubeChannel } from "../types/youtube";

/** Export subscriptions as OPML XML. */
export function exportSubscriptionsAsOPML(
	subscriptions: StoredSubscription[],
): string {
	const outlines = subscriptions
		.map((sub) => {
			const attrs = [
				`text="${escapeXml(sub.title)}"`,
				`title="${escapeXml(sub.title)}"`,
				'type="rss"',
				`xmlUrl="https://www.youtube.com/feeds/videos.xml?channel_id=${sub.id}"`,
			];
			if (sub.isFavorite) attrs.push('isFavorite="true"');
			if (sub.isMuted) attrs.push('isMuted="true"');
			if (sub.group) attrs.push(`group="${escapeXml(sub.group)}"`);
			return `      <outline ${attrs.join(" ")} />`;
		})
		.join("\n");

	return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.1">
  <head>
    <title>MyTube Subscriptions</title>
  </head>
  <body>
    <outline text="MyTube Subscriptions" title="MyTube Subscriptions">
${outlines}
    </outline>
  </body>
</opml>`;
}

/** Trigger a browser download for a blob. */
function downloadBlob(content: string, filename: string, mimeType: string) {
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}

/** Export subscriptions as OPML file download. */
export function downloadOPML(subscriptions: StoredSubscription[]): void {
	if (subscriptions.length === 0) throw new Error("No subscriptions to export");
	const opml = exportSubscriptionsAsOPML(subscriptions);
	const date = new Date().toISOString().split("T")[0];
	downloadBlob(opml, `mytube-${date}.opml`, "text/xml");
}

/** Export subscriptions + data as JSON file download. */
export function downloadJSON(
	subscriptions: StoredSubscription[],
	watchedVideos: string[],
): void {
	if (subscriptions.length === 0) throw new Error("No subscriptions to export");
	const exportData = {
		version: "1.0",
		exportedAt: new Date().toISOString(),
		subscriptions,
		settings: {},
		watchedVideos,
	};
	const json = JSON.stringify(exportData, null, 2);
	const date = new Date().toISOString().split("T")[0];
	downloadBlob(json, `mytube-${date}.json`, "application/json");
}

/** Parsed JSON import result. */
export type ParsedImport = {
	subscriptions: StoredSubscription[];
	apiKey?: string;
	watchedVideoIds: string[];
};

/** Parse and validate a JSON import string. */
export function parseJSONImport(jsonContent: string): ParsedImport {
	const data = JSON.parse(jsonContent);
	if (!data.subscriptions || !Array.isArray(data.subscriptions)) {
		throw new Error("Invalid JSON format: missing subscriptions array");
	}
	return {
		subscriptions: data.subscriptions,
		apiKey: data.settings?.apiKey,
		watchedVideoIds: Array.isArray(data.watchedVideos)
			? data.watchedVideos
			: [],
	};
}

/** Convert StoredSubscription[] to YouTubeChannel[] for UI compatibility. */
export function toYouTubeChannels(
	subs: StoredSubscription[] | undefined,
): YouTubeChannel[] {
	if (!subs) return [];
	return subs.map((sub) => ({
		id: sub.id,
		title: sub.title,
		description: sub.description || "",
		thumbnail: sub.thumbnail || "",
		customUrl: sub.customUrl,
		isFavorite: sub.isFavorite,
		isMuted: sub.isMuted,
		group: sub.group,
		addedAt: sub.addedAt,
	}));
}

function getAddedAt(channel: YouTubeChannel): number | null {
	return typeof channel.addedAt === "number" && Number.isFinite(channel.addedAt)
		? channel.addedAt
		: null;
}

function compareByAddedAt(
	a: YouTubeChannel,
	b: YouTubeChannel,
	direction: "ascending" | "descending",
): number {
	const aAddedAt = getAddedAt(a);
	const bAddedAt = getAddedAt(b);

	if (aAddedAt === null && bAddedAt === null) {
		return a.title.localeCompare(b.title);
	}
	if (aAddedAt === null) return 1;
	if (bAddedAt === null) return -1;

	const dateOrder =
		direction === "ascending" ? aAddedAt - bAddedAt : bAddedAt - aAddedAt;
	return dateOrder || a.title.localeCompare(b.title);
}

/** Filter and sort channel subscriptions for display. */
export function filterAndSortChannels(
	channels: YouTubeChannel[],
	searchQuery: string,
	sortBy: string,
): YouTubeChannel[] {
	let result = [...channels];

	if (searchQuery) {
		const query = searchQuery.toLowerCase();
		result = result.filter(
			(sub) =>
				sub.title.toLowerCase().includes(query) ||
				sub.description.toLowerCase().includes(query),
		);
	}

	result.sort((a, b) => {
		switch (sortBy) {
			case "name":
				return a.title.localeCompare(b.title);
			case "recent":
				return compareByAddedAt(a, b, "descending");
			case "oldest":
				return compareByAddedAt(a, b, "ascending");
			default:
				return 0;
		}
	});

	return result;
}
