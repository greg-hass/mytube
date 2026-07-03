import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import viteCompression from "vite-plugin-compression";
import { VitePWA } from "vite-plugin-pwa";

export const pwaRuntimeCaching = [
	{
		urlPattern: /^https:\/\/www\.youtube\.com\/.*/i,
		handler: "NetworkFirst" as const,
		options: {
			cacheName: "youtube-cache",
			expiration: {
				maxEntries: 50,
				maxAgeSeconds: 60 * 60 * 24, // 1 day
			},
		},
	},
	{
		urlPattern: /^https:\/\/i\.ytimg\.com\/.*/i,
		handler: "CacheFirst" as const,
		options: {
			cacheName: "youtube-images",
			expiration: {
				maxEntries: 1000,
				maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
			},
		},
	},
	{
		urlPattern: ({ url }: { url: URL }) =>
			url.pathname === "/api/channel-thumbnail" ||
			url.hostname === "yt3.googleusercontent.com" ||
			url.hostname === "yt3.ggpht.com",
		handler: "CacheFirst" as const,
		options: {
			cacheName: "channel-icons",
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
			algorithm: "gzip",
			ext: ".gz",
		}),
		// PWA with service worker
		VitePWA({
			// Don't register SW in dev — iOS Safari caches the SW aggressively
			// and serves stale bundles, which breaks the HMR loop for local testing.
			// SW only registers in production builds.
			devOptions: { enabled: false },
			registerType: "autoUpdate",
			includeAssets: ["favicon.ico", "robots.txt", "apple-touch-icon.png"],
			manifest: {
				name: "MyTube",
				short_name: "MyTube",
				description: "RSS-first self-hosted YouTube subscription feed reader",
				theme_color: "#030712",
				background_color: "#030712",
				display: "standalone",
				orientation: "portrait",
				icons: [
					{
						src: "/icon-192.png",
						sizes: "192x192",
						type: "image/png",
					},
					{
						src: "/icon-512.png",
						sizes: "512x512",
						type: "image/png",
					},
				],
			},
			workbox: {
				skipWaiting: true,
				clientsClaim: true,
				cleanupOutdatedCaches: true,
				globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
				runtimeCaching: pwaRuntimeCaching,
			},
		}),
	],
	build: {
		// Enable minification with esbuild (faster than terser)
		minify: "esbuild",
		// Code splitting
		rollupOptions: {
			output: {
				manualChunks(id) {
					// Split the data-layer modules into their own chunk so the
					// dynamic imports in useSubscriptionStorage can actually lazy-load.
					// Without this, the static imports (getSubscriptionCount, etc.) pull
					// the entire indexeddb + server-sync + sync-reconcile chain into
					// the main bundle, making the dynamic imports no-ops.
					if (
						id.includes("indexeddb") ||
						id.includes("server-sync") ||
						id.includes("sync-reconcile") ||
						id.includes("subscription-sync") ||
						id.includes("subscription-cache")
					) {
						return "data-layer";
					}
					if (id.includes("node_modules/react/")) return "react-vendor";
					if (id.includes("node_modules/react-dom/")) return "react-vendor";
					if (id.includes("node_modules/@tanstack/")) return "query-vendor";
					if (id.includes("node_modules/framer-motion"))
						return "animation-vendor";
					if (
						id.includes("node_modules/lucide-react") ||
						id.includes("node_modules/zustand")
					)
						return "ui-vendor";
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
		// Allow LAN access for mobile/PWA testing (iPhone on same Wi-Fi hits
		// http://192.168.x.x:5173). Dev-only; doesn't affect production build.
		host: true,
		allowedHosts: true,
		proxy: {
			"/api": {
				target: "http://localhost:3001",
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
			"react",
			"react-dom",
			"@tanstack/react-query",
			"framer-motion",
			"zustand",
			"lucide-react",
		],
	},
});
