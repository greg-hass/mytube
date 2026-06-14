import { AlertTriangle, Clock3, Loader2, RefreshCw } from 'lucide-react';
import type { SyncStatus } from '../hooks/useRSSVideos';

type CacheStatus = {
  hasCache: boolean;
  isStale: boolean;
  age: number;
  videoCount: number;
};

type Props = {
  status: SyncStatus;
  cacheStatus: CacheStatus;
  onRetryFailed: () => void;
  variant?: 'timeline' | 'menu' | 'compact';
};

export function RefreshStatusPanel({ status, cacheStatus, onRetryFailed, variant = 'timeline' }: Props) {
  const failedChannels = status.failedChannels || [];
  const lastRefresh = status.scheduledRefresh?.lastRunAt
    ? new Date(status.scheduledRefresh.lastRunAt).getTime()
    : status.lastUpdated;
  const nextRefresh = status.scheduledRefresh?.nextRunAt
    ? formatDateTime(status.scheduledRefresh.nextRunAt)
    : status.scheduledRefresh?.enabled === false
      ? 'Off'
      : 'Pending';
  const isMenu = variant === 'menu';
  const isCompact = variant === 'compact';
  const failedPreviewLimit = isMenu ? 3 : 5;
  const progressPercent = status.total
    ? Math.round((status.current / status.total) * 100)
    : 0;

  return (
    <section className={`${isMenu || isCompact ? 'rounded-lg border border-gray-200 bg-white/70 px-3 py-3 dark:border-ios-800 dark:bg-ios-900/70' : 'mb-4 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-ios-800 dark:bg-ios-900'}`}>
      <div className={`flex flex-col gap-3 ${isMenu ? '' : 'lg:flex-row lg:items-start lg:justify-between'}`}>
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3 text-sm font-semibold text-gray-900 dark:text-ios-100">
            <div className="flex min-w-0 items-center gap-2">
              {status.isSyncing ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" />
              ) : (
                <Clock3 className="h-4 w-4 shrink-0 text-gray-500" />
              )}
              <span className="min-w-0 truncate">
                {status.isSyncing
                  ? `Refreshing ${status.current}/${status.total}`
                  : `${status.videos || cacheStatus.videoCount} videos cached`}
              </span>
            </div>
            {status.isSyncing && (
              <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-200">
                {progressPercent}%
              </span>
            )}
          </div>

          <div className={`mt-2 grid gap-2 text-xs text-gray-600 dark:text-ios-300 ${isMenu || isCompact ? '' : 'sm:grid-cols-3'}`}>
            <span>
              <span className="font-medium text-gray-800 dark:text-ios-100">Last refresh</span> {formatRelativeAge(lastRefresh)}
            </span>
            {!isCompact && (
              <>
                <span>
                  <span className="font-medium text-gray-800 dark:text-ios-100">Next refresh</span> {nextRefresh}
                </span>
                <span>
                  <span className="font-medium text-gray-800 dark:text-ios-100">Cache age</span> {formatDuration(cacheStatus.age)}
                  {cacheStatus.isStale ? ' stale' : ''}
                </span>
              </>
            )}
          </div>
        </div>

        {failedChannels.length > 0 && (
          <button
            type="button"
            onClick={onRetryFailed}
            className={`inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-amber-100 px-3 text-sm font-medium text-amber-950 hover:bg-amber-200 dark:bg-amber-950/50 dark:text-amber-100 dark:hover:bg-amber-900/70 ${isMenu || isCompact ? 'w-full' : ''}`}
          >
            <RefreshCw className="h-4 w-4" />
            Retry failed
          </button>
        )}
      </div>

      {failedChannels.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/60 dark:bg-amber-950/30">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-semibold text-amber-950 dark:text-amber-100">
                {failedChannels.length} channel{failedChannels.length === 1 ? '' : 's'} need{failedChannels.length === 1 ? 's' : ''} attention
              </p>
              {!isCompact && (
                <>
                  {failedChannels.slice(0, failedPreviewLimit).map((channel) => (
                    <p key={channel.id} className="text-xs text-amber-800 dark:text-amber-200">
                      <span className="font-medium">{channel.title}</span>: {channel.backoffUntil ? `Backoff until ${formatDateTime(channel.backoffUntil)}` : channel.reason}
                    </p>
                  ))}
                  {failedChannels.length > failedPreviewLimit && (
                    <p className="text-xs text-amber-800 dark:text-amber-200">
                      +{failedChannels.length - failedPreviewLimit} more
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function formatRelativeAge(timestamp: number) {
  if (!timestamp || !Number.isFinite(timestamp)) return 'unknown';
  return `${formatDuration(Math.max(0, Date.now() - timestamp))} ago`;
}

function formatDuration(durationMs: number) {
  const seconds = Math.max(0, Math.floor(durationMs / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Pending';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
