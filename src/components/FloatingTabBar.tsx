import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Grid3x3, TrendingUp, Activity, Heart, Plus } from "lucide-react";

const TAB_BAR_MOUNT_KEY = "tab-bar-mounted";

export type Tab =
	| "subscriptions"
	| "latest"
	| "queue"
	| "activity"
	| "favorites";

type ActionTabId = "add";
type TabId = Tab | ActionTabId;

interface FloatingTabBarProps {
	activeTab: Tab;
	onTabChange: (tab: Tab) => void;
	onAddChannel: () => void;
	subscriptionCount: number;
	activeChannelCount: number;
	favoriteCount: number;
}

type FloatingTabBarCounts = Pick<
	FloatingTabBarProps,
	"subscriptionCount" | "activeChannelCount" | "favoriteCount"
>;

const TABS: Array<{
	id: TabId;
	label: string;
	icon: typeof Grid3x3;
	getBadge?: (props: FloatingTabBarCounts) => number | null;
}> = [
	{
		id: "latest",
		label: "Latest",
		icon: TrendingUp,
	},
	{
		id: "subscriptions",
		label: "Subs",
		icon: Grid3x3,
	},
	{
		id: "activity",
		label: "Activity",
		icon: Activity,
		getBadge: (p) => p.activeChannelCount,
	},
	{
		id: "favorites",
		label: "Faves",
		icon: Heart,
		getBadge: (p) => p.favoriteCount,
	},
	{
		id: "add",
		label: "Add",
		icon: Plus,
	},
];

function isActionTab(id: TabId): id is ActionTabId {
	return id === "add";
}

export const FloatingTabBar = ({
	activeTab,
	onTabChange,
	onAddChannel,
	subscriptionCount,
	activeChannelCount,
	favoriteCount,
}: FloatingTabBarProps) => {
	const props = {
		subscriptionCount,
		activeChannelCount,
		favoriteCount,
	};

	/**
	 * Ensure the tab bar entrance animation only fires once per app
	 * session. Without this, navigating to ChannelViewer and back
	 * re-mounts Dashboard, which re-fires the spring entrance and
	 * causes a visible “slide up from bottom” flicker on every return.
	 *
	 * The useState initializer is pure (reads sessionStorage only).
	 * The write happens in useEffect after first paint.
	 */
	const [isFirstMount] = useState(
		() =>
			typeof sessionStorage !== "undefined" &&
			!sessionStorage.getItem(TAB_BAR_MOUNT_KEY),
	);

	useEffect(() => {
		if (isFirstMount) {
			sessionStorage.setItem(TAB_BAR_MOUNT_KEY, "1");
		}
	}, [isFirstMount]);

	return (
		<motion.nav
			initial={isFirstMount ? { y: 100, opacity: 0 } : false}
			animate={{ y: 0, opacity: 1 }}
			transition={
				isFirstMount
					? { type: "spring", stiffness: 300, damping: 30, delay: 0.2 }
					: { duration: 0 }
			}
			data-testid="floating-tab-bar"
			className="fixed bottom-0 left-0 right-0 z-50 pb-[var(--app-tab-bar-bottom-offset)] pointer-events-none"
		>
			<div
				data-testid="floating-tab-bar-inner"
				className="mx-auto flex w-full max-w-7xl items-center px-4 pb-0 pt-2"
			>
				{/* Tab Bar Pill */}
				<div className="pointer-events-auto flex w-full items-center gap-0.5 rounded-[2rem] bg-white/70 px-2 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.12)] ring-1 ring-white/40 backdrop-blur-2xl dark:bg-ios-950/70 dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] dark:ring-white/10">
					{TABS.map((tab) => {
						const isAction = isActionTab(tab.id);
						const isActive = !isAction && activeTab === tab.id;
						const badge = tab.getBadge?.(props) ?? null;
						const Icon = tab.icon;

						const handleClick = () => {
							if (isActionTab(tab.id)) {
								onAddChannel();
							} else {
								onTabChange(tab.id);
							}
						};

						return (
							<button
								key={tab.id}
								onClick={handleClick}
								className="relative flex flex-1 flex-col items-center justify-center min-w-[3rem] rounded-full px-1.5 py-1 transition-all duration-200 sm:min-w-[4rem]"
								aria-label={tab.label}
								aria-pressed={isActive}
							>
								{isActive && (
									<div className="absolute inset-0 rounded-full bg-gray-100 shadow-sm dark:bg-ios-800/80" />
								)}
								<div className="relative flex items-center justify-center">
									<Icon
										className={`w-6 h-6 sm:w-7 sm:h-7 transition-colors duration-200 ${
											isAction
												? "text-red-500 dark:text-red-400"
												: isActive
													? "text-gray-900 dark:text-ios-100"
													: "text-gray-400 dark:text-ios-500"
										}`}
										strokeWidth={isAction || isActive ? 2.5 : 2}
									/>
									{badge !== null && badge > 0 && !isActive && !isAction && (
										<span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm">
											{badge > 99 ? "99+" : badge}
										</span>
									)}
								</div>
								<span
									className={`relative mt-0.5 text-[10px] sm:text-[11px] font-semibold transition-colors duration-200 ${
										isAction
											? "text-red-500 dark:text-red-400"
											: isActive
												? "text-gray-900 dark:text-ios-100"
												: "text-gray-400 dark:text-ios-500"
									}`}
								>
									{tab.label}
								</span>
							</button>
						);
					})}
				</div>
			</div>
		</motion.nav>
	);
};
