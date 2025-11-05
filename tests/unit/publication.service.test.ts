/**
 * Unit Tests: Publication Service
 *
 * Tests the publication service that handles parallel publishing
 * of events to multiple DLT adapters.
 */

import { publishEventToAllAdapters } from '../../src/services/publication.service';
import { adapterPool } from '../../src/services/adapter.client';
import { markEventPublished } from '../../src/services/cache.service';
import { PublishEventRequest } from '../../src/models/event.model';

// Mock dependencies
jest.mock('../../src/services/adapter.client');
jest.mock('../../src/services/cache.service');

const mockAdapterPool = adapterPool as jest.Mocked<typeof adapterPool>;
const mockMarkEventPublished = markEventPublished as jest.MockedFunction<typeof markEventPublished>;

describe('Publication Service', () => {
  const testEvent: PublishEventRequest = {
    eventType: 'ProductAdded',
    dataLocation: 'https://example.com/product?hl=0xtest123',
    relevantMetadata: ['sbx', 'category:electronics'],
    entityId: '0xentity123',
    previousEntityHash: '0x0000',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('publishEventToAllAdapters -Success Cases', () => {
    it('should publish to all adapters successfully', async () => {
      // Mock two adapters
      const mockHashnetAdapter = {
        getName: jest.fn(() => 'hashnet'),
        publishEvent: jest.fn().mockResolvedValue({
          adapter: 'hashnet',
          success: true,
          timestamp: 1730808000,
        }),
      };

      const mockAlastriaAdapter = {
        getName: jest.fn(() => 'alastria'),
        publishEvent: jest.fn().mockResolvedValue({
          adapter: 'alastria',
          success: true,
          timestamp: 1730808001,
        }),
      };

      mockAdapterPool.getAll.mockReturnValue([mockHashnetAdapter, mockAlastriaAdapter] as any);
      mockMarkEventPublished.mockResolvedValue();

      const result = await publishEventToAllAdapters(testEvent);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toMatchObject({
        adapter: 'hashnet',
        success: true,
      });
      expect(result.results[1]).toMatchObject({
        adapter: 'alastria',
        success: true,
      });

      // Verify cache was updated for both networks
      expect(mockMarkEventPublished).toHaveBeenCalledWith('hashnet', '0xtest123');
      expect(mockMarkEventPublished).toHaveBeenCalledWith('alastria', '0xtest123');
    });

    it('should call publishEvent with correct parameters', async () => {
      const mockAdapter = {
        getName: jest.fn(() => 'hashnet'),
        publishEvent: jest.fn().mockResolvedValue({
          adapter: 'hashnet',
          success: true,
        }),
      };

      mockAdapterPool.getAll.mockReturnValue([mockAdapter] as any);
      mockMarkEventPublished.mockResolvedValue();

      await publishEventToAllAdapters(testEvent);

      expect(mockAdapter.publishEvent).toHaveBeenCalledWith(testEvent);
      expect(mockAdapter.publishEvent).toHaveBeenCalledTimes(1);
    });
  });

  describe('publishEventToAllAdapters -Partial Failures', () => {
    it('should continue publishing when one adapter fails', async () => {
      const mockFailingAdapter = {
        getName: jest.fn(() => 'hashnet'),
        publishEvent: jest.fn().mockResolvedValue({
          adapter: 'hashnet',
          success: false,
          error: 'Network timeout',
        }),
      };

      const mockSuccessAdapter = {
        getName: jest.fn(() => 'alastria'),
        publishEvent: jest.fn().mockResolvedValue({
          adapter: 'alastria',
          success: true,
          timestamp: 1730808789,
        }),
      };

      mockAdapterPool.getAll.mockReturnValue([mockFailingAdapter, mockSuccessAdapter] as any);
      mockMarkEventPublished.mockResolvedValue();

      const result = await publishEventToAllAdapters(testEvent);

      expect(result.success).toBe(true); // Partial success
      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toMatchObject({
        adapter: 'hashnet',
        success: false,
        error: 'Network timeout',
      });
      expect(result.results[1]).toMatchObject({
        adapter: 'alastria',
        success: true,
      });

      // Cache should only be updated for successful publish
      expect(mockMarkEventPublished).not.toHaveBeenCalledWith('hashnet', expect.anything());
      expect(mockMarkEventPublished).toHaveBeenCalledWith('alastria', '0xtest123');
    });

    it('should handle adapter throwing exceptions', async () => {
      const mockThrowingAdapter = {
        getName: jest.fn(() => 'hashnet'),
        publishEvent: jest.fn().mockRejectedValue(new Error('Connection refused')),
      };

      const mockSuccessAdapter = {
        getName: jest.fn(() => 'alastria'),
        publishEvent: jest.fn().mockResolvedValue({
          adapter: 'alastria',
          success: true,
        }),
      };

      mockAdapterPool.getAll.mockReturnValue([mockThrowingAdapter, mockSuccessAdapter] as any);
      mockMarkEventPublished.mockResolvedValue();

      const result = await publishEventToAllAdapters(testEvent);

      expect(result.success).toBe(true); // Partial success
      expect(result.results[0].adapter).toBe('unknown'); // When promise rejects, adapter is 'unknown'
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toBeDefined();
    });
  });

  describe('publishEventToAllAdapters -Complete Failures', () => {
    it('should return failure when all adapters fail', async () => {
      const mockFailingAdapter1 = {
        getName: jest.fn(() => 'hashnet'),
        publishEvent: jest.fn().mockResolvedValue({
          adapter: 'hashnet',
          success: false,
          error: 'Network error',
        }),
      };

      const mockFailingAdapter2 = {
        getName: jest.fn(() => 'alastria'),
        publishEvent: jest.fn().mockResolvedValue({
          adapter: 'alastria',
          success: false,
          error: 'Blockchain unavailable',
        }),
      };

      mockAdapterPool.getAll.mockReturnValue([mockFailingAdapter1, mockFailingAdapter2] as any);

      const result = await publishEventToAllAdapters(testEvent);

      expect(result.success).toBe(false);
      expect(result.results).toHaveLength(2);
      expect(result.results.every((r) => !r.success)).toBe(true);
      expect(mockMarkEventPublished).not.toHaveBeenCalled();
    });

    it('should handle empty adapter pool', async () => {
      mockAdapterPool.getAll.mockReturnValue([]);

      const result = await publishEventToAllAdapters(testEvent);

      expect(result.success).toBe(false);
      expect(result.results).toHaveLength(0);
      expect(mockMarkEventPublished).not.toHaveBeenCalled();
    });
  });

  describe('publishEventToAllAdapters -Parallel Execution', () => {
    it('should publish to all adapters in parallel', async () => {
      const publishTimes: number[] = [];
      const startTime = Date.now();

      const createDelayedAdapter = (name: string, delay: number) => ({
        getName: jest.fn(() => name),
        publishEvent: jest.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, delay));
          publishTimes.push(Date.now() - startTime);
          return {
            adapter: name,
            success: true,
          };
        }),
      });

      const adapter1 = createDelayedAdapter('network1', 100);
      const adapter2 = createDelayedAdapter('network2', 100);
      const adapter3 = createDelayedAdapter('network3', 100);

      mockAdapterPool.getAll.mockReturnValue([adapter1, adapter2, adapter3] as any);
      mockMarkEventPublished.mockResolvedValue();

      await publishEventToAllAdapters(testEvent);

      // All adapters should complete around the same time (parallel execution)
      // If sequential, would take 300ms. Parallel should take ~100ms
      const totalTime = Date.now() - startTime;
      expect(totalTime).toBeLessThan(250); // Allow for some overhead
    });
  });

  describe('Edge Cases', () => {
    it('should handle events with missing optional fields', async () => {
      const minimalEvent: PublishEventRequest = {
        eventType: 'ProductOffering',
        dataLocation: 'https://example.com/offering?hl=0xminimal111',
        relevantMetadata: [],
        entityId: '0xentity111',
        previousEntityHash: '0x0000',
      };

      const mockAdapter = {
        getName: jest.fn(() => 'hashnet'),
        publishEvent: jest.fn().mockResolvedValue({
          adapter: 'hashnet',
          success: true,
        }),
      };

      mockAdapterPool.getAll.mockReturnValue([mockAdapter] as any);
      mockMarkEventPublished.mockResolvedValue();

      const result = await publishEventToAllAdapters(minimalEvent);

      expect(result.success).toBe(true);
      expect(mockAdapter.publishEvent).toHaveBeenCalledWith(minimalEvent);
    });

    it('should extract global ID correctly for cache updates', async () => {
      const eventWithComplexUrl: PublishEventRequest = {
        ...testEvent,
        dataLocation: 'https://example.com/path?foo=bar&hl=0xcomplex456&baz=qux',
      };

      const mockAdapter = {
        getName: jest.fn(() => 'alastria'),
        publishEvent: jest.fn().mockResolvedValue({
          adapter: 'alastria',
          success: true,
        }),
      };

      mockAdapterPool.getAll.mockReturnValue([mockAdapter] as any);
      mockMarkEventPublished.mockResolvedValue();

      await publishEventToAllAdapters(eventWithComplexUrl);

      expect(mockMarkEventPublished).toHaveBeenCalledWith('alastria', '0xcomplex456');
    });
  });
});
