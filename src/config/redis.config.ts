/**
 * Redis Configuration
 *
 * Redis client setup and connection management.
 */

import { createClient, RedisClientType } from 'redis';
import { envConfig } from './env.config';
import { logger } from '../utils/logger';

/**
 * Redis client instance
 */
let redisClient: RedisClientType | null = null;

/**
 * Create and connect to Redis
 */
export async function connectRedis(): Promise<RedisClientType> {
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  const config = {
    socket: {
      host: envConfig.redis.host,
      port: envConfig.redis.port,
    },
    password: envConfig.redis.password,
    database: envConfig.redis.db,
  };

  logger.info('Connecting to Redis...', {
    host: config.socket.host,
    port: config.socket.port,
    db: config.database,
  });

  redisClient = createClient(config);

  // Error handler
  redisClient.on('error', (error) => {
    logger.error('Redis error:', error);
  });

  // Connect handler
  redisClient.on('connect', () => {
    logger.info('Redis connecting...');
  });

  // Ready handler
  redisClient.on('ready', () => {
    logger.info('Redis connected and ready');
  });

  // Reconnecting handler
  redisClient.on('reconnecting', () => {
    logger.warn('Redis reconnecting...');
  });

  // End handler
  redisClient.on('end', () => {
    logger.warn('Redis connection closed');
  });

  await redisClient.connect();

  return redisClient;
}

/**
 * Get Redis client (must be connected first)
 */
export function getRedisClient(): RedisClientType {
  if (!redisClient || !redisClient.isOpen) {
    throw new Error('Redis client not connected. Call connectRedis() first.');
  }
  return redisClient;
}

/**
 * Disconnect from Redis
 */
export async function disconnectRedis(): Promise<void> {
  if (redisClient && redisClient.isOpen) {
    logger.info('Disconnecting from Redis...');
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis disconnected');
  }
}

/**
 * Check if Redis is connected
 */
export function isRedisConnected(): boolean {
  return redisClient !== null && redisClient.isOpen;
}

/**
 * Ping Redis to check connection
 */
export async function pingRedis(): Promise<boolean> {
  try {
    if (!redisClient || !redisClient.isOpen) {
      return false;
    }
    const pong = await redisClient.ping();
    return pong === 'PONG';
  } catch (error) {
    logger.error('Redis ping failed:', error);
    return false;
  }
}
