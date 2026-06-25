import { describe, vi } from "vitest";
import type { ReactNode } from "react";
import { registerAddChannelModalTests } from "./AddChannelModal.test-helpers";

vi.mock("framer-motion", () => ({
	AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
	motion: {
		div: ({ animate, children, exit, initial, whileHover, ...props }: any) => {
			void animate;
			void exit;
			void initial;
			void whileHover;
			return <div {...props}>{children}</div>;
		},
		section: ({
			animate,
			children,
			exit,
			initial,
			whileHover,
			...props
		}: any) => {
			void animate;
			void exit;
			void initial;
			void whileHover;
			return <section {...props}>{children}</section>;
		},
	},
}));

vi.mock("../lib/youtube-api", () => ({
	fetchChannelInfoWithFallback: vi.fn(() => Promise.resolve(null)),
}));

describe("AddChannelModal", registerAddChannelModalTests);
