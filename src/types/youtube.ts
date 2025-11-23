export interface YouTubeChannel {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  customUrl?: string;
  isFavorite?: boolean;
  subscriberCount?: string;
  videoCount?: string;
}

export interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  duration?: string;
  viewCount?: string;
}

export interface YouTubeSubscription {
  id: string;
  snippet: {
    title: string;
    description: string;
    resourceId: {
      channelId: string;
    };
    thumbnails: {
      default: { url: string };
      medium: { url: string };
      high: { url: string };
    };
    publishedAt: string;
  };
}

export interface YouTubeApiResponse<T> {
  items: T[];
  pageInfo: {
    totalResults: number;
    resultsPerPage: number;
  };
  nextPageToken?: string;
}

export interface RSSVideoEntry {
  id: string;
  title: string;
  published: string;
  updated?: string;
  author: {
    name: string;
    uri: string;
  };
  link: {
    '@_href': string;
    '@_rel'?: string;
  };
  'media:group': {
    'media:title'?: string;
    'media:thumbnail': {
      '@_url': string;
      '@_width'?: string;
      '@_height'?: string;
    };
    'media:description': string;
    'media:community'?: {
      'media:starRating'?: {
        '@_count': string;
        '@_average': string;
      };
      'media:statistics'?: {
        '@_views': string;
      };
    };
  };
}

export type ViewMode = 'grid' | 'list';
export type SortBy = 'name' | 'recent' | 'oldest';
