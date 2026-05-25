import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import viteCompression from 'vite-plugin-compression';
import { VitePWA } from 'vite-plugin-pwa';

export const pwaRuntimeCaching = [
  {
    urlPattern: /^https:\/\/www\.youtube\.com\/.*/i,
    handler: 'NetworkFirst' as const,
    options: {
      cacheName: 'youtube-cache',
      expiration: {
        maxEntries: 50,
        maxAgeSeconds: 60 * 60 * 24, // 1 day
      },
    },
  },
  {
    urlPattern: /^https:\/\/i\.ytimg\.com\/.*/i,
    handler: 'CacheFirst' as const,
    options: {
      cacheName: 'youtube-images',
      expiration: {
        maxEntries: 1000,
        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
      },
    },
  },
  {
    urlPattern: ({ url }: { url: URL }) => (
      url.pathname === '/api/channel-thumbnail' ||
      url.hostname === 'yt3.googleusercontent.com' ||
      url.hostname === 'yt3.ggpht.com'
    ),
    handler: 'CacheFirst' as const,
    options: {
      cacheName: 'channel-icons',
      expiration: {
        maxEntries: 1000,
        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
      },
    },
  },
];

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Gzip compression
    viteCompression({
      algorithm: 'gzip',
      ext: '.gz',
    }),
    // PWA with service worker
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: 'YouTube RSS Subscriptions',
        short_name: 'YT RSS',
        description: 'RSS-first self-hosted YouTube subscription feed reader',
        theme_color: '#030712',
        background_color: '#030712',
        display: 'standalone',
        orientation: 'any',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: pwaRuntimeCaching,
      },
    }),
  ],
  build: {
    // Enable minification with esbuild (faster than terser)
    minify: 'esbuild',
    // Code splitting
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'query-vendor': ['@tanstack/react-query'],
          'animation-vendor': ['framer-motion'],
          'ui-vendor': ['lucide-react', 'zustand'],
        },
      },
    },
    // Optimize chunk size
    chunkSizeWarningLimit: 1000,
    // Enable source maps for production debugging (optional)
    sourcemap: false,
  },
  server: {
    // Fast HMR
    hmr: {
      overlay: true,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
    // Open browser on start
    open: true,
  },
  preview: {
    port: 4173,
    open: true,
  },
  // Optimize dependencies
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@tanstack/react-query',
      'framer-motion',
      'zustand',
      'lucide-react',
    ],
  },
})
