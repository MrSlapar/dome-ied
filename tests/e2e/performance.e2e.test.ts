/**
 * E2E Tests: Performance and Reliability - Network Latency
 *
 * Tests from PDF Test Plan Section 7:
 * - P1: Simulate network latency on one DLT Adapter
 *
 * These tests validate that IED handles slow/high-latency adapters correctly
 * without failing or blocking other operations.
 */

// Set short replication delay for tests
process.env.REPLICATION_DELAY_MS = '200';

import request from 'supertest';
import { Express } from 'express';
import {
  setupTestServer,
  teardownTestServer,
  clearRedisTestData,
  getTestRedisClient,
} from '../integration/helpers/test-server';
import {
  setupMockAdapterPool,
  resetMockAdapterPool,
  MockAdapterBehavior,
} from '../integration/helpers/mock-adapters';
import { PublishEventRequest } from '../../src/models/event.model';

describe('E2E: Performance - Network Latency (Section 7)', () => {
  let app: Express;

  beforeAll(async () => {
    app = await setupTestServer();
  });

  afterAll(async () => {
    await teardownTestServer();
  });

  beforeEach(async () => {
    await clearRedisTestData();
    resetMockAdapterPool();
  });

  const createPublishRequest = (globalId: string): PublishEventRequest => ({
    eventType: 'ProductAdded',
    dataLocation: `https://marketplace.dome-marketplace.org/product/test?hl=${globalId}`,
    relevantMetadata: ['sbx', 'category:electronics'],
    entityId: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    previousEntityHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
  });

  /**
   * Test P1: Simulate network latency on one DLT Adapter
   *
   * PDF Requirement: Verify IED handles slow adapters gracefully
   */
  describe('[P1] Network Latency Simulation', () => {
    it('should handle slow adapter without blocking other adapters', async () => {
      const globalId = '0xlatency_p1_slow';
      const publishRequest = createPublishRequest(globalId);

      // HashNET is slow (500ms latency), Alastria is fast
      const slowAdapterBehaviors: MockAdapterBehavior[] = [
        {
          name: 'hashnet',
          publishSuccess: true,
          publishDelay: 500, // 500ms latency
          subscribeSuccess: true,
          healthCheckSuccess: true,
        },
        {
          name: 'alastria',
          publishSuccess: true,
          publishDelay: 10, // Fast
          subscribeSuccess: true,
          healthCheckSuccess: true,
        },
      ];

      setupMockAdapterPool(slowAdapterBehaviors);

      const startTime = Date.now();

      const response = await request(app)
        .post('/api/v1/publishEvent')
        .send(publishRequest)
        .expect(201);

      const elapsed = Date.now() - startTime;

      // Should complete successfully
      expect(response.body.adapters).toHaveLength(2);

      // Both adapters should have succeeded
      const hashnetResult = response.body.adapters.find((a: any) => a.name === 'hashnet');
      const alastriaResult = response.body.adapters.find((a: any) => a.name === 'alastria');

      expect(hashnetResult.success).toBe(true);
      expect(alastriaResult.success).toBe(true);

      // Should have waited for slow adapter (at least 500ms)
      expect(elapsed).toBeGreaterThanOrEqual(500);

      // Verify Redis cache updated for both
      const redis = getTestRedisClient();
      const hashnetEvents = await redis.sMembers('publishedEvents:1');
      const alastriaEvents = await redis.sMembers('publishedEvents:2');

      expect(hashnetEvents).toContain(globalId);
      expect(alastriaEvents).toContain(globalId);
    });

    it('should complete successfully even with very high latency adapter', async () => {
      const globalId = '0xlatency_p1_veryslow';
      const publishRequest = createPublishRequest(globalId);

      // HashNET has 1 second latency
      const highLatencyBehaviors: MockAdapterBehavior[] = [
        {
          name: 'hashnet',
          publishSuccess: true,
          publishDelay: 1000, // 1 second latency
          subscribeSuccess: true,
          healthCheckSuccess: true,
        },
        {
          name: 'alastria',
          publishSuccess: true,
          publishDelay: 50,
          subscribeSuccess: true,
          healthCheckSuccess: true,
        },
      ];

      setupMockAdapterPool(highLatencyBehaviors);

      const response = await request(app)
        .post('/api/v1/publishEvent')
        .send(publishRequest)
        .timeout(5000) // 5 second timeout
        .expect(201);

      // Both should succeed
      expect(response.body.adapters.every((a: any) => a.success)).toBe(true);
    }, 10000); // 10 second test timeout

    it('should handle slow adapter failing after delay', async () => {
      const globalId = '0xlatency_p1_slowfail';
      const publishRequest = createPublishRequest(globalId);

      // HashNET is slow and then fails, Alastria succeeds
      const slowFailBehaviors: MockAdapterBehavior[] = [
        {
          name: 'hashnet',
          publishSuccess: false,
          publishError: 'Timeout after delay',
          publishDelay: 500,
          subscribeSuccess: true,
          healthCheckSuccess: true,
        },
        {
          name: 'alastria',
          publishSuccess: true,
          publishDelay: 10,
          subscribeSuccess: true,
          healthCheckSuccess: true,
        },
      ];

      setupMockAdapterPool(slowFailBehaviors);

      const response = await request(app)
        .post('/api/v1/publishEvent')
        .send(publishRequest)
        .expect(201); // Partial success

      // HashNET failed, Alastria succeeded
      const hashnetResult = response.body.adapters.find((a: any) => a.name === 'hashnet');
      const alastriaResult = response.body.adapters.find((a: any) => a.name === 'alastria');

      expect(hashnetResult.success).toBe(false);
      expect(hashnetResult.error).toBe('Timeout after delay');
      expect(alastriaResult.success).toBe(true);

      // Only Alastria should be in cache
      const redis = getTestRedisClient();
      const hashnetEvents = await redis.sMembers('publishedEvents:1');
      const alastriaEvents = await redis.sMembers('publishedEvents:2');

      expect(hashnetEvents).not.toContain(globalId);
      expect(alastriaEvents).toContain(globalId);
    });

    it('should process multiple requests concurrently with mixed latencies', async () => {
      // Variable latency adapters
      const mixedLatencyBehaviors: MockAdapterBehavior[] = [
        {
          name: 'hashnet',
          publishSuccess: true,
          publishDelay: 300,
          subscribeSuccess: true,
          healthCheckSuccess: true,
        },
        {
          name: 'alastria',
          publishSuccess: true,
          publishDelay: 100,
          subscribeSuccess: true,
          healthCheckSuccess: true,
        },
      ];

      setupMockAdapterPool(mixedLatencyBehaviors);

      const requests = [
        createPublishRequest('0xlatency_concurrent1'),
        createPublishRequest('0xlatency_concurrent2'),
        createPublishRequest('0xlatency_concurrent3'),
      ];

      const startTime = Date.now();

      // Send all requests concurrently
      const results = await Promise.all(
        requests.map((req) =>
          request(app)
            .post('/api/v1/publishEvent')
            .send(req)
        )
      );

      const elapsed = Date.now() - startTime;

      // All should succeed
      results.forEach((response) => {
        expect(response.status).toBe(201);
        expect(response.body.adapters.every((a: any) => a.success)).toBe(true);
      });

      // Concurrent processing should complete faster than sequential
      // 3 sequential requests with 300ms delay = 900ms minimum
      // Concurrent should be closer to 300-400ms
      expect(elapsed).toBeLessThan(900);

      // Verify all events in cache
      const redis = getTestRedisClient();
      const hashnetEvents = await redis.sMembers('publishedEvents:1');

      expect(hashnetEvents).toContain('0xlatency_concurrent1');
      expect(hashnetEvents).toContain('0xlatency_concurrent2');
      expect(hashnetEvents).toContain('0xlatency_concurrent3');
    });

    it('should not crash or hang when adapter has extreme latency', async () => {
      const globalId = '0xlatency_extreme';
      const publishRequest = createPublishRequest(globalId);

      // Extreme latency simulation (but within adapter timeout)
      const extremeLatencyBehaviors: MockAdapterBehavior[] = [
        {
          name: 'hashnet',
          publishSuccess: true,
          publishDelay: 2000, // 2 seconds
          subscribeSuccess: true,
          healthCheckSuccess: true,
        },
        {
          name: 'alastria',
          publishSuccess: true,
          publishDelay: 2000, // 2 seconds
          subscribeSuccess: true,
          healthCheckSuccess: true,
        },
      ];

      setupMockAdapterPool(extremeLatencyBehaviors);

      // Should eventually complete, not hang
      const response = await request(app)
        .post('/api/v1/publishEvent')
        .send(publishRequest)
        .timeout(10000) // 10 second test timeout
        .expect(201);

      expect(response.body.adapters).toHaveLength(2);
      expect(response.body.adapters.every((a: any) => a.success)).toBe(true);
    }, 15000); // 15 second test timeout
  });

  /**
   * Additional Latency Edge Cases
   */
  describe('Latency Edge Cases', () => {
    it('should handle one adapter being significantly faster than others', async () => {
      const globalId = '0xlatency_asymmetric';
      const publishRequest = createPublishRequest(globalId);

      const asymmetricBehaviors: MockAdapterBehavior[] = [
        {
          name: 'hashnet',
          publishSuccess: true,
          publishDelay: 5, // Very fast
          subscribeSuccess: true,
          healthCheckSuccess: true,
        },
        {
          name: 'alastria',
          publishSuccess: true,
          publishDelay: 800, // Slow
          subscribeSuccess: true,
          healthCheckSuccess: true,
        },
      ];

      setupMockAdapterPool(asymmetricBehaviors);

      const startTime = Date.now();

      const response = await request(app)
        .post('/api/v1/publishEvent')
        .send(publishRequest)
        .expect(201);

      const elapsed = Date.now() - startTime;

      // Should wait for slow adapter
      expect(elapsed).toBeGreaterThanOrEqual(800);

      // Both should succeed
      expect(response.body.adapters.every((a: any) => a.success)).toBe(true);
    });

    it('should maintain data consistency despite latency differences', async () => {
      const behaviors: MockAdapterBehavior[] = [
        {
          name: 'hashnet',
          publishSuccess: true,
          publishDelay: 100,
          subscribeSuccess: true,
          healthCheckSuccess: true,
        },
        {
          name: 'alastria',
          publishSuccess: true,
          publishDelay: 400,
          subscribeSuccess: true,
          healthCheckSuccess: true,
        },
      ];

      setupMockAdapterPool(behaviors);

      // Publish 5 events
      const globalIds = ['0xconsistency1', '0xconsistency2', '0xconsistency3', '0xconsistency4', '0xconsistency5'];

      for (const globalId of globalIds) {
        await request(app)
          .post('/api/v1/publishEvent')
          .send(createPublishRequest(globalId))
          .expect(201);
      }

      // Verify all events are on all networks
      const redis = getTestRedisClient();
      const hashnetEvents = await redis.sMembers('publishedEvents:1');
      const alastriaEvents = await redis.sMembers('publishedEvents:2');

      globalIds.forEach((id) => {
        expect(hashnetEvents).toContain(id);
        expect(alastriaEvents).toContain(id);
      });

      // Exact counts
      expect(hashnetEvents.length).toBe(5);
      expect(alastriaEvents.length).toBe(5);
    });
  });
});
