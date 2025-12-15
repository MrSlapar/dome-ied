/**
 * Test Server Helpers
 *
 * Utilities for setting up Express app and Redis for integration tests.
 */

import express, { Express } from 'express';
import { Server } from 'http';
import { connectRedis, disconnectRedis, getRedisClient } from '../../../src/config/redis.config';
import apiRoutes from '../../../src/routes/api.routes';
import { errorHandler } from '../../../src/middleware/error.middleware';

let server: Server | null = null;
let app: Express | null = null;

/**
 * Setup test server with Express and Redis
 */
export async function setupTestServer(): Promise<Express> {
  // Connect to Redis (test database)
  await connectRedis();

  // Create Express app
  app = express();
  app.use(express.json());

  // Register routes (routes already have /api/v1 prefix)
  app.use('/', apiRoutes);

  // Error handler
  app.use(errorHandler);

  return app;
}

/**
 * Start HTTP server on random port
 */
export async function startTestServer(testApp: Express): Promise<number> {
  return new Promise((resolve, reject) => {
    server = testApp.listen(0, () => {
      const address = server!.address();
      if (typeof address === 'object' && address !== null) {
        resolve(address.port);
      } else {
        reject(new Error('Failed to get server port'));
      }
    });
  });
}

/**
 * Stop test server and disconnect Redis
 */
export async function teardownTestServer(): Promise<void> {
  if (server) {
    await new Promise<void>((resolve) => {
      server!.close(() => resolve());
    });
    server = null;
  }

  await disconnectRedis();
  app = null;
}

/**
 * Clear Redis test data
 */
export async function clearRedisTestData(): Promise<void> {
  const redis = getRedisClient();

  // Get all keys
  const keys = await redis.keys('*');

  // Delete all keys
  if (keys.length > 0) {
    await redis.del(keys);
  }
}

/**
 * Get Redis client for test assertions
 */
export function getTestRedisClient() {
  return getRedisClient();
}
