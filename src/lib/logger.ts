/**
 * Centralized logging utility with environment-based filtering
 */

export type LogLevel = 0 | 1 | 2 | 3 | 4;

export const LogLevel = {
    DEBUG: 0 as LogLevel,
    INFO: 1 as LogLevel,
    WARN: 2 as LogLevel,
    ERROR: 3 as LogLevel,
    NONE: 4 as LogLevel,
} as const;

interface LogContext {
    [key: string]: any;
}

class Logger {
    private level: LogLevel;
    private isDevelopment: boolean;

    constructor() {
        this.isDevelopment = import.meta.env.DEV;
        // In production, only show warnings and errors
        this.level = this.isDevelopment ? LogLevel.DEBUG : LogLevel.WARN;
    }

    private shouldLog(level: LogLevel): boolean {
        return level >= this.level;
    }

    private formatMessage(level: string, message: string, context?: LogContext): string {
        const timestamp = new Date().toISOString();
        const contextStr = context ? ` ${JSON.stringify(context)}` : '';
        return `[${timestamp}] ${level}: ${message}${contextStr}`;
    }

    debug(message: string, context?: LogContext) {
        if (this.shouldLog(LogLevel.DEBUG)) {
            console.log(this.formatMessage('DEBUG', message, context));
        }
    }

    info(message: string, context?: LogContext) {
        if (this.shouldLog(LogLevel.INFO)) {
            console.log(this.formatMessage('INFO', message, context));
        }
    }

    warn(message: string, context?: LogContext) {
        if (this.shouldLog(LogLevel.WARN)) {
            console.warn(this.formatMessage('WARN', message, context));
        }
    }

    error(message: string, error?: Error | unknown, context?: LogContext) {
        if (this.shouldLog(LogLevel.ERROR)) {
            const errorContext = error instanceof Error
                ? { ...context, error: error.message, stack: error.stack }
                : { ...context, error };
            console.error(this.formatMessage('ERROR', message, errorContext));
        }
    }

    setLevel(level: LogLevel) {
        this.level = level;
    }
}

// Export singleton instance
export const logger = new Logger();

// Convenience exports
export const log = {
    debug: (msg: string, ctx?: LogContext) => logger.debug(msg, ctx),
    info: (msg: string, ctx?: LogContext) => logger.info(msg, ctx),
    warn: (msg: string, ctx?: LogContext) => logger.warn(msg, ctx),
    error: (msg: string, err?: Error | unknown, ctx?: LogContext) => logger.error(msg, err, ctx),
};
