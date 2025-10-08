/**
 * Logging Middleware
 *
 * HTTP request/response logging.
 */

import { Request, Response, NextFunction } from 'express';
import { logInfo, logWarn } from '../utils/logger';

/**
 * Request logging middleware
 *
 * Logs incoming HTTP requests with response time.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  // Log request
  logInfo('Incoming request', {
    operation: 'http:request',
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // Capture response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logLevel = res.statusCode >= 400 ? logWarn : logInfo;

    logLevel(`Request completed`, {
      operation: 'http:response',
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
    });
  });

  next();
}

/**
 * Skip logging for specific paths
 *
 * Usage: app.use(skipLoggingFor(['/health']), requestLogger)
 */
export function skipLoggingFor(paths: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (paths.includes(req.path)) {
      next();
    } else {
      requestLogger(req, res, next);
    }
  };
}
