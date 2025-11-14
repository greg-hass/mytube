import { useQuery } from '@tanstack/react-query';
import { youtubeAPI } from '../lib/youtube-api';
import { useStore } from '../store/useStore';

export const useChannelVideos = (channelId: string | undefined) => {
  const { isAuthenticated } = useStore();

  const {
    data: videos,
    isLoading: videosLoading,
    error: videosError,
  } = useQuery({
    queryKey: ['channel-videos', channelId],
    queryFn: () => youtubeAPI.searchChannelVideos(channelId!, 30),
    enabled: isAuthenticated && !!channelId,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 15, // 15 minutes
  });

  const {
    data: channelDetails,
    isLoading: detailsLoading,
    error: detailsError,
  } = useQuery({
    queryKey: ['channel-details', channelId],
    queryFn: () => youtubeAPI.getChannelDetails(channelId!),
    enabled: isAuthenticated && !!channelId,
    staleTime: 1000 * 60 * 10, // 10 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
  });

  return {
    videos: videos || [],
    channelDetails,
    isLoading: videosLoading || detailsLoading,
    error: videosError || detailsError,
  };
};
