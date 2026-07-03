import type { YouTubeChannel } from "../types/youtube";

export function getSubscriptionSection(title: string): string {
	const first = title.trim().charAt(0).toUpperCase();
	return /^[A-Z]$/.test(first) ? first : "#";
}

export function groupCompactSubscriptions(channels: YouTubeChannel[]) {
	const groups = new Map<string, YouTubeChannel[]>();
	for (const channel of channels) {
		const section = getSubscriptionSection(channel.title || channel.id);
		groups.set(section, [...(groups.get(section) || []), channel]);
	}
	return Array.from(groups.entries()).sort(([left], [right]) => {
		if (left === "#") return 1;
		if (right === "#") return -1;
		return left.localeCompare(right);
	});
}
