/**
 * Health Controller
 *
 * Health check endpoint for monitoring.
 */

import { Request, Response } from 'express';
import { adapterPool } from '../services/adapter.client';
import { pingRedis } from '../config/redis.config';
import { getCacheStats } from '../services/cache.service';
import { getSubscriptionCount } from '../services/subscription.service';
import { logError } from '../utils/logger';

/**
 * GET /health
 *
 * Health check endpoint with dependency status.
 */
export async function healthCheck(_req: Request, res: Response): Promise<void> {
  try {
    // Check Redis
    const redisHealthy = await pingRedis();

    // Check adapters
    const adapterHealth = await adapterPool.healthCheckAll();

    // Determine overall status
    const allAdaptersHealthy = Object.values(adapterHealth).every((status) => status);
    const overallHealthy = redisHealthy && allAdaptersHealthy;

    const status = overallHealthy ? 'UP' : 'DEGRADED';

    const response = {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      redis: redisHealthy ? 'UP' : 'DOWN',
      adapters: Object.entries(adapterHealth).map(([name, healthy]) => ({
        name,
        status: healthy ? 'UP' : 'DOWN',
      })),
      subscriptions: getSubscriptionCount(),
    };

    const statusCode = overallHealthy ? 200 : 503;

    res.status(statusCode).json(response);
  } catch (error) {
    logError('Health check error', error);

    res.status(503).json({
      status: 'DOWN',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    });
  }
}

/**
 * GET /stats
 *
 * Statistics endpoint for debugging and monitoring.
 */
export async function stats(_req: Request, res: Response): Promise<void> {
  try {
    const cacheStats = await getCacheStats();

    const response = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cache: cacheStats,
      subscriptions: getSubscriptionCount(),
      adapters: adapterPool.getAll().map((client) => ({
        name: client.getName(),
        url: client.getUrl(),
      })),
    };

    res.status(200).json(response);
  } catch (error) {
    logError('Stats endpoint error', error);

    res.status(500).json({
      error: 'InternalServerError',
      message: 'Failed to retrieve statistics',
    });
  }
}
