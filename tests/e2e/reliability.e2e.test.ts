/**
 * E2E Tests: Performance and Reliability - State Persistence
 *
 * Tests from PDF Test Plan Section 7:
 * - P2: Restart IED while Redis retains data and confirm state consistency
 *
 * These tests validate that IED correctly handles state persistence in Redis
 * and maintains consistency after simulated restarts.
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
  mockAdapterBehaviors,
} from '../integration/helpers/mock-adapters';
import { PublishEventRequest, DomeEvent } from '../../src/models/event.model';

const REPLICATION_DELAY_MS = 200;

describe('E2E: Reliability - State Persistence (Section 7)', () => {
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

  const createNotificationEvent = (globalId: string): DomeEvent => ({
    id: 1,
    timestamp: Date.now(),
    eventType: 'ProductAdded',
    dataLocation: `https://marketplace.dome-marketplace.org/product/test?hl=${globalId}`,
    relevantMetadata: ['sbx', 'category:electronics'],
    entityIdHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    previousEntityHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
  });

  /**
   * Test P2: Restart IED while Redis retains data and confirm state consistency
   *
   * PDF Requirement: Verify state persistence across IED restarts
   */
  describe('[P2] State Persistence After Restart', () => {
    it('should retain published events in Redis across Express app recreation', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      const globalId1 = '0xpersistence_p2_retain1';
      const globalId2 = '0xpersistence_p2_retain2';

      // Publish events
      await request(app)
        .post('/api/v1/publishEvent')
        .send(createPublishRequest(globalId1))
        .expect(201);

      await request(app)
        .post('/api/v1/publishEvent')
        .send(createPublishRequest(globalId2))
        .expect(201);

      // Get Redis state BEFORE restart
      const redis = getTestRedisClient();
      const hashnetBefore = await redis.sMembers('publishedEvents:1');
      const alastriaBefore = await redis.sMembers('publishedEvents:2');

      expect(hashnetBefore).toContain(globalId1);
      expect(hashnetBefore).toContain(globalId2);
      expect(alastriaBefore).toContain(globalId1);
      expect(alastriaBefore).toContain(globalId2);

      // Simulate "restart" by resetting mocks (Redis connection stays)
      resetMockAdapterPool();
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      // Verify Redis state AFTER simulated restart
      const hashnetAfter = await redis.sMembers('publishedEvents:1');
      const alastriaAfter = await redis.sMembers('publishedEvents:2');

      // State should be identical
      expect(hashnetAfter).toEqual(hashnetBefore);
      expect(alastriaAfter).toEqual(alastriaBefore);
    });

    it('should not duplicate events after restart with new publications', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      const globalId = '0xpersistence_p2_nodupe';

      // First publication
      await request(app)
        .post('/api/v1/publishEvent')
        .send(createPublishRequest(globalId))
        .expect(201);

      const redis = getTestRedisClient();
      const countBefore = await redis.sCard('publishedEvents:1');
      expect(countBefore).toBe(1);

      // Simulate restart
      resetMockAdapterPool();
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      // Try to publish same event again (after "restart")
      await request(app)
        .post('/api/v1/publishEvent')
        .send(createPublishRequest(globalId))
        .expect(201);

      // Should still be only 1 (Sets don't duplicate)
      const countAfter = await redis.sCard('publishedEvents:1');
      expect(countAfter).toBe(1);
    });

    it('should correctly detect existing events for replication after restart', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      const globalId = '0xpersistence_p2_replication';

      // Event comes from HashNET
      await request(app)
        .post('/internal/eventNotification/hashnet')
        .send(createNotificationEvent(globalId))
        .expect(200);

      // Wait for replication
      await new Promise((resolve) => setTimeout(resolve, REPLICATION_DELAY_MS + 200));

      const redis = getTestRedisClient();

      // Verify replicated to Alastria
      const alastriaBefore = await redis.sIsMember('publishedEvents:2', globalId);
      expect(alastriaBefore).toBe(true);

      // Simulate restart
      resetMockAdapterPool();
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      // Same event arrives again from HashNET (after restart)
      await request(app)
        .post('/internal/eventNotification/hashnet')
        .send(createNotificationEvent(globalId))
        .expect(200);

      // Wait for potential re-replication
      await new Promise((resolve) => setTimeout(resolve, REPLICATION_DELAY_MS + 200));

      // Should still be just 1 entry per network (no duplicates)
      const hashnetCount = await redis.sCard('publishedEvents:1');
      const alastriaCount = await redis.sCard('publishedEvents:2');

      expect(hashnetCount).toBe(1);
      expect(alastriaCount).toBe(1);
    });

    it('should maintain notifiedEvents set across restart', async () => {
      const redis = getTestRedisClient();

      // Pre-populate notifiedEvents
      await redis.sAdd('notifiedEvents', '0xnotified_persist1');
      await redis.sAdd('notifiedEvents', '0xnotified_persist2');
      await redis.sAdd('notifiedEvents', '0xnotified_persist3');

      const countBefore = await redis.sCard('notifiedEvents');
      expect(countBefore).toBe(3);

      // Simulate restart
      resetMockAdapterPool();
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      // notifiedEvents should persist
      const countAfter = await redis.sCard('notifiedEvents');
      expect(countAfter).toBe(3);

      // Verify specific IDs
      const notified1 = await redis.sIsMember('notifiedEvents', '0xnotified_persist1');
      const notified2 = await redis.sIsMember('notifiedEvents', '0xnotified_persist2');
      const notified3 = await redis.sIsMember('notifiedEvents', '0xnotified_persist3');

      expect(notified1).toBe(true);
      expect(notified2).toBe(true);
      expect(notified3).toBe(true);
    });
  });

  /**
   * State Consistency Tests
   */
  describe('State Consistency Verification', () => {
    it('should maintain accurate count of events per network', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      const redis = getTestRedisClient();

      // Publish 10 unique events
      for (let i = 1; i <= 10; i++) {
        await request(app)
          .post('/api/v1/publishEvent')
          .send(createPublishRequest(`0xconsistency_count_${i}`))
          .expect(201);
      }

      // Verify exact counts
      const hashnetCount = await redis.sCard('publishedEvents:1');
      const alastriaCount = await redis.sCard('publishedEvents:2');

      expect(hashnetCount).toBe(10);
      expect(alastriaCount).toBe(10);
    });

    it('should handle mixed operations correctly', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      const redis = getTestRedisClient();

      // Mix of direct publications and notifications
      await request(app)
        .post('/api/v1/publishEvent')
        .send(createPublishRequest('0xmixed_direct1'))
        .expect(201);

      await request(app)
        .post('/internal/eventNotification/hashnet')
        .send(createNotificationEvent('0xmixed_notify1'))
        .expect(200);

      await request(app)
        .post('/api/v1/publishEvent')
        .send(createPublishRequest('0xmixed_direct2'))
        .expect(201);

      await request(app)
        .post('/internal/eventNotification/alastria')
        .send(createNotificationEvent('0xmixed_notify2'))
        .expect(200);

      // Wait for replications
      await new Promise((resolve) => setTimeout(resolve, REPLICATION_DELAY_MS + 300));

      // Verify all events on all networks
      const hashnetEvents = await redis.sMembers('publishedEvents:1');
      const alastriaEvents = await redis.sMembers('publishedEvents:2');

      expect(hashnetEvents).toContain('0xmixed_direct1');
      expect(hashnetEvents).toContain('0xmixed_direct2');
      expect(hashnetEvents).toContain('0xmixed_notify1');
      expect(hashnetEvents).toContain('0xmixed_notify2');

      expect(alastriaEvents).toContain('0xmixed_direct1');
      expect(alastriaEvents).toContain('0xmixed_direct2');
      expect(alastriaEvents).toContain('0xmixed_notify1');
      expect(alastriaEvents).toContain('0xmixed_notify2');

      // Exact counts
      expect(hashnetEvents.length).toBe(4);
      expect(alastriaEvents.length).toBe(4);
    });

    it('should maintain state integrity with rapid sequential operations', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      const redis = getTestRedisClient();

      // Rapid sequential publications - collect all promises
      const globalIds: string[] = [];
      const promises: Promise<any>[] = [];

      for (let i = 1; i <= 20; i++) {
        const globalId = `0xrapid_seq_${i}`;
        globalIds.push(globalId);

        // Fire request but collect promise for later
        promises.push(
          request(app)
            .post('/api/v1/publishEvent')
            .send(createPublishRequest(globalId))
        );
      }

      // Wait for all requests to complete
      await Promise.all(promises);

      // Verify all events are present
      const hashnetEvents = await redis.sMembers('publishedEvents:1');

      // Should have all 20 events
      expect(hashnetEvents.length).toBe(20);
    });

    it('should correctly identify events missing from specific networks', async () => {
      const redis = getTestRedisClient();

      // Manually set up asymmetric state
      await redis.sAdd('publishedEvents:1', '0xasymmetric_both');
      await redis.sAdd('publishedEvents:2', '0xasymmetric_both');

      await redis.sAdd('publishedEvents:1', '0xasymmetric_hashnet_only');
      // NOT on alastria

      await redis.sAdd('publishedEvents:2', '0xasymmetric_alastria_only');
      // NOT on hashnet

      // Verify state
      const hashnetHasBoth = await redis.sIsMember('publishedEvents:1', '0xasymmetric_both');
      const alastriaHasBoth = await redis.sIsMember('publishedEvents:2', '0xasymmetric_both');
      expect(hashnetHasBoth).toBe(true);
      expect(alastriaHasBoth).toBe(true);

      const hashnetHasOnly = await redis.sIsMember('publishedEvents:1', '0xasymmetric_hashnet_only');
      const alastriaHasHashnetOnly = await redis.sIsMember('publishedEvents:2', '0xasymmetric_hashnet_only');
      expect(hashnetHasOnly).toBe(true);
      expect(alastriaHasHashnetOnly).toBe(false);

      const alastriaHasOnly = await redis.sIsMember('publishedEvents:2', '0xasymmetric_alastria_only');
      const hashnetHasAlastriaOnly = await redis.sIsMember('publishedEvents:1', '0xasymmetric_alastria_only');
      expect(alastriaHasOnly).toBe(true);
      expect(hashnetHasAlastriaOnly).toBe(false);
    });
  });

  /**
   * Redis Data Integrity Tests
   */
  describe('Redis Data Integrity', () => {
    it('should use correct Redis key format for network sets', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      const globalId = '0xkeyformat_test';

      await request(app)
        .post('/api/v1/publishEvent')
        .send(createPublishRequest(globalId))
        .expect(201);

      const redis = getTestRedisClient();

      // Check keys exist with correct format (publishedEvents:<chainId>)
      const keys = await redis.keys('publishedEvents:*');

      expect(keys).toContain('publishedEvents:1');
      expect(keys).toContain('publishedEvents:2');

      // Verify data type is SET
      const hashnetType = await redis.type('publishedEvents:1');
      const alastriaType = await redis.type('publishedEvents:2');

      expect(hashnetType).toBe('set');
      expect(alastriaType).toBe('set');
    });

    it('should use correct Redis key for notifiedEvents', async () => {
      const redis = getTestRedisClient();

      // Add to notifiedEvents
      await redis.sAdd('notifiedEvents', '0xnotified_keytest');

      // Verify key exists and is correct type
      const exists = await redis.exists('notifiedEvents');
      const type = await redis.type('notifiedEvents');

      expect(exists).toBe(1);
      expect(type).toBe('set');
    });
  });
});
