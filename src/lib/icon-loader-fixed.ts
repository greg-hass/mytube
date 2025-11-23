import { resolveChannelThumbnail } from './icon-loader';

/**
 * Handle image loading errors gracefully
 */
export function handleImageLoadError(
  event: React.SyntheticEvent<HTMLImageElement>,
  channelId: string,
  channelTitle: string
): void {
  const img = event.currentTarget;
  const src = img.src;
  
  console.warn(`Failed to load thumbnail for channel ${channelTitle}:`, src);
  
  // Hide the broken image
  img.style.display = 'none';
  
  // For temporary IDs, don't try to resolve thumbnails
  if (channelId.startsWith('handle_') || channelId.startsWith('custom_')) {
    console.log(`Skipping thumbnail resolution for temporary ID: ${channelId}`);
    return;
  }
  
  // Try to resolve the actual channel thumbnail
  resolveChannelThumbnail(channelId).then((thumbnailUrl: string | null) => {
    if (thumbnailUrl && thumbnailUrl !== src) {
      console.log(`Retrying with resolved thumbnail: ${thumbnailUrl}`);
      img.src = thumbnailUrl;
      img.style.display = 'block';
    }
  }).catch((error: unknown) => {
    console.error(`Failed to resolve thumbnail for ${channelTitle}:`, error);
  });
}
