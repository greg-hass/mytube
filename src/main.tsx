import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import "./index.css";
import App from "./App.tsx";
import { installAuthenticatedFetch } from "./lib/api-auth";

installAuthenticatedFetch();

// Create a client with optimized settings
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: "always",
			retry: 1,
			staleTime: 1000 * 30, // 30 seconds
		},
	},
});

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<App />
			<ReactQueryDevtools initialIsOpen={false} />
		</QueryClientProvider>
	</StrictMode>,
);
