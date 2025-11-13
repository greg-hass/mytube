import { useQuery } from '@tanstack/react-query';
import { youtubeAPI } from '../lib/youtube-api';
import { useStore } from '../store/useStore';

export const useLatestVideos = () => {
  const { isAuthenticated } = useStore();

  const {
    data: videos,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['latest-videos'],
    queryFn: () => youtubeAPI.getLatestVideos(50),
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 2, // 2 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
  });

  return {
    videos: videos || [],
    isLoading,
    error,
    refetch,
  };
};
