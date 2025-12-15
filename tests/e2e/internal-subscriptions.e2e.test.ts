/**
 * E2E Tests: Internal Subscriptions
 *
 * Tests from PDF Test Plan Section 6.3 and 6.4:
 * - I4: IED subscribes to all events from each DLT Adapter
 * - I12: IED shall subscribe to each configured DLT Adapter via subscription to events of interest
 *
 * These tests validate that IED properly sets up internal subscriptions to all adapters
 * for event replication purposes.
 */

import {
  setupInternalSubscriptions,
} from '../../src/services/replication.service';
import { adapterPool } from '../../src/services/adapter.client';

// Mock dependencies
jest.mock('../../src/services/adapter.client');

const mockAdapterPool = adapterPool as jest.Mocked<typeof adapterPool>;

describe('E2E: Internal Subscriptions (Section 6.3, 6.4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set test environment
    process.env.IED_BASE_URL = 'http://localhost:8080';
    process.env.INTERNAL_SUBSCRIPTION_EVENT_TYPES = '*';
    process.env.INTERNAL_SUBSCRIPTION_METADATA = 'sbx';
  });

  afterEach(() => {
    delete process.env.IED_BASE_URL;
    delete process.env.INTERNAL_SUBSCRIPTION_EVENT_TYPES;
    delete process.env.INTERNAL_SUBSCRIPTION_METADATA;
  });

  /**
   * Test I4: IED subscribes to all events from each DLT Adapter
   *
   * PDF Requirement: "Every published event of every configured DLT Adapter
   * is received by the IED callback registered"
   */
  describe('[I4] IED subscribes to all events from each DLT Adapter', () => {
    it('should call subscribe on EVERY configured adapter', async () => {
      const mockHashnetAdapter = {
        getName: jest.fn(() => 'hashnet'),
        subscribe: jest.fn().mockResolvedValue(true),
        healthCheck: jest.fn().mockResolvedValue(true),
      };

      const mockAlastriaAdapter = {
        getName: jest.fn(() => 'alastria'),
        subscribe: jest.fn().mockResolvedValue(true),
        healthCheck: jest.fn().mockResolvedValue(true),
      };

      const mockFabricAdapter = {
        getName: jest.fn(() => 'fabric'),
        subscribe: jest.fn().mockResolvedValue(true),
        healthCheck: jest.fn().mockResolvedValue(true),
      };

      // Configure 3 adapters
      mockAdapterPool.getAll.mockReturnValue([
        mockHashnetAdapter,
        mockAlastriaAdapter,
        mockFabricAdapter,
      ] as any);

      await setupInternalSubscriptions();

      // Verify ALL adapters received subscribe call
      expect(mockHashnetAdapter.subscribe).toHaveBeenCalledTimes(1);
      expect(mockAlastriaAdapter.subscribe).toHaveBeenCalledTimes(1);
      expect(mockFabricAdapter.subscribe).toHaveBeenCalledTimes(1);
    });

    it('should register correct callback endpoint for each adapter', async () => {
      const mockHashnetAdapter = {
        getName: jest.fn(() => 'hashnet'),
        subscribe: jest.fn().mockResolvedValue(true),
      };

      const mockAlastriaAdapter = {
        getName: jest.fn(() => 'alastria'),
        subscribe: jest.fn().mockResolvedValue(true),
      };

      mockAdapterPool.getAll.mockReturnValue([
        mockHashnetAdapter,
        mockAlastriaAdapter,
      ] as any);

      await setupInternalSubscriptions();

      // Verify each adapter gets unique callback URL with network name
      expect(mockHashnetAdapter.subscribe).toHaveBeenCalledWith(
        expect.objectContaining({
          notificationEndpoint: 'http://localhost:8080/internal/eventNotification/hashnet',
        })
      );

      expect(mockAlastriaAdapter.subscribe).toHaveBeenCalledWith(
        expect.objectContaining({
          notificationEndpoint: 'http://localhost:8080/internal/eventNotification/alastria',
        })
      );
    });

    it('should subscribe to wildcard (*) events by default', async () => {
      // Clear specific event types to use default
      delete process.env.INTERNAL_SUBSCRIPTION_EVENT_TYPES;

      const mockAdapter = {
        getName: jest.fn(() => 'hashnet'),
        subscribe: jest.fn().mockResolvedValue(true),
      };

      mockAdapterPool.getAll.mockReturnValue([mockAdapter] as any);

      await setupInternalSubscriptions();

      // Verify wildcard subscription
      expect(mockAdapter.subscribe).toHaveBeenCalledWith(
        expect.objectContaining({
          eventTypes: ['*'],
        })
      );
    });

    it('should subscribe to configured event types when specified', async () => {
      process.env.INTERNAL_SUBSCRIPTION_EVENT_TYPES = 'ProductAdded,ProductUpdated,ServiceCreated';

      const mockAdapter = {
        getName: jest.fn(() => 'hashnet'),
        subscribe: jest.fn().mockResolvedValue(true),
      };

      mockAdapterPool.getAll.mockReturnValue([mockAdapter] as any);

      await setupInternalSubscriptions();

      // Verify specific event types
      expect(mockAdapter.subscribe).toHaveBeenCalledWith(
        expect.objectContaining({
          eventTypes: ['ProductAdded', 'ProductUpdated', 'ServiceCreated'],
        })
      );
    });

    it('should include metadata in subscription request', async () => {
      process.env.INTERNAL_SUBSCRIPTION_METADATA = 'prd,sbx';

      const mockAdapter = {
        getName: jest.fn(() => 'hashnet'),
        subscribe: jest.fn().mockResolvedValue(true),
      };

      mockAdapterPool.getAll.mockReturnValue([mockAdapter] as any);

      await setupInternalSubscriptions();

      // Verify metadata is included
      expect(mockAdapter.subscribe).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: ['prd', 'sbx'],
        })
      );
    });
  });

  /**
   * Test I12: IED shall subscribe to each configured DLT Adapter
   *
   * PDF Requirement: "IED shall receive each event of interest published
   * on each and every configured DLT Adapter"
   */
  describe('[I12] IED subscribes to each DLT Adapter', () => {
    it('should succeed when all adapters accept subscription', async () => {
      const mockHashnetAdapter = {
        getName: jest.fn(() => 'hashnet'),
        subscribe: jest.fn().mockResolvedValue(true),
      };

      const mockAlastriaAdapter = {
        getName: jest.fn(() => 'alastria'),
        subscribe: jest.fn().mockResolvedValue(true),
      };

      mockAdapterPool.getAll.mockReturnValue([
        mockHashnetAdapter,
        mockAlastriaAdapter,
      ] as any);

      // Should not throw
      await expect(setupInternalSubscriptions()).resolves.not.toThrow();

      // Both should have been called
      expect(mockHashnetAdapter.subscribe).toHaveBeenCalled();
      expect(mockAlastriaAdapter.subscribe).toHaveBeenCalled();
    });

    it('should succeed with partial failures (graceful degradation)', async () => {
      const mockFailingAdapter = {
        getName: jest.fn(() => 'hashnet'),
        subscribe: jest.fn().mockResolvedValue(false), // Fails
      };

      const mockSuccessAdapter = {
        getName: jest.fn(() => 'alastria'),
        subscribe: jest.fn().mockResolvedValue(true), // Succeeds
      };

      mockAdapterPool.getAll.mockReturnValue([
        mockFailingAdapter,
        mockSuccessAdapter,
      ] as any);

      // Should not throw - graceful degradation
      await expect(setupInternalSubscriptions()).resolves.not.toThrow();

      // Both should have been attempted
      expect(mockFailingAdapter.subscribe).toHaveBeenCalled();
      expect(mockSuccessAdapter.subscribe).toHaveBeenCalled();
    });

    it('should throw when ALL adapters fail', async () => {
      const mockFailingAdapter1 = {
        getName: jest.fn(() => 'hashnet'),
        subscribe: jest.fn().mockResolvedValue(false),
      };

      const mockFailingAdapter2 = {
        getName: jest.fn(() => 'alastria'),
        subscribe: jest.fn().mockResolvedValue(false),
      };

      mockAdapterPool.getAll.mockReturnValue([
        mockFailingAdapter1,
        mockFailingAdapter2,
      ] as any);

      // Should throw when no adapters succeed
      await expect(setupInternalSubscriptions()).rejects.toThrow(
        'Failed to setup internal subscriptions on any adapter'
      );
    });

    it('should handle adapter exceptions gracefully', async () => {
      const mockThrowingAdapter = {
        getName: jest.fn(() => 'hashnet'),
        subscribe: jest.fn().mockRejectedValue(new Error('Connection refused')),
      };

      const mockSuccessAdapter = {
        getName: jest.fn(() => 'alastria'),
        subscribe: jest.fn().mockResolvedValue(true),
      };

      mockAdapterPool.getAll.mockReturnValue([
        mockThrowingAdapter,
        mockSuccessAdapter,
      ] as any);

      // Should not throw - graceful degradation
      await expect(setupInternalSubscriptions()).resolves.not.toThrow();
    });

    it('should handle empty adapter pool', async () => {
      mockAdapterPool.getAll.mockReturnValue([]);

      // Should throw when no adapters available
      await expect(setupInternalSubscriptions()).rejects.toThrow();
    });
  });

  /**
   * Subscription Configuration Tests
   */
  describe('Subscription Configuration', () => {
    it('should use environment-configured IED_BASE_URL', async () => {
      // Note: IED_BASE_URL is cached at module load time in env.config.ts
      // The jest.setup.ts sets it to 'http://localhost:8080'
      // This test verifies the callback URL is constructed correctly

      const mockAdapter = {
        getName: jest.fn(() => 'hashnet'),
        subscribe: jest.fn().mockResolvedValue(true),
      };

      mockAdapterPool.getAll.mockReturnValue([mockAdapter] as any);

      await setupInternalSubscriptions();

      // Verify callback URL includes base URL and network name
      expect(mockAdapter.subscribe).toHaveBeenCalledWith(
        expect.objectContaining({
          notificationEndpoint: expect.stringMatching(/\/internal\/eventNotification\/hashnet$/),
        })
      );
    });

    it('should include all subscription parameters', async () => {
      process.env.INTERNAL_SUBSCRIPTION_EVENT_TYPES = 'ProductOffering';
      process.env.INTERNAL_SUBSCRIPTION_METADATA = 'test';

      const mockAdapter = {
        getName: jest.fn(() => 'alastria'),
        subscribe: jest.fn().mockResolvedValue(true),
      };

      mockAdapterPool.getAll.mockReturnValue([mockAdapter] as any);

      await setupInternalSubscriptions();

      // Verify complete subscription request
      expect(mockAdapter.subscribe).toHaveBeenCalledWith({
        eventTypes: ['ProductOffering'],
        notificationEndpoint: 'http://localhost:8080/internal/eventNotification/alastria',
        metadata: ['test'],
      });
    });
  });
});
