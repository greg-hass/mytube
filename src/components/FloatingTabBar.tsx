import { motion } from "framer-motion";
import {
	Grid3x3,
	TrendingUp,
	Activity,
	ListVideo,
	Heart,
	Plus,
} from "lucide-react";

export type Tab =
	| "subscriptions"
	| "latest"
	| "queue"
	| "activity"
	| "favorites";

interface FloatingTabBarProps {
	activeTab: Tab;
	onTabChange: (tab: Tab) => void;
	onAddChannel: () => void;
	subscriptionCount: number;
	activeChannelCount: number;
	queueCount: number;
	favoriteCount: number;
}

type FloatingTabBarCounts = Pick<
	FloatingTabBarProps,
	"subscriptionCount" | "activeChannelCount" | "queueCount" | "favoriteCount"
>;

const TABS: Array<{
	id: Tab;
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
		getBadge: (p) => p.subscriptionCount,
	},
	{
		id: "activity",
		label: "Activity",
		icon: Activity,
		getBadge: (p) => p.activeChannelCount,
	},
	{
		id: "queue",
		label: "Queue",
		icon: ListVideo,
		getBadge: (p) => p.queueCount,
	},
	{
		id: "favorites",
		label: "Faves",
		icon: Heart,
		getBadge: (p) => p.favoriteCount,
	},
];

export const FloatingTabBar = ({
	activeTab,
	onTabChange,
	onAddChannel,
	subscriptionCount,
	activeChannelCount,
	queueCount,
	favoriteCount,
}: FloatingTabBarProps) => {
	const props = {
		subscriptionCount,
		activeChannelCount,
		queueCount,
		favoriteCount,
	};

	return (
		<motion.nav
			initial={{ y: 100, opacity: 0 }}
			animate={{ y: 0, opacity: 1 }}
			transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.2 }}
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
						const isActive = activeTab === tab.id;
						const badge = tab.getBadge?.(props) ?? null;
						const Icon = tab.icon;

						return (
							<button
								key={tab.id}
								onClick={() => onTabChange(tab.id)}
								className="relative flex flex-1 flex-col items-center justify-center min-w-[3rem] rounded-full px-1.5 py-1 transition-all duration-200 sm:min-w-[4rem]"
								aria-label={tab.label}
								aria-pressed={isActive}
							>
								{isActive && (
									<motion.div
										layoutId="active-tab-indicator"
										className="absolute inset-0 rounded-full bg-gray-100 dark:bg-ios-800/80 shadow-sm"
										transition={{ type: "spring", stiffness: 400, damping: 30 }}
									/>
								)}
								<div className="relative flex items-center justify-center">
									<Icon
										className={`w-6 h-6 sm:w-7 sm:h-7 transition-colors duration-200 ${
											isActive
												? "text-gray-900 dark:text-ios-100"
												: "text-gray-400 dark:text-ios-500"
										}`}
										strokeWidth={isActive ? 2.5 : 2}
									/>
									{badge !== null && badge > 0 && !isActive && (
										<span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm">
											{badge > 99 ? "99+" : badge}
										</span>
									)}
								</div>
								<span
									className={`relative mt-0.5 text-[10px] sm:text-[11px] font-semibold transition-colors duration-200 ${
										isActive
											? "text-gray-900 dark:text-ios-100"
											: "text-gray-400 dark:text-ios-500"
									}`}
								>
									{tab.label}
								</span>
							</button>
						);
					})}

					{/* Add Channel Button */}
					<div className="w-px h-8 bg-gray-200 dark:bg-ios-700 mx-0.5" />
					<motion.button
						whileHover={{ scale: 1.1 }}
						whileTap={{ scale: 0.9 }}
						onClick={onAddChannel}
						className="relative flex flex-1 items-center justify-center min-w-[3rem] rounded-full px-1.5 py-1 transition-all duration-200 sm:min-w-[4rem]"
						title="Add channel"
						aria-label="Add channel"
					>
						<div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-red-600 shadow-sm ring-1 ring-red-500/20 backdrop-blur-xl dark:bg-red-600 dark:ring-red-400/20">
							<Plus
								className="w-6 h-6 sm:w-7 sm:h-7 text-white"
								strokeWidth={2.5}
							/>
						</div>
					</motion.button>
				</div>
			</div>
		</motion.nav>
	);
};
