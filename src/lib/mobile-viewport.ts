interface ViewportSize {
  width: number;
  height: number;
}

const PHONE_LANDSCAPE_MAX_WIDTH = 960;
const PHONE_LANDSCAPE_MAX_HEIGHT = 500;

export function isCompactMobileViewport({ width, height }: ViewportSize) {
  return width < 640 || (width <= PHONE_LANDSCAPE_MAX_WIDTH && height <= PHONE_LANDSCAPE_MAX_HEIGHT);
}

export function getCurrentViewportSize(): ViewportSize {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}
