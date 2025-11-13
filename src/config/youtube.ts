// YouTube API Configuration
// IMPORTANT: Replace these with your actual API credentials
// See README.md for setup instructions

export const YOUTUBE_CONFIG = {
  // Get this from Google Cloud Console
  // https://console.cloud.google.com/apis/credentials
  CLIENT_ID: import.meta.env.VITE_GOOGLE_CLIENT_ID || 'YOUR_CLIENT_ID_HERE',

  API_KEY: import.meta.env.VITE_YOUTUBE_API_KEY || 'YOUR_API_KEY_HERE',

  // OAuth 2.0 scopes
  SCOPES: 'https://www.googleapis.com/auth/youtube.readonly',

  // Discovery docs
  DISCOVERY_DOCS: [
    'https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest',
  ],
};

export const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
