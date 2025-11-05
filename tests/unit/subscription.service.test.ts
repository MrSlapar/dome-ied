/**
 * Unit Tests: Subscription Service
 *
 * Tests the subscription service that manages Desmos subscriptions
 * and handles event notifications with deduplication.
 */

import {
  subscribeDesmosToEvents,
  handleDesmosNotification,
  getActiveSubscriptions,
  getSubscriptionCount,
  removeSubscription,
} from '../../src/services/subscription.service';
import { adapterPool } from '../../src/services/adapter.client';
import {
  isEventNotified,
  markEventNotified,
} from '../../src/services/cache.service';
import { DomeEvent } from '../../src/models/event.model';
import { SubscriptionRequest } from '../../src/models/subscription.model';
import axios from 'axios';

// Mock dependencies
jest.mock('../../src/services/adapter.client');
jest.mock('../../src/services/cache.service');
jest.mock('axios');
// Mock UUID with incrementing IDs
let uuidCounter = 0;
jest.mock('uuid', () => ({
  v4: jest.fn(() => `test-subscription-id-${++uuidCounter}`),
}));

const mockAdapterPool = adapterPool as jest.Mocked<typeof adapterPool>;
const mockIsEventNotified = isEventNotified as jest.MockedFunction<typeof isEventNotified>;
const mockMarkEventNotified = markEventNotified as jest.MockedFunction<typeof markEventNotified>;
const mockAxios = axios as jest.Mocked<typeof axios>;

describe('Subscription Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Clear active subscriptions between tests
    const subs = getActiveSubscriptions();
    subs.forEach((sub) => removeSubscription(sub.id));
  });

  describe('subscribeDesmosToEvents', () => {
    const subscriptionRequest: SubscriptionRequest = {
      eventTypes: ['ProductAdded', 'ProductUpdated'],
      notificationEndpoint: 'http://desmos-server/webhook',
    };

    it('should create subscription on all adapters successfully', async () => {
      const mockHashnetAdapter = {
        getName: jest.fn(() => 'hashnet'),
        subscribe: jest.fn().mockResolvedValue(true),
      };

      const mockAlastriaAdapter = {
        getName: jest.fn(() => 'alastria'),
        subscribe: jest.fn().mockResolvedValue(true),
      };

      mockAdapterPool.getAll.mockReturnValue([mockHashnetAdapter, mockAlastriaAdapter] as any);

      const result = await subscribeDesmosToEvents(subscriptionRequest);

      expect(result.success).toBe(true);
      expect(result.subscriptionId).toMatch(/^test-subscription-id-\d+$/);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].adapter).toBe('hashnet');
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].adapter).toBe('alastria');
      expect(result.results[1].success).toBe(true);
    });

    it('should call subscribe on all adapters with correct parameters', async () => {
      const mockAdapter = {
        getName: jest.fn(() => 'hashnet'),
        subscribe: jest.fn().mockResolvedValue(true),
      };

      mockAdapterPool.getAll.mockReturnValue([mockAdapter] as any);

      await subscribeDesmosToEvents(subscriptionRequest);

      expect(mockAdapter.subscribe).toHaveBeenCalledWith({
        eventTypes: ['ProductAdded', 'ProductUpdated'],
        notificationEndpoint: 'http://localhost:8080/internal/desmosNotification',
      });
    });

    it('should store subscription in active subscriptions', async () => {
      const mockAdapter = {
        getName: jest.fn(() => 'hashnet'),
        subscribe: jest.fn().mockResolvedValue(true),
      };

      mockAdapterPool.getAll.mockReturnValue([mockAdapter] as any);

      await subscribeDesmosToEvents(subscriptionRequest);

      const activeSubs = getActiveSubscriptions();
      expect(activeSubs).toHaveLength(1);
      expect(activeSubs[0].id).toMatch(/^test-subscription-id-\d+$/);
      expect(activeSubs[0].eventTypes).toEqual(['ProductAdded', 'ProductUpdated']);
      expect(activeSubs[0].callbackUrl).toBe('http://desmos-server/webhook');
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

      const result = await subscribeDesmosToEvents(subscriptionRequest);

      expect(result.success).toBe(true); // Partial success
      expect(result.results[0].success).toBe(false);
      expect(result.results[1].success).toBe(true);
    });

    it('should fail when all adapters fail', async () => {
      const mockFailingAdapter1 = {
        getName: jest.fn(() => 'hashnet'),
        subscribe: jest.fn().mockResolvedValue(false),
      };

      const mockFailingAdapter2 = {
        getName: jest.fn(() => 'alastria'),
        subscribe: jest.fn().mockResolvedValue(false),
      };

      mockAdapterPool.getAll.mockReturnValue([mockFailingAdapter1, mockFailingAdapter2] as any);

      const result = await subscribeDesmosToEvents(subscriptionRequest);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should remove subscription when all adapters fail', async () => {
      const mockFailingAdapter = {
        getName: jest.fn(() => 'hashnet'),
        subscribe: jest.fn().mockResolvedValue(false),
      };

      mockAdapterPool.getAll.mockReturnValue([mockFailingAdapter] as any);

      await subscribeDesmosToEvents(subscriptionRequest);

      const activeSubs = getActiveSubscriptions();
      expect(activeSubs).toHaveLength(0);
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

      const result = await subscribeDesmosToEvents(subscriptionRequest);

      expect(result.success).toBe(true); // Partial success
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toBe('Connection failed');
    });
  });

  describe('handleDesmosNotification', () => {
    const testEvent: DomeEvent = {
      id: 1,
      timestamp: Date.now(),
      eventType: 'ProductAdded',
      dataLocation: 'https://example.com/product?hl=0xdesmos123',
      relevantMetadata: ['sbx'],
      entityIdHash: '0xentity123',
      previousEntityHash: '0x0000',
    };

    beforeEach(async () => {
      // Create active subscription
      const mockAdapter = {
        getName: jest.fn(() => 'hashnet'),
        subscribe: jest.fn().mockResolvedValue(true),
      };

      mockAdapterPool.getAll.mockReturnValue([mockAdapter] as any);

      await subscribeDesmosToEvents({
        eventTypes: ['ProductAdded'],
        notificationEndpoint: 'http://desmos-server/webhook',
      });
    });

    it('should notify Desmos when event matches subscription', async () => {
      mockIsEventNotified.mockResolvedValue(false);
      mockMarkEventNotified.mockResolvedValue();
      mockAxios.post.mockResolvedValue({ status: 200 });

      await handleDesmosNotification(testEvent);

      expect(mockAxios.post).toHaveBeenCalledWith(
        'http://desmos-server/webhook',
        expect.objectContaining({
          eventType: 'ProductAdded',
          dataLocation: 'https://example.com/product?hl=0xdesmos123',
        }),
        expect.any(Object)
      );
    });

    it('should mark event as notified after notification', async () => {
      mockIsEventNotified.mockResolvedValue(false);
      mockMarkEventNotified.mockResolvedValue();
      mockAxios.post.mockResolvedValue({ status: 200 });

      await handleDesmosNotification(testEvent);

      expect(mockMarkEventNotified).toHaveBeenCalledWith('0xdesmos123');
    });

    it('should skip notification if already notified', async () => {
      mockIsEventNotified.mockResolvedValue(true); // Already notified

      await handleDesmosNotification(testEvent);

      expect(mockAxios.post).not.toHaveBeenCalled();
      expect(mockMarkEventNotified).not.toHaveBeenCalled();
    });

    it('should not notify when no matching subscriptions', async () => {
      mockIsEventNotified.mockResolvedValue(false);

      const nonMatchingEvent = {
        ...testEvent,
        eventType: 'ServiceDeleted', // No subscription for this type
        dataLocation: 'https://example.com/service?hl=0xnomatch456',
      };

      await handleDesmosNotification(nonMatchingEvent);

      expect(mockAxios.post).not.toHaveBeenCalled();
    });

    it('should strip network parameter before notifying', async () => {
      mockIsEventNotified.mockResolvedValue(false);
      mockMarkEventNotified.mockResolvedValue();
      mockAxios.post.mockResolvedValue({ status: 200 });

      const eventWithNetwork = {
        ...testEvent,
        network: 'hashnet',
      } as any;

      await handleDesmosNotification(eventWithNetwork);

      const callArgs = mockAxios.post.mock.calls[0][1];
      expect(callArgs).not.toHaveProperty('network');
    });

    it('should continue even if Desmos notification fails', async () => {
      mockIsEventNotified.mockResolvedValue(false);
      mockMarkEventNotified.mockResolvedValue();
      mockAxios.post.mockRejectedValue(new Error('Desmos server down'));

      // Should not throw
      await expect(handleDesmosNotification(testEvent)).resolves.not.toThrow();

      // Should still mark as notified
      expect(mockMarkEventNotified).toHaveBeenCalledWith('0xdesmos123');
    });

    it('should notify multiple subscriptions for the same event', async () => {
      // Create second subscription
      const mockAdapter = {
        getName: jest.fn(() => 'alastria'),
        subscribe: jest.fn().mockResolvedValue(true),
      };

      mockAdapterPool.getAll.mockReturnValue([mockAdapter] as any);

      await subscribeDesmosToEvents({
        eventTypes: ['ProductAdded'],
        notificationEndpoint: 'http://desmos-server-2/webhook',
      });

      mockIsEventNotified.mockResolvedValue(false);
      mockMarkEventNotified.mockResolvedValue();
      mockAxios.post.mockResolvedValue({ status: 200 });

      await handleDesmosNotification(testEvent);

      expect(mockAxios.post).toHaveBeenCalledTimes(2);
      expect(mockAxios.post).toHaveBeenCalledWith(
        'http://desmos-server/webhook',
        expect.any(Object),
        expect.any(Object)
      );
      expect(mockAxios.post).toHaveBeenCalledWith(
        'http://desmos-server-2/webhook',
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  describe('getActiveSubscriptions', () => {
    it('should return empty array when no subscriptions', () => {
      const subs = getActiveSubscriptions();
      expect(subs).toHaveLength(0);
    });

    it('should return all active subscriptions', async () => {
      const mockAdapter = {
        getName: jest.fn(() => 'hashnet'),
        subscribe: jest.fn().mockResolvedValue(true),
      };

      mockAdapterPool.getAll.mockReturnValue([mockAdapter] as any);

      await subscribeDesmosToEvents({
        eventTypes: ['ProductAdded'],
        notificationEndpoint: 'http://desmos/webhook',
      });

      const subs = getActiveSubscriptions();
      expect(subs).toHaveLength(1);
      expect(subs[0].id).toMatch(/^test-subscription-id-\d+$/);
      expect(subs[0].eventTypes).toEqual(['ProductAdded']);
      expect(subs[0].callbackUrl).toBe('http://desmos/webhook');
      expect(subs[0].createdAt).toBeInstanceOf(Date);
    });
  });

  describe('getSubscriptionCount', () => {
    it('should return 0 when no subscriptions', () => {
      expect(getSubscriptionCount()).toBe(0);
    });

    it('should return correct count', async () => {
      const mockAdapter = {
        getName: jest.fn(() => 'hashnet'),
        subscribe: jest.fn().mockResolvedValue(true),
      };

      mockAdapterPool.getAll.mockReturnValue([mockAdapter] as any);

      await subscribeDesmosToEvents({
        eventTypes: ['ProductAdded'],
        notificationEndpoint: 'http://desmos/webhook',
      });

      expect(getSubscriptionCount()).toBe(1);
    });
  });

  describe('removeSubscription', () => {
    it('should remove subscription successfully', async () => {
      const mockAdapter = {
        getName: jest.fn(() => 'hashnet'),
        subscribe: jest.fn().mockResolvedValue(true),
      };

      mockAdapterPool.getAll.mockReturnValue([mockAdapter] as any);

      const result = await subscribeDesmosToEvents({
        eventTypes: ['ProductAdded'],
        notificationEndpoint: 'http://desmos/webhook',
      });

      expect(getSubscriptionCount()).toBe(1);

      const removed = removeSubscription(result.subscriptionId);

      expect(removed).toBe(true);
      expect(getSubscriptionCount()).toBe(0);
    });

    it('should return false when subscription not found', () => {
      const removed = removeSubscription('non-existent-id');
      expect(removed).toBe(false);
    });
  });
});
