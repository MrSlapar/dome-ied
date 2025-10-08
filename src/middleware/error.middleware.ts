/**
 * Error Handling Middleware
 *
 * Global error handler for Express application.
 */

import { Request, Response, NextFunction } from 'express';
import { logError } from '../utils/logger';
import { isProduction } from '../config/env.config';

/**
 * Custom error class with status code
 */
export class HttpError extends Error {
  statusCode: number;
  details?: any;

  constructor(message: string, statusCode: number = 500, details?: any) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Global error handling middleware
 *
 * Must be registered after all routes.
 */
export function errorHandler(
  err: Error | HttpError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log the error
  logError('Request error', err, {
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // Determine status code
  const statusCode = err instanceof HttpError ? err.statusCode : 500;

  // Prepare error response
  const errorResponse: any = {
    error: err.name || 'InternalServerError',
    message: err.message || 'An unexpected error occurred',
  };

  // Add details if available (only in development)
  if (err instanceof HttpError && err.details) {
    errorResponse.details = err.details;
  }

  // Add stack trace in development
  if (!isProduction() && err.stack) {
    errorResponse.stack = err.stack.split('\n');
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
}

/**
 * 404 Not Found handler
 *
 * Must be registered after all routes but before error handler.
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  const error = new HttpError(`Route not found: ${req.method} ${req.path}`, 404);
  next(error);
}

/**
 * Async route wrapper
 *
 * Wraps async route handlers to catch promise rejections.
 * Usage: app.get('/path', asyncHandler(async (req, res) => { ... }))
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
