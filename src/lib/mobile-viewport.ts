interface ViewportSize {
  width: number;
  height: number;
}

const PHONE_LANDSCAPE_MAX_WIDTH = 960;
const PHONE_LANDSCAPE_MAX_HEIGHT = 500;

export const INLINE_VIDEO_PLAYBACK_CHANGE_EVENT = 'inline-video-playback-change';

export interface InlineVideoPlaybackChangeDetail {
  videoId: string;
  isPlaying: boolean;
}

export function reportInlineVideoPlaybackChange(videoId: string, isPlaying: boolean) {
  window.dispatchEvent(new CustomEvent<InlineVideoPlaybackChangeDetail>(
    INLINE_VIDEO_PLAYBACK_CHANGE_EVENT,
    { detail: { videoId, isPlaying } }
  ));
}

export function isCompactMobileViewport({ width, height }: ViewportSize) {
  return width < 640 || (width <= PHONE_LANDSCAPE_MAX_WIDTH && height <= PHONE_LANDSCAPE_MAX_HEIGHT);
}

export function getCurrentViewportSize(): ViewportSize {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}
