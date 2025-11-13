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
    staleTime: 0, // Always fetch fresh
    gcTime: 0, // Don't cache
    refetchOnMount: 'always', // Always refetch when component mounts
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
