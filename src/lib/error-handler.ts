import { toast } from 'sonner';
import { log } from './logger';

interface ErrorOptions {
    context?: string;
    showToast?: boolean;
    silent?: boolean;
}

/**
 * Centralized error handler
 * Logs errors to console and optionally shows a toast notification
 */
export function handleError(error: unknown, options: ErrorOptions = {}) {
    const { context = 'An error occurred', showToast = true, silent = false } = options;

    const errorMessage = error instanceof Error ? error.message : String(error);

    if (!silent) {
        log.error(context, error);
    }

    if (showToast) {
        toast.error(context, {
            description: errorMessage,
            duration: 5000,
        });
    }

    return errorMessage;
}

/**
 * Wrapper for async functions to handle errors automatically
 */
export async function withErrorHandling<T>(
    fn: () => Promise<T>,
    options: ErrorOptions = {}
): Promise<T | null> {
    try {
        return await fn();
    } catch (error) {
        handleError(error, options);
        return null;
    }
}
