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
    queryFn: async () => {
      console.log('🎯 useLatestVideos: queryFn called');
      const result = await youtubeAPI.getLatestVideos(50);
      console.log('🎯 useLatestVideos: queryFn result:', result?.length || 0, 'videos');
      return result;
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 2, // 2 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
  });

  console.log('🎯 useLatestVideos hook state:', {
    authenticated: isAuthenticated,
    videosCount: videos?.length || 0,
    isLoading,
    hasError: !!error,
  });

  return {
    videos: videos || [],
    isLoading,
    error,
    refetch,
  };
};
