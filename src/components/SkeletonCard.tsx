export const SkeletonCard = (_props: { index: number }) => {
    return (
        <div
            className="bg-white dark:bg-ios-900 rounded-2xl overflow-hidden shadow-lg border border-gray-200 dark:border-ios-800"
        >
            {/* Thumbnail skeleton */}
            <div className="relative aspect-video bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 dark:from-ios-800 dark:via-ios-700 dark:to-ios-800 animate-pulse" />

            {/* Info skeleton */}
            <div className="p-4 space-y-3">
                {/* Title */}
                <div className="h-6 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 dark:from-ios-800 dark:via-ios-700 dark:to-ios-800 rounded animate-pulse w-3/4" />

                {/* Description */}
                <div className="space-y-2">
                    <div className="h-4 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 dark:from-ios-800 dark:via-ios-700 dark:to-ios-800 rounded animate-pulse" />
                    <div className="h-4 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 dark:from-ios-800 dark:via-ios-700 dark:to-ios-800 rounded animate-pulse w-5/6" />
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4">
                    <div className="h-4 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 dark:from-ios-800 dark:via-ios-700 dark:to-ios-800 rounded animate-pulse w-20" />
                    <div className="h-4 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 dark:from-ios-800 dark:via-ios-700 dark:to-ios-800 rounded animate-pulse w-20" />
                </div>
            </div>
        </div>
    );
};
