import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import "./index.css";
import App from "./App.tsx";
import { installAuthenticatedFetch, isAuthError } from "./lib/api-auth";

const ReactQueryDevtools = import.meta.env.DEV
	? lazy(() =>
			import("@tanstack/react-query-devtools").then((module) => ({
				default: module.ReactQueryDevtools,
			})),
		)
	: null;

installAuthenticatedFetch();

// Create a client with optimized settings
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: "always",
			retry: (failureCount, error) =>
				!isAuthError(error) && failureCount < 1,
			staleTime: 1000 * 30, // 30 seconds
		},
	},
});

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<MotionConfig reducedMotion="user">
				<App />
			</MotionConfig>
			{ReactQueryDevtools && (
				<Suspense fallback={null}>
					<ReactQueryDevtools initialIsOpen={false} />
				</Suspense>
			)}
		</QueryClientProvider>
	</StrictMode>,
);
