import { YOUTUBE_API_BASE } from '../config/youtube';
import type {
  YouTubeSubscription,
  YouTubeApiResponse,
  YouTubeVideo,
  YouTubeChannel,
} from '../types/youtube';

class YouTubeAPI {
  private accessToken: string | null = null;

  setAccessToken(token: string | null) {
    this.accessToken = token;
  }

  private async fetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    const url = new URL(`${YOUTUBE_API_BASE}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`YouTube API error: ${response.statusText}`);
    }

    return response.json();
  }

  async getSubscriptions(maxResults = 50): Promise<YouTubeChannel[]> {
    const allSubscriptions: YouTubeSubscription[] = [];
    let nextPageToken: string | undefined;

    // Fetch all subscriptions (handling pagination)
    do {
      const params: Record<string, string> = {
        part: 'snippet',
        mine: 'true',
        maxResults: '50',
        order: 'alphabetical',
      };

      if (nextPageToken) {
        params.pageToken = nextPageToken;
      }

      const response = await this.fetch<YouTubeApiResponse<YouTubeSubscription>>(
        '/subscriptions',
        params
      );

      allSubscriptions.push(...response.items);
      nextPageToken = response.nextPageToken;
    } while (nextPageToken && allSubscriptions.length < maxResults);

    // Transform to YouTubeChannel format
    return allSubscriptions.map((sub) => ({
      id: sub.snippet.resourceId.channelId,
      title: sub.snippet.title,
      description: sub.snippet.description,
      thumbnail: sub.snippet.thumbnails.high?.url || sub.snippet.thumbnails.medium.url,
      customUrl: undefined,
    }));
  }

  async getChannelDetails(channelId: string): Promise<YouTubeChannel | null> {
    try {
      const response = await this.fetch<YouTubeApiResponse<any>>('/channels', {
        part: 'snippet,statistics',
        id: channelId,
      });

      if (response.items.length === 0) return null;

      const channel = response.items[0];
      return {
        id: channel.id,
        title: channel.snippet.title,
        description: channel.snippet.description,
        thumbnail: channel.snippet.thumbnails.high?.url || channel.snippet.thumbnails.medium.url,
        customUrl: channel.snippet.customUrl,
        subscriberCount: channel.statistics.subscriberCount,
        videoCount: channel.statistics.videoCount,
      };
    } catch (error) {
      console.error('Error fetching channel details:', error);
      return null;
    }
  }

  async getLatestVideos(maxResults = 50): Promise<YouTubeVideo[]> {
    try {
      // Get subscriptions first
      const subscriptions = await this.getSubscriptions(500);

      if (subscriptions.length === 0) {
        return [];
      }

      // Get latest video from each channel (sample first 20 channels to avoid quota issues)
      const channelsToCheck = subscriptions.slice(0, 20);
      const allVideos: YouTubeVideo[] = [];

      // Fetch latest videos from each channel in parallel
      const videoPromises = channelsToCheck.map(async (channel) => {
        try {
          const response = await this.fetch<YouTubeApiResponse<any>>('/search', {
            part: 'snippet',
            channelId: channel.id,
            maxResults: '3',
            order: 'date',
            type: 'video',
          });

          return response.items.map((item: any) => ({
            id: item.id.videoId,
            title: item.snippet.title,
            description: item.snippet.description,
            thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default.url,
            channelId: item.snippet.channelId,
            channelTitle: item.snippet.channelTitle,
            publishedAt: item.snippet.publishedAt,
          }));
        } catch (error) {
          console.error(`Error fetching videos for channel ${channel.title}:`, error);
          return [];
        }
      });

      const videosArrays = await Promise.all(videoPromises);
      videosArrays.forEach((videos) => allVideos.push(...videos));

      // Sort by publish date (newest first)
      allVideos.sort((a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      );

      return allVideos.slice(0, maxResults);
    } catch (error) {
      console.error('Error fetching latest videos:', error);
      return [];
    }
  }

  async searchChannelVideos(channelId: string, maxResults = 10): Promise<YouTubeVideo[]> {
    try {
      const response = await this.fetch<YouTubeApiResponse<any>>('/search', {
        part: 'snippet',
        channelId,
        maxResults: maxResults.toString(),
        order: 'date',
        type: 'video',
      });

      return response.items.map((item: any) => ({
        id: item.id.videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium.url,
        channelId: item.snippet.channelId,
        channelTitle: item.snippet.channelTitle,
        publishedAt: item.snippet.publishedAt,
      }));
    } catch (error) {
      console.error('Error searching channel videos:', error);
      return [];
    }
  }
}

export const youtubeAPI = new YouTubeAPI();
