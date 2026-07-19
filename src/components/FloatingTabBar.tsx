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

interface TabConfig {
	id: TabId;
	label: string;
	icon: typeof Grid3x3;
	getBadge?: (props: FloatingTabBarCounts) => number | null;
}

const TABS: TabConfig[] = [
	{ id: "latest", label: "Latest", icon: TrendingUp },
	{ id: "subscriptions", label: "Subs", icon: Grid3x3 },
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
	{ id: "add", label: "Add", icon: Plus },
];

function isActionTab(id: TabId): id is ActionTabId {
	return id === "add";
}

/** Colour class shared by the icon and the label span. */
function getTabColorClass(isAction: boolean, isActive: boolean): string {
	if (isAction) return "text-red-500 dark:text-red-400";
	if (isActive) return "text-gray-900 dark:text-ios-100";
	return "text-gray-400 dark:text-ios-500";
}

interface TabButtonProps {
	tab: TabConfig;
	activeTab: Tab;
	counts: FloatingTabBarCounts;
	onTabChange: (tab: Tab) => void;
	onAddChannel: () => void;
}

const TabButton = ({
	tab,
	activeTab,
	counts,
	onTabChange,
	onAddChannel,
}: TabButtonProps) => {
	const isAction = isActionTab(tab.id);
	const isActive = !isAction && activeTab === tab.id;
	const badge = tab.getBadge?.(counts) ?? null;
	const showBadge = badge !== null && badge > 0 && !isActive && !isAction;
	const colorClass = getTabColorClass(isAction, isActive);
	const Icon = tab.icon;

	const handleClick = () => {
		if (isActionTab(tab.id)) onAddChannel();
		else onTabChange(tab.id);
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
					className={`w-6 h-6 sm:w-7 sm:h-7 transition-colors duration-200 ${colorClass}`}
					strokeWidth={isAction || isActive ? 2.5 : 2}
				/>
				{showBadge && (
					<span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm">
						{badge > 99 ? "99+" : badge}
					</span>
				)}
			</div>
			<span
				className={`relative mt-0.5 text-[10px] sm:text-[11px] font-semibold transition-colors duration-200 ${colorClass}`}
			>
				{tab.label}
			</span>
		</button>
	);
};

export const FloatingTabBar = ({
	activeTab,
	onTabChange,
	onAddChannel,
	subscriptionCount,
	activeChannelCount,
	favoriteCount,
}: FloatingTabBarProps) => {
	const counts: FloatingTabBarCounts = {
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
		<nav
			data-testid="floating-tab-bar"
			className="fixed bottom-0 left-0 right-0 z-50 pb-[var(--app-tab-bar-bottom-offset)] pointer-events-none"
		>
			<motion.div
				initial={isFirstMount ? { y: 100, opacity: 0 } : false}
				animate={{ y: 0, opacity: 1 }}
				transition={
					isFirstMount
						? { type: "spring", stiffness: 300, damping: 30, delay: 0.2 }
						: { duration: 0 }
				}
				data-testid="floating-tab-bar-inner"
				className="mx-auto flex w-full max-w-7xl items-center px-4 pb-0 pt-2"
			>
				{/* Tab Bar Pill */}
				<div className="pointer-events-auto flex w-full items-center gap-0.5 rounded-[2rem] bg-white/70 px-2 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.12)] ring-1 ring-white/40 backdrop-blur-2xl dark:bg-ios-950/70 dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] dark:ring-white/10">
					{TABS.map((tab) => (
						<TabButton
							key={tab.id}
							tab={tab}
							activeTab={activeTab}
							counts={counts}
							onTabChange={onTabChange}
							onAddChannel={onAddChannel}
						/>
					))}
				</div>
			</motion.div>
		</nav>
	);
};
