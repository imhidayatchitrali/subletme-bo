export enum LogLevel {
    DEBUG = 0,
    LOG = 1,
    INFO = 2,
    WARN = 3,
    ERROR = 4,
    NONE = 5,
}

type LoggerConfig = {
    minLevel: LogLevel;
    useColors: boolean;
    includeTimestamp: boolean;
    timestampFormat: 'iso' | 'locale';
    includeContext: boolean;
};

export default class Logger {
    private static config: LoggerConfig = {
        minLevel: LogLevel.DEBUG,
        useColors: true,
        includeTimestamp: true,
        timestampFormat: 'iso',
        includeContext: true,
    };

    private static readonly COLORS = {
        debug: '\x1b[90m', // Gray
        log: '\x1b[36m', // Cyan
        info: '\x1b[33m', // Yellow
        warn: '\x1b[35m', // Magenta
        error: '\x1b[31m', // Red
        reset: '\x1b[0m', // Reset
    };

    /**
     * Configure logger settings
     */
    public static configure(options: Partial<LoggerConfig>): void {
        Logger.config = { ...Logger.config, ...options };
    }

    /**
     * Get the current configuration
     */
    public static getConfig(): LoggerConfig {
        return { ...Logger.config };
    }

    /**
     * Format a timestamp according to configuration
     */
    private static getTimestamp(): string {
        if (!Logger.config.includeTimestamp) return '';

        const now = new Date();
        const timestamp =
            Logger.config.timestampFormat === 'iso'
                ? now.toISOString()
                : now.toLocaleString();

        return `[${timestamp}]`;
    }

    /**
     * Apply color formatting if enabled
     */
    private static colorize(text: string, colorCode: string): string {
        return Logger.config.useColors
            ? `${colorCode}${text}${Logger.COLORS.reset}`
            : text;
    }

    /**
     * Format a log entry with context information
     */
    private static formatLogEntry(
        level: string,
        message: unknown,
        context?: string,
        data?: any,
    ): string {
        const parts: string[] = [];

        const timestamp = Logger.getTimestamp();
        if (timestamp) parts.push(timestamp);

        parts.push(`[${level.toUpperCase()}]`);

        if (context && Logger.config.includeContext) {
            parts.push(`[${context}]`);
        }

        if (typeof message === 'object') {
            parts.push(JSON.stringify(message));
        } else {
            parts.push(String(message));
        }

        if (data !== undefined) {
            if (typeof data === 'object') {
                parts.push(JSON.stringify(data));
            } else {
                parts.push(String(data));
            }
        }

        return parts.join(' ');
    }

    /**
     * Debug level logging (most verbose)
     */
    public static debug(message: unknown, context?: string, data?: any): void {
        if (Logger.config.minLevel <= LogLevel.DEBUG) {
            const logEntry = Logger.formatLogEntry(
                'debug',
                message,
                context,
                data,
            );
            console.debug(Logger.colorize(logEntry, Logger.COLORS.debug));
        }
    }

    /**
     * Standard log level
     */
    public static log(message: unknown, context?: string, data?: any): void {
        if (Logger.config.minLevel <= LogLevel.LOG) {
            const logEntry = Logger.formatLogEntry(
                'log',
                message,
                context,
                data,
            );
            console.log(Logger.colorize(logEntry, Logger.COLORS.log));
        }
    }

    /**
     * Information level logging
     */
    public static info(message: unknown, context?: string, data?: any): void {
        if (Logger.config.minLevel <= LogLevel.INFO) {
            const logEntry = Logger.formatLogEntry(
                'info',
                message,
                context,
                data,
            );
            console.info(Logger.colorize(logEntry, Logger.COLORS.info));
        }
    }

    /**
     * Warning level logging
     */
    public static warn(
        message: string,
        context?: string,
        error?: unknown,
    ): void {
        if (Logger.config.minLevel <= LogLevel.WARN) {
            const logEntry = Logger.formatLogEntry(
                'warn',
                message,
                context,
                error,
            );
            console.warn(Logger.colorize(logEntry, Logger.COLORS.warn));
        }
    }

    /**
     * Error level logging
     */
    public static error(
        message: string,
        context?: string,
        error?: unknown,
    ): void {
        if (Logger.config.minLevel <= LogLevel.ERROR) {
            const logEntry = Logger.formatLogEntry(
                'error',
                message,
                context,
                error,
            );
            console.error(Logger.colorize(logEntry, Logger.COLORS.error));

            // If there's an Error object, also log the stack trace
            if (error instanceof Error && error.stack) {
                console.error(
                    Logger.colorize(
                        `Stack trace: ${error.stack}`,
                        Logger.COLORS.error,
                    ),
                );
            }
        }
    }
}
