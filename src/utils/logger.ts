/**
 * Logger Utility
 *
 * Winston-based logger with structured logging support.
 */

import winston from 'winston';
import { envConfig } from '../config/env.config';

/**
 * Log format: timestamp + level + message + metadata
 */
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

/**
 * Console format for development (human-readable)
 */
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata, null, 2)}`;
    }
    return msg;
  })
);

/**
 * Create Winston logger instance
 */
export const logger = winston.createLogger({
  level: envConfig.logging.level,
  format: envConfig.logging.format === 'json' ? logFormat : consoleFormat,
  defaultMeta: { service: 'dome-ied' },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: envConfig.logging.format === 'json' ? logFormat : consoleFormat,
    }),
  ],
});

/**
 * Log context interface for structured logging
 */
export interface LogContext {
  operation?: string;
  globalId?: string;
  network?: string;
  adapter?: string;
  eventType?: string;
  timestamp?: number;
  [key: string]: any;
}

/**
 * Helper functions for structured logging
 */

export function logInfo(message: string, context?: LogContext): void {
  logger.info(message, context);
}

export function logWarn(message: string, context?: LogContext): void {
  logger.warn(message, context);
}

export function logError(message: string, error?: Error | unknown, context?: LogContext): void {
  if (error instanceof Error) {
    logger.error(message, {
      ...context,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
  } else {
    logger.error(message, { ...context, error });
  }
}

export function logDebug(message: string, context?: LogContext): void {
  logger.debug(message, context);
}

/**
 * Operation-specific logging helpers
 */

export function logPublish(globalId: string, networks: string[], context?: LogContext): void {
  logger.info('Publishing event', {
    operation: 'publish',
    globalId,
    networks,
    ...context,
  });
}

export function logReplicate(
  globalId: string,
  sourceNetwork: string,
  targetNetworks: string[],
  context?: LogContext
): void {
  logger.info('Replicating event', {
    operation: 'replicate',
    globalId,
    sourceNetwork,
    targetNetworks,
    ...context,
  });
}

export function logNotify(globalId: string, callbackUrl: string, context?: LogContext): void {
  logger.info('Notifying subscriber', {
    operation: 'notify',
    globalId,
    callbackUrl,
    ...context,
  });
}

export function logCacheOperation(
  operation: string,
  key: string,
  value?: any,
  context?: LogContext
): void {
  logger.debug('Cache operation', {
    operation: `cache:${operation}`,
    key,
    value,
    ...context,
  });
}

export function logAdapterCall(
  adapter: string,
  endpoint: string,
  method: string,
  context?: LogContext
): void {
  logger.debug('Adapter API call', {
    operation: 'adapter:call',
    adapter,
    endpoint,
    method,
    ...context,
  });
}
