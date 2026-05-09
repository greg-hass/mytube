const YOUTUBE_THUMBNAIL_QUALITY_ORDER = [
  'maxresdefault.jpg',
  'sddefault.jpg',
  'hqdefault.jpg',
  'mqdefault.jpg',
  'default.jpg',
];

export function getHighResolutionVideoThumbnail(thumbnail: string): string {
  return getVideoThumbnailCandidate(thumbnail, 0);
}

export function getNextVideoThumbnailFallback(currentThumbnail: string): string | null {
  const currentQualityIndex = YOUTUBE_THUMBNAIL_QUALITY_ORDER.findIndex((quality) => currentThumbnail.includes(`/${quality}`));

  if (currentQualityIndex === -1 || currentQualityIndex === YOUTUBE_THUMBNAIL_QUALITY_ORDER.length - 1) {
    return null;
  }

  return getVideoThumbnailCandidate(currentThumbnail, currentQualityIndex + 1);
}

function getVideoThumbnailCandidate(thumbnail: string, qualityIndex: number): string {
  if (!isYouTubeVideoThumbnail(thumbnail)) {
    return thumbnail;
  }

  return thumbnail.replace(
    /\/(?:maxresdefault|sddefault|hqdefault|mqdefault|default)\.jpg(?:\?.*)?$/i,
    `/${YOUTUBE_THUMBNAIL_QUALITY_ORDER[qualityIndex]}`
  );
}

function isYouTubeVideoThumbnail(thumbnail: string): boolean {
  try {
    const url = new URL(thumbnail);
    return (
      (url.hostname === 'i.ytimg.com' || url.hostname === 'img.youtube.com') &&
      /\/vi\/[^/]+\/(?:maxresdefault|sddefault|hqdefault|mqdefault|default)\.jpg(?:\?.*)?$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}
