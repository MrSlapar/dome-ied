/**
 * Unit Tests: Replication Service
 *
 * Tests the replication service that handles automatic event
 * replication to missing networks.
 */

import {
  handleIncomingEvent,
  replicateToNetworks,
  setupInternalSubscriptions,
} from '../../src/services/replication.service';
import { adapterPool } from '../../src/services/adapter.client';
import {
  markEventPublished,
  getMissingNetworks,
} from '../../src/services/cache.service';
import { DomeEvent } from '../../src/models/event.model';

// Mock dependencies
jest.mock('../../src/services/adapter.client');
jest.mock('../../src/services/cache.service');

const mockAdapterPool = adapterPool as jest.Mocked<typeof adapterPool>;
const mockMarkEventPublished = markEventPublished as jest.MockedFunction<typeof markEventPublished>;
const mockGetMissingNetworks = getMissingNetworks as jest.MockedFunction<typeof getMissingNetworks>;

describe('Replication Service', () => {
  const testEvent: DomeEvent = {
    id: 1,
    timestamp: Date.now(),
    eventType: 'ProductAdded',
    dataLocation: 'https://example.com/product?hl=0xrepl123',
    relevantMetadata: ['sbx', 'category:electronics'],
    entityIdHash: '0xentity123',
    previousEntityHash: '0x0000',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleIncomingEvent', () => {
    it('should mark event on source network and replicate to missing networks', async () => {
      mockMarkEventPublished.mockResolvedValue();
      mockGetMissingNetworks.mockResolvedValue(['alastria']);

      const mockAlastriaAdapter = {
        getName: jest.fn(() => 'alastria'),
        publishEvent: jest.fn().mockResolvedValue({
          success: true,
          eventId: 'evt_repl_456',
        }),
      };

      mockAdapterPool.get.mockReturnValue(mockAlastriaAdapter as any);

      await handleIncomingEvent(testEvent, 'hashnet');

      // Should mark event on source network
      expect(mockMarkEventPublished).toHaveBeenCalledWith('hashnet', '0xrepl123');

      // Should check for missing networks
      expect(mockGetMissingNetworks).toHaveBeenCalledWith('0xrepl123');

      // Should replicate to missing network
      expect(mockAlastriaAdapter.publishEvent).toHaveBeenCalled();
    });

    it('should skip replication when event is on all networks', async () => {
      mockMarkEventPublished.mockResolvedValue();
      mockGetMissingNetworks.mockResolvedValue([]); // No missing networks

      const mockAdapter = {
        publishEvent: jest.fn(),
      };

      mockAdapterPool.get.mockReturnValue(mockAdapter as any);

      await handleIncomingEvent(testEvent, 'hashnet');

      expect(mockMarkEventPublished).toHaveBeenCalledWith('hashnet', '0xrepl123');
      expect(mockGetMissingNetworks).toHaveBeenCalledWith('0xrepl123');
      expect(mockAdapter.publishEvent).not.toHaveBeenCalled();
    });

    it('should handle errors in event processing', async () => {
      mockMarkEventPublished.mockRejectedValue(new Error('Redis unavailable'));

      // Should not throw - errors are logged but not propagated
      await expect(handleIncomingEvent(testEvent, 'hashnet')).resolves.not.toThrow();
    });
  });

  describe('replicateToNetworks', () => {
    it('should replicate to all target networks in parallel', async () => {
      const mockHashnetAdapter = {
        getName: jest.fn(() => 'hashnet'),
        publishEvent: jest.fn().mockResolvedValue({ success: true }),
      };

      const mockFabricAdapter = {
        getName: jest.fn(() => 'fabric'),
        publishEvent: jest.fn().mockResolvedValue({ success: true }),
      };

      mockAdapterPool.get
        .mockReturnValueOnce(mockHashnetAdapter as any)
        .mockReturnValueOnce(mockFabricAdapter as any);

      mockMarkEventPublished.mockResolvedValue();

      await replicateToNetworks(testEvent, ['hashnet', 'fabric']);

      expect(mockHashnetAdapter.publishEvent).toHaveBeenCalledWith({
        eventType: 'ProductAdded',
        dataLocation: 'https://example.com/product?hl=0xrepl123',
        relevantMetadata: ['sbx', 'category:electronics'],
        entityId: '0xentity123',
        previousEntityHash: '0x0000',
      });

      expect(mockFabricAdapter.publishEvent).toHaveBeenCalled();
      expect(mockMarkEventPublished).toHaveBeenCalledWith('hashnet', '0xrepl123');
      expect(mockMarkEventPublished).toHaveBeenCalledWith('fabric', '0xrepl123');
    });

    it('should continue replication if one network fails', async () => {
      const mockFailingAdapter = {
        getName: jest.fn(() => 'hashnet'),
        publishEvent: jest.fn().mockResolvedValue({
          success: false,
          error: 'Network error',
        }),
      };

      const mockSuccessAdapter = {
        getName: jest.fn(() => 'alastria'),
        publishEvent: jest.fn().mockResolvedValue({ success: true }),
      };

      mockAdapterPool.get
        .mockReturnValueOnce(mockFailingAdapter as any)
        .mockReturnValueOnce(mockSuccessAdapter as any);

      mockMarkEventPublished.mockResolvedValue();

      await replicateToNetworks(testEvent, ['hashnet', 'alastria']);

      // Both should be attempted
      expect(mockFailingAdapter.publishEvent).toHaveBeenCalled();
      expect(mockSuccessAdapter.publishEvent).toHaveBeenCalled();

      // Only successful one should be cached
      expect(mockMarkEventPublished).not.toHaveBeenCalledWith('hashnet', expect.anything());
      expect(mockMarkEventPublished).toHaveBeenCalledWith('alastria', '0xrepl123');
    });

    it('should handle empty target networks array', async () => {
      await replicateToNetworks(testEvent, []);

      expect(mockAdapterPool.get).not.toHaveBeenCalled();
      expect(mockMarkEventPublished).not.toHaveBeenCalled();
    });

    it('should handle adapter not found in pool', async () => {
      mockAdapterPool.get.mockReturnValue(undefined);

      // Should not throw
      await expect(replicateToNetworks(testEvent, ['nonexistent'])).resolves.not.toThrow();
    });

    it('should strip network parameter before replication', async () => {
      const eventWithNetwork = {
        ...testEvent,
        network: 'hashnet',
      } as any;

      const mockAdapter = {
        publishEvent: jest.fn().mockResolvedValue({ success: true }),
      };

      mockAdapterPool.get.mockReturnValue(mockAdapter as any);
      mockMarkEventPublished.mockResolvedValue();

      await replicateToNetworks(eventWithNetwork, ['alastria']);

      // Published event should not have network parameter
      const publishedEvent = mockAdapter.publishEvent.mock.calls[0][0];
      expect(publishedEvent).not.toHaveProperty('network');
    });
  });

  describe('setupInternalSubscriptions', () => {
    beforeEach(() => {
      // Mock environment variables
      process.env.IED_BASE_URL = 'http://localhost:8080';
      process.env.INTERNAL_SUBSCRIPTION_EVENT_TYPES = 'ProductAdded,ProductUpdated';
      process.env.INTERNAL_SUBSCRIPTION_METADATA = 'sbx,prd';
    });

    afterEach(() => {
      delete process.env.INTERNAL_SUBSCRIPTION_EVENT_TYPES;
      delete process.env.INTERNAL_SUBSCRIPTION_METADATA;
    });

    it('should subscribe to all adapters successfully', async () => {
      const mockHashnetAdapter = {
        getName: jest.fn(() => 'hashnet'),
        subscribe: jest.fn().mockResolvedValue(true),
      };

      const mockAlastriaAdapter = {
        getName: jest.fn(() => 'alastria'),
        subscribe: jest.fn().mockResolvedValue(true),
      };

      mockAdapterPool.getAll.mockReturnValue([mockHashnetAdapter, mockAlastriaAdapter] as any);

      await setupInternalSubscriptions();

      expect(mockHashnetAdapter.subscribe).toHaveBeenCalledWith({
        eventTypes: ['ProductAdded', 'ProductUpdated'],
        notificationEndpoint: 'http://localhost:8080/internal/eventNotification/hashnet',
        metadata: ['sbx', 'prd'],
      });

      expect(mockAlastriaAdapter.subscribe).toHaveBeenCalledWith({
        eventTypes: ['ProductAdded', 'ProductUpdated'],
        notificationEndpoint: 'http://localhost:8080/internal/eventNotification/alastria',
        metadata: ['sbx', 'prd'],
      });
    });

    it('should use default values when environment variables not set', async () => {
      delete process.env.INTERNAL_SUBSCRIPTION_EVENT_TYPES;
      delete process.env.INTERNAL_SUBSCRIPTION_METADATA;

      const mockAdapter = {
        getName: jest.fn(() => 'hashnet'),
        subscribe: jest.fn().mockResolvedValue(true),
      };

      mockAdapterPool.getAll.mockReturnValue([mockAdapter] as any);

      await setupInternalSubscriptions();

      expect(mockAdapter.subscribe).toHaveBeenCalledWith({
        eventTypes: ['*'], // Default wildcard
        notificationEndpoint: 'http://localhost:8080/internal/eventNotification/hashnet',
        metadata: ['sbx'], // Default sandbox
      });
    });

    it('should throw error when all subscriptions fail', async () => {
      const mockFailingAdapter = {
        getName: jest.fn(() => 'hashnet'),
        subscribe: jest.fn().mockResolvedValue(false),
      };

      mockAdapterPool.getAll.mockReturnValue([mockFailingAdapter] as any);

      await expect(setupInternalSubscriptions()).rejects.toThrow(
        'Failed to setup internal subscriptions on any adapter'
      );
    });

    it('should succeed with partial failures', async () => {
      const mockFailingAdapter = {
        getName: jest.fn(() => 'hashnet'),
        subscribe: jest.fn().mockResolvedValue(false),
      };

      const mockSuccessAdapter = {
        getName: jest.fn(() => 'alastria'),
        subscribe: jest.fn().mockResolvedValue(true),
      };

      mockAdapterPool.getAll.mockReturnValue([mockFailingAdapter, mockSuccessAdapter] as any);

      // Should not throw with partial success
      await expect(setupInternalSubscriptions()).resolves.not.toThrow();
    });

    it('should handle adapter throwing exceptions', async () => {
      const mockThrowingAdapter = {
        getName: jest.fn(() => 'hashnet'),
        subscribe: jest.fn().mockRejectedValue(new Error('Connection failed')),
      };

      const mockSuccessAdapter = {
        getName: jest.fn(() => 'alastria'),
        subscribe: jest.fn().mockResolvedValue(true),
      };

      mockAdapterPool.getAll.mockReturnValue([mockThrowingAdapter, mockSuccessAdapter] as any);

      // Should not throw - graceful degradation
      await expect(setupInternalSubscriptions()).resolves.not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle event with malformed dataLocation', async () => {
      const malformedEvent = {
        ...testEvent,
        dataLocation: 'not-a-valid-url',
      };

      mockMarkEventPublished.mockResolvedValue();

      // Should not throw - error is logged
      await expect(
        handleIncomingEvent(malformedEvent, 'hashnet')
      ).resolves.not.toThrow();
    });

    it('should handle event with empty metadata', async () => {
      const eventWithEmptyMetadata = {
        ...testEvent,
        relevantMetadata: [],
      };

      mockMarkEventPublished.mockResolvedValue();
      mockGetMissingNetworks.mockResolvedValue(['alastria']);

      const mockAdapter = {
        publishEvent: jest.fn().mockResolvedValue({ success: true }),
      };

      mockAdapterPool.get.mockReturnValue(mockAdapter as any);

      await handleIncomingEvent(eventWithEmptyMetadata, 'hashnet');

      expect(mockAdapter.publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({ relevantMetadata: [] })
      );
    });
  });
});
