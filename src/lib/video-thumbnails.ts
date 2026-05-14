const YOUTUBE_THUMBNAIL_QUALITY_ORDER = [
  'maxresdefault',
  'sddefault',
  'hqdefault',
  'mqdefault',
  'default',
];

export function getHighResolutionVideoThumbnail(thumbnail: string): string {
  return getVideoThumbnailCandidate(thumbnail, 0);
}

export function getNextVideoThumbnailFallback(currentThumbnail: string): string | null {
  const currentQualityIndex = YOUTUBE_THUMBNAIL_QUALITY_ORDER.findIndex((quality) => {
    return new RegExp(`/${quality}\\.(?:jpg|webp)(?:\\?|$)`, 'i').test(currentThumbnail);
  });

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
    /\/(?:maxresdefault|sddefault|hqdefault|mqdefault|default)\.(jpg|webp)(\?.*)?$/i,
    `/${YOUTUBE_THUMBNAIL_QUALITY_ORDER[qualityIndex]}.$1$2`
  );
}

function isYouTubeVideoThumbnail(thumbnail: string): boolean {
  try {
    const url = new URL(thumbnail);
    return (
      (url.hostname === 'i.ytimg.com' || url.hostname === 'img.youtube.com') &&
      /\/(?:vi|vi_webp)\/[^/]+\/(?:maxresdefault|sddefault|hqdefault|mqdefault|default)\.(?:jpg|webp)$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}
