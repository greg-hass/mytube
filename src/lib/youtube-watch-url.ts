const YOUTUBE_WATCH_URL = "https://www.youtube.com/watch";

function normalizeStartSeconds(seconds: number | undefined): number | null {
	if (!Number.isFinite(seconds) || Number(seconds) < 1) return null;
	return Math.floor(Number(seconds));
}

export function buildYouTubeWatchUrl(
	videoId: string,
	startSeconds?: number,
): string {
	const url = new URL(YOUTUBE_WATCH_URL);
	url.searchParams.set("v", videoId);
	const normalizedStart = normalizeStartSeconds(startSeconds);
	if (normalizedStart !== null) {
		url.searchParams.set("t", `${normalizedStart}s`);
	}
	return url.toString();
}
