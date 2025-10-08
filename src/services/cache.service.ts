/**
 * Cache Service
 *
 * Redis-based caching service using SET data structures.
 * Tracks:
 * - Events published to each network (network:<name>)
 * - Events notified to Desmos (notifiedEvents)
 */

import { getRedisClient } from '../config/redis.config';
import { getAdapterNames } from '../config/adapters.config';
import { logCacheOperation, logError } from '../utils/logger';

/**
 * Redis key prefixes
 */
const NETWORK_PREFIX = 'network:';
const NOTIFIED_EVENTS_KEY = 'notifiedEvents';

/**
 * Mark an event as published to a specific network
 *
 * @param network - Network name (e.g., "hashnet")
 * @param globalId - Event global ID
 */
export async function markEventPublished(network: string, globalId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    const key = `${NETWORK_PREFIX}${network}`;
    await redis.sAdd(key, globalId);
    logCacheOperation('SADD', key, globalId);
  } catch (error) {
    logError(`Failed to mark event as published on ${network}`, error, { network, globalId });
    throw error;
  }
}

/**
 * Check if an event exists on a specific network
 *
 * @param network - Network name
 * @param globalId - Event global ID
 * @returns true if event exists on network
 */
export async function isEventOnNetwork(network: string, globalId: string): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const key = `${NETWORK_PREFIX}${network}`;
    const exists = await redis.sIsMember(key, globalId);
    logCacheOperation('SISMEMBER', key, { globalId, exists });
    return exists;
  } catch (error) {
    logError(`Failed to check event on ${network}`, error, { network, globalId });
    throw error;
  }
}

/**
 * Get all networks where an event is NOT present
 *
 * @param globalId - Event global ID
 * @param allNetworks - Array of network names to check (defaults to all configured networks)
 * @returns Array of network names where event is missing
 */
export async function getMissingNetworks(
  globalId: string,
  allNetworks?: string[]
): Promise<string[]> {
  try {
    const networks = allNetworks || getAdapterNames();
    const missingNetworks: string[] = [];

    for (const network of networks) {
      const exists = await isEventOnNetwork(network, globalId);
      if (!exists) {
        missingNetworks.push(network);
      }
    }

    logCacheOperation('getMissingNetworks', globalId, { networks, missingNetworks });
    return missingNetworks;
  } catch (error) {
    logError('Failed to get missing networks', error, { globalId });
    throw error;
  }
}

/**
 * Mark an event as notified to Desmos
 *
 * @param globalId - Event global ID
 */
export async function markEventNotified(globalId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.sAdd(NOTIFIED_EVENTS_KEY, globalId);
    logCacheOperation('SADD', NOTIFIED_EVENTS_KEY, globalId);
  } catch (error) {
    logError('Failed to mark event as notified', error, { globalId });
    throw error;
  }
}

/**
 * Check if an event has been notified to Desmos
 *
 * @param globalId - Event global ID
 * @returns true if event has been notified
 */
export async function isEventNotified(globalId: string): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const exists = await redis.sIsMember(NOTIFIED_EVENTS_KEY, globalId);
    logCacheOperation('SISMEMBER', NOTIFIED_EVENTS_KEY, { globalId, exists });
    return exists;
  } catch (error) {
    logError('Failed to check if event notified', error, { globalId });
    throw error;
  }
}

/**
 * Get all events published on a specific network
 *
 * @param network - Network name
 * @returns Array of global IDs
 */
export async function getNetworkEvents(network: string): Promise<string[]> {
  try {
    const redis = getRedisClient();
    const key = `${NETWORK_PREFIX}${network}`;
    const events = await redis.sMembers(key);
    logCacheOperation('SMEMBERS', key, { count: events.length });
    return events;
  } catch (error) {
    logError(`Failed to get events for ${network}`, error, { network });
    throw error;
  }
}

/**
 * Get all notified events
 *
 * @returns Array of global IDs
 */
export async function getNotifiedEvents(): Promise<string[]> {
  try {
    const redis = getRedisClient();
    const events = await redis.sMembers(NOTIFIED_EVENTS_KEY);
    logCacheOperation('SMEMBERS', NOTIFIED_EVENTS_KEY, { count: events.length });
    return events;
  } catch (error) {
    logError('Failed to get notified events', error);
    throw error;
  }
}

/**
 * Get cache statistics
 *
 * @returns Cache statistics object
 */
export async function getCacheStats(): Promise<{
  networks: Record<string, number>;
  notifiedEvents: number;
  total: number;
}> {
  try {
    const redis = getRedisClient();
    const networks = getAdapterNames();
    const stats: Record<string, number> = {};
    let total = 0;

    for (const network of networks) {
      const key = `${NETWORK_PREFIX}${network}`;
      const count = await redis.sCard(key);
      stats[network] = count;
      total += count;
    }

    const notifiedCount = await redis.sCard(NOTIFIED_EVENTS_KEY);

    return {
      networks: stats,
      notifiedEvents: notifiedCount,
      total,
    };
  } catch (error) {
    logError('Failed to get cache stats', error);
    throw error;
  }
}

/**
 * Clear all cache data (use with caution!)
 */
export async function clearCache(): Promise<void> {
  try {
    const redis = getRedisClient();
    const networks = getAdapterNames();

    // Delete network sets
    for (const network of networks) {
      const key = `${NETWORK_PREFIX}${network}`;
      await redis.del(key);
    }

    // Delete notified events
    await redis.del(NOTIFIED_EVENTS_KEY);

    logCacheOperation('CLEAR', 'all', { networks });
  } catch (error) {
    logError('Failed to clear cache', error);
    throw error;
  }
}

/**
 * Remove an event from a network set
 *
 * @param network - Network name
 * @param globalId - Event global ID
 */
export async function removeEventFromNetwork(network: string, globalId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    const key = `${NETWORK_PREFIX}${network}`;
    await redis.sRem(key, globalId);
    logCacheOperation('SREM', key, globalId);
  } catch (error) {
    logError(`Failed to remove event from ${network}`, error, { network, globalId });
    throw error;
  }
}

/**
 * Remove an event from notified events set
 *
 * @param globalId - Event global ID
 */
export async function removeNotifiedEvent(globalId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.sRem(NOTIFIED_EVENTS_KEY, globalId);
    logCacheOperation('SREM', NOTIFIED_EVENTS_KEY, globalId);
  } catch (error) {
    logError('Failed to remove notified event', error, { globalId });
    throw error;
  }
}
