export interface YouTubeChannel {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  customUrl?: string;
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
  author: {
    name: string;
    uri: string;
  };
  link: {
    '@_href': string;
  };
  'media:group': {
    'media:thumbnail': {
      '@_url': string;
    };
    'media:description': string;
  };
}

export type ViewMode = 'grid' | 'list';
export type SortBy = 'name' | 'recent' | 'oldest';
