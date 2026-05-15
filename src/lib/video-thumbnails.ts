const YOUTUBE_THUMBNAIL_QUALITY_ORDER = [
  'maxresdefault',
  'hq720',
  'sddefault',
  'hqdefault',
  'mqdefault',
  'default',
];

const YOUTUBE_SHORTS_THUMBNAIL_QUALITY_ORDER = [
  'oar2',
  'maxres2',
  'hq2',
  'frame0',
  ...YOUTUBE_THUMBNAIL_QUALITY_ORDER,
];

const YOUTUBE_THUMBNAIL_NAMES = [
  ...YOUTUBE_SHORTS_THUMBNAIL_QUALITY_ORDER,
  '0',
  '1',
  '2',
  '3',
];

const YOUTUBE_THUMBNAIL_NAME_PATTERN = YOUTUBE_THUMBNAIL_NAMES.join('|');

interface VideoThumbnailOptions {
  isShort?: boolean;
  probeShorts?: boolean;
}

export function getHighResolutionVideoThumbnail(thumbnail: string, options: VideoThumbnailOptions = {}): string {
  return getVideoThumbnailCandidate(
    thumbnail,
    options.isShort || options.probeShorts ? YOUTUBE_SHORTS_THUMBNAIL_QUALITY_ORDER : YOUTUBE_THUMBNAIL_QUALITY_ORDER,
    0
  );
}

export function getNextVideoThumbnailFallback(currentThumbnail: string, options: VideoThumbnailOptions = {}): string | null {
  if (options.probeShorts && /\/oar2\.(?:jpg|webp)(?:\?|$)/i.test(currentThumbnail)) {
    return getVideoThumbnailCandidate(currentThumbnail, YOUTUBE_THUMBNAIL_QUALITY_ORDER, 0);
  }

  const qualityOrder = isShortsThumbnailCandidate(currentThumbnail)
    ? YOUTUBE_SHORTS_THUMBNAIL_QUALITY_ORDER
    : YOUTUBE_THUMBNAIL_QUALITY_ORDER;
  const currentQualityIndex = qualityOrder.findIndex((quality) => {
    return new RegExp(`/${quality}\\.(?:jpg|webp)(?:\\?|$)`, 'i').test(currentThumbnail);
  });

  if (currentQualityIndex === -1 || currentQualityIndex === qualityOrder.length - 1) {
    return null;
  }

  return getVideoThumbnailCandidate(currentThumbnail, qualityOrder, currentQualityIndex + 1);
}

function getVideoThumbnailCandidate(thumbnail: string, qualityOrder: string[], qualityIndex: number): string {
  if (!isYouTubeVideoThumbnail(thumbnail)) {
    return thumbnail;
  }

  return thumbnail.replace(
    new RegExp(`/(${YOUTUBE_THUMBNAIL_NAME_PATTERN})\\.(jpg|webp)(\\?.*)?$`, 'i'),
    `/${qualityOrder[qualityIndex]}.$2$3`
  );
}

function isYouTubeVideoThumbnail(thumbnail: string): boolean {
  try {
    const url = new URL(thumbnail);
    return (
      (/^i\d*\.ytimg\.com$/i.test(url.hostname) || url.hostname === 'img.youtube.com') &&
      new RegExp(`/((?:vi|vi_webp))/[^/]+/(?:${YOUTUBE_THUMBNAIL_NAME_PATTERN})\\.(?:jpg|webp)$`, 'i').test(url.pathname)
    );
  } catch {
    return false;
  }
}

function isShortsThumbnailCandidate(thumbnail: string): boolean {
  return /\/(?:oar2|maxres2|hq2|frame0)\.(?:jpg|webp)(?:\?|$)/i.test(thumbnail);
}

export function isPortraitVideoThumbnail(thumbnail: string): boolean {
  return isShortsThumbnailCandidate(thumbnail);
}
