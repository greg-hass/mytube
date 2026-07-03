function extractBalancedJson(source, startIndex) {
	let depth = 0;
	let inString = false;
	let escaped = false;

	for (let index = startIndex; index < source.length; index += 1) {
		const character = source[index];
		if (escaped) {
			escaped = false;
			continue;
		}
		if (character === "\\") {
			escaped = true;
			continue;
		}
		if (character === '"') {
			inString = !inString;
			continue;
		}
		if (inString) continue;
		if (character === "{") depth += 1;
		if (character === "}") {
			depth -= 1;
			if (depth === 0) return source.slice(startIndex, index + 1);
		}
	}

	return null;
}

function extractYouTubeInitialData(html) {
	const source = String(html || "");
	const markerIndex = source.indexOf("ytInitialData");
	if (markerIndex === -1) return null;
	const objectStart = source.indexOf("{", markerIndex);
	if (objectStart === -1) return null;
	const json = extractBalancedJson(source, objectStart);
	if (!json) return null;
	try {
		return JSON.parse(json);
	} catch {
		return null;
	}
}

function readText(value) {
	if (!value) return "";
	if (typeof value === "string") return value;
	if (typeof value.simpleText === "string") return value.simpleText;
	if (Array.isArray(value.runs)) {
		return value.runs.map((run) => run?.text || "").join("").trim();
	}
	return "";
}

function normalizeThumbnail(url) {
	if (!url || typeof url !== "string") return "";
	return url.startsWith("//") ? `https:${url}` : url.replace(/\\u0026/g, "&");
}

function buildYouTubeFeedUrl(channelId) {
	return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
}

function findYouTubeChannelCandidates(payload) {
	const candidates = [];
	const walk = (value) => {
		if (!value || typeof value !== "object") return;
		if (Array.isArray(value)) {
			value.forEach(walk);
			return;
		}
		const renderer = value.channelRenderer;
		if (renderer && typeof renderer.channelId === "string") {
			const title = readText(renderer.title);
			if (title && renderer.channelId.startsWith("UC")) {
				const thumbnails = renderer.thumbnail?.thumbnails || [];
				const thumbnail = [...thumbnails]
					.sort((left, right) => (right?.width || 0) - (left?.width || 0))
					.map((item) => normalizeThumbnail(item?.url))
					.find(Boolean);
				candidates.push({
					id: renderer.channelId,
					title,
					description: readText(renderer.descriptionSnippet),
					thumbnail: thumbnail || "",
					customUrl: renderer.canonicalBaseUrl || undefined,
					feedUrl: buildYouTubeFeedUrl(renderer.channelId),
				});
			}
		}
		Object.values(value).forEach(walk);
	};
	walk(payload);
	return dedupeChannelCandidates(candidates);
}

function dedupeChannelCandidates(candidates) {
	const byId = new Map();
	for (const candidate of candidates || []) {
		if (!candidate?.id || !candidate?.title) continue;
		const existing = byId.get(candidate.id);
		if (!existing) {
			byId.set(candidate.id, { ...candidate });
			continue;
		}
		byId.set(candidate.id, {
			...candidate,
			...existing,
			thumbnail: existing.thumbnail || candidate.thumbnail,
			customUrl: existing.customUrl || candidate.customUrl,
			description: existing.description || candidate.description,
		});
	}
	return Array.from(byId.values());
}

module.exports = {
	buildYouTubeFeedUrl,
	dedupeChannelCandidates,
	extractYouTubeInitialData,
	findYouTubeChannelCandidates,
};
