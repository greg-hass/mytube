import { describe, vi } from "vitest";
import type { ReactNode } from "react";
import { registerAddChannelModalTests } from "./AddChannelModal.test-helpers";

vi.mock("framer-motion", () => ({
	AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
	motion: {
		div: ({
			animate,
			children,
			exit,
			initial,
			transition,
			whileHover,
			...props
		}: any) => {
			void animate;
			void exit;
			void initial;
			void transition;
			void whileHover;
			return <div {...props}>{children}</div>;
		},
		span: ({
			animate,
			children,
			exit,
			initial,
			transition,
			whileHover,
			...props
		}: any) => {
			void animate;
			void exit;
			void initial;
			void transition;
			void whileHover;
			return <span {...props}>{children}</span>;
		},
		section: ({
			animate,
			children,
			exit,
			initial,
			transition,
			whileHover,
			...props
		}: any) => {
			void animate;
			void exit;
			void initial;
			void transition;
			void whileHover;
			return <section {...props}>{children}</section>;
		},
	},
}));

vi.mock("../lib/youtube-api", () => ({
	fetchChannelInfoWithFallback: vi.fn(() => Promise.resolve(null)),
}));

describe("AddChannelModal", registerAddChannelModalTests);
