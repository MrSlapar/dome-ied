/**
 * Unit Tests: Cache Service
 *
 * Tests Redis-based caching operations for event tracking and deduplication.
 * Uses redis-mock to simulate Redis operations without requiring a real Redis server.
 */

import {
  markEventPublished,
  isEventOnNetwork,
  getMissingNetworks,
  markEventNotified,
  isEventNotified,
  getCacheStats,
} from '../../src/services/cache.service';

// Create mock Redis client
const mockRedisClient = {
  sAdd: jest.fn(),
  sIsMember: jest.fn(),
  sMembers: jest.fn(),
  sCard: jest.fn(),
  keys: jest.fn(),
};

// Mock Redis config to return mock client
jest.mock('../../src/config/redis.config', () => ({
  getRedisClient: jest.fn(() => mockRedisClient),
}));

// Mock adapters config to prevent module loading errors
// Chain IDs: hashnet=1, alastria=2 (per specification)
jest.mock('../../src/config/adapters.config', () => ({
  getAdapterNames: jest.fn(() => ['hashnet', 'alastria']),
  getChainIdByNetwork: jest.fn((network: string) => {
    const chainIds: Record<string, string> = {
      'hashnet': '1',
      'alastria': '2',
      'fabric-test-network': 'fabric-test-network', // Fallback for unknown networks
    };
    return chainIds[network] || network;
  }),
  getChainIds: jest.fn(() => ['1', '2']),
}));

describe('Cache Service', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('markEventPublished', () => {
    it('should add event to network set in Redis using chainId key', async () => {
      mockRedisClient.sAdd.mockResolvedValue(1);

      await markEventPublished('hashnet', '0xtest123');

      // hashnet chainId = 1, so key should be publishedEvents:1
      expect(mockRedisClient.sAdd).toHaveBeenCalledWith('publishedEvents:1', '0xtest123');
      expect(mockRedisClient.sAdd).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple networks independently with different chainIds', async () => {
      mockRedisClient.sAdd.mockResolvedValue(1);

      await markEventPublished('hashnet', '0xevent1');
      await markEventPublished('alastria', '0xevent1');

      // hashnet chainId = 1, alastria chainId = 2
      expect(mockRedisClient.sAdd).toHaveBeenCalledWith('publishedEvents:1', '0xevent1');
      expect(mockRedisClient.sAdd).toHaveBeenCalledWith('publishedEvents:2', '0xevent1');
      expect(mockRedisClient.sAdd).toHaveBeenCalledTimes(2);
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedisClient.sAdd.mockRejectedValue(new Error('Redis connection failed'));

      await expect(markEventPublished('hashnet', '0xtest456')).rejects.toThrow(
        'Redis connection failed'
      );
    });
  });

  describe('isEventOnNetwork', () => {
    it('should return true when event exists on network', async () => {
      mockRedisClient.sIsMember.mockResolvedValue(true);

      const result = await isEventOnNetwork('alastria', '0xexisting123');

      expect(result).toBe(true);
      // alastria chainId = 2
      expect(mockRedisClient.sIsMember).toHaveBeenCalledWith('publishedEvents:2', '0xexisting123');
    });

    it('should return false when event does not exist on network', async () => {
      mockRedisClient.sIsMember.mockResolvedValue(false);

      const result = await isEventOnNetwork('hashnet', '0xmissing456');

      expect(result).toBe(false);
      // hashnet chainId = 1
      expect(mockRedisClient.sIsMember).toHaveBeenCalledWith('publishedEvents:1', '0xmissing456');
    });

    it('should check different networks independently', async () => {
      mockRedisClient.sIsMember
        .mockResolvedValueOnce(true)  // Event exists on hashnet
        .mockResolvedValueOnce(false); // Event missing on alastria

      const onHashnet = await isEventOnNetwork('hashnet', '0xevent789');
      const onAlastria = await isEventOnNetwork('alastria', '0xevent789');

      expect(onHashnet).toBe(true);
      expect(onAlastria).toBe(false);
    });
  });

  describe('getMissingNetworks', () => {
    it('should return empty array when event exists on all networks', async () => {
      // Mock adapter pool to return two networks
      jest.mock('../../src/services/adapter.client', () => ({
        adapterPool: {
          getAll: jest.fn(() => [
            { getName: () => 'hashnet' },
            { getName: () => 'alastria' },
          ]),
        },
      }));

      mockRedisClient.sIsMember.mockResolvedValue(true);

      const result = await getMissingNetworks('0xeverywhere123');

      expect(result).toEqual([]);
    });

    it('should return networks where event is missing', async () => {
      mockRedisClient.sIsMember
        .mockResolvedValueOnce(true)   // Exists on hashnet
        .mockResolvedValueOnce(false); // Missing on alastria

      const result = await getMissingNetworks('0xpartial456');

      expect(result).toContain('alastria');
      expect(result).not.toContain('hashnet');
      expect(result).toHaveLength(1);
    });

    it('should return all networks when event is missing everywhere', async () => {
      mockRedisClient.sIsMember.mockResolvedValue(false);

      const result = await getMissingNetworks('0xnowhere789');

      expect(result).toContain('hashnet');
      expect(result).toContain('alastria');
      expect(result).toHaveLength(2);
    });
  });

  describe('markEventNotified', () => {
    it('should add event to notifiedEvents set', async () => {
      mockRedisClient.sAdd.mockResolvedValue(1);

      await markEventNotified('0xnotified123');

      expect(mockRedisClient.sAdd).toHaveBeenCalledWith('notifiedEvents', '0xnotified123');
    });

    it('should handle duplicate notifications', async () => {
      mockRedisClient.sAdd
        .mockResolvedValueOnce(1)  // First call: added
        .mockResolvedValueOnce(0); // Second call: already exists

      await markEventNotified('0xdupe456');
      await markEventNotified('0xdupe456');

      expect(mockRedisClient.sAdd).toHaveBeenCalledTimes(2);
    });
  });

  describe('isEventNotified', () => {
    it('should return true for notified events', async () => {
      mockRedisClient.sIsMember.mockResolvedValue(true);

      const result = await isEventNotified('0xalreadynotified123');

      expect(result).toBe(true);
      expect(mockRedisClient.sIsMember).toHaveBeenCalledWith('notifiedEvents', '0xalreadynotified123');
    });

    it('should return false for unnotified events', async () => {
      mockRedisClient.sIsMember.mockResolvedValue(false);

      const result = await isEventNotified('0xnotyet456');

      expect(result).toBe(false);
    });

    it('should prevent duplicate notifications', async () => {
      mockRedisClient.sIsMember
        .mockResolvedValueOnce(false)  // First check: not notified
        .mockResolvedValueOnce(true);  // Second check: already notified

      const firstCheck = await isEventNotified('0xpreventdupe789');
      const secondCheck = await isEventNotified('0xpreventdupe789');

      expect(firstCheck).toBe(false);
      expect(secondCheck).toBe(true);
    });
  });

  describe('getCacheStats', () => {
    it('should return statistics for all network keys', async () => {
      mockRedisClient.sCard
        .mockResolvedValueOnce(50)   // hashnet count
        .mockResolvedValueOnce(45)   // alastria count
        .mockResolvedValueOnce(60);  // notifiedEvents count

      const stats = await getCacheStats();

      expect(stats).toEqual({
        networks: {
          hashnet: 50,
          alastria: 45,
        },
        notifiedEvents: 60,
        total: 95,
      });
    });

    it('should handle empty cache', async () => {
      mockRedisClient.sCard
        .mockResolvedValueOnce(0)   // hashnet count
        .mockResolvedValueOnce(0)   // alastria count
        .mockResolvedValueOnce(0);  // notifiedEvents count

      const stats = await getCacheStats();

      expect(stats).toEqual({
        networks: {
          hashnet: 0,
          alastria: 0,
        },
        notifiedEvents: 0,
        total: 0,
      });
    });

    it('should handle Redis errors in stats collection', async () => {
      mockRedisClient.sCard.mockRejectedValue(new Error('Redis unavailable'));

      await expect(getCacheStats()).rejects.toThrow('Redis unavailable');
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in global IDs', async () => {
      mockRedisClient.sAdd.mockResolvedValue(1);

      await markEventPublished('hashnet', '0xABCDEF123456!@#$');

      // hashnet chainId = 1
      expect(mockRedisClient.sAdd).toHaveBeenCalledWith('publishedEvents:1', '0xABCDEF123456!@#$');
    });

    it('should handle very long global IDs', async () => {
      const longId = '0x' + 'a'.repeat(200);
      mockRedisClient.sAdd.mockResolvedValue(1);

      await markEventPublished('alastria', longId);

      // alastria chainId = 2
      expect(mockRedisClient.sAdd).toHaveBeenCalledWith('publishedEvents:2', longId);
    });

    it('should handle network names with special characters (uses name as fallback chainId)', async () => {
      mockRedisClient.sIsMember.mockResolvedValue(true);

      await isEventOnNetwork('fabric-test-network', '0xtest123');

      // fabric-test-network uses name as fallback chainId
      expect(mockRedisClient.sIsMember).toHaveBeenCalledWith(
        'publishedEvents:fabric-test-network',
        '0xtest123'
      );
    });
  });
});
