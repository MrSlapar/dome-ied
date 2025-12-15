/**
 * E2E Tests: Cross-Network Consistency
 *
 * Tests from PDF Test Plan Section 6.5:
 * - I15: Receive replicated event from network B; verify IED ignores it as already known to A
 *
 * These tests validate that events are not duplicated when received from multiple networks.
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
import { DomeEvent } from '../../src/models/event.model';

const REPLICATION_DELAY_MS = 200;

describe('E2E: Cross-Network Consistency (Section 6.5)', () => {
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

  const createTestEvent = (globalId: string): DomeEvent => ({
    id: 1,
    timestamp: Date.now(),
    eventType: 'ProductAdded',
    dataLocation: `https://marketplace.dome-marketplace.org/product/test?hl=${globalId}`,
    relevantMetadata: ['sbx', 'category:electronics'],
    entityIdHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    previousEntityHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
  });

  /**
   * Test I15: Receive replicated event from network B; verify IED ignores it as already known to A
   *
   * PDF Requirement: "No new propagation triggered"
   *
   * Scenario:
   * 1. Event arrives from HashNET (network A)
   * 2. IED marks it on HashNET and replicates to Alastria (network B)
   * 3. Same event arrives from Alastria (as if replicated back)
   * 4. IED should recognize it already exists on HashNET and NOT re-replicate
   */
  describe('[I15] Ignore already-known replicated events', () => {
    it('should not trigger new propagation when replicated event arrives from another network', async () => {
      const globalId = '0xcrossnetwork_i15_test';
      const testEvent = createTestEvent(globalId);

      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      const redis = getTestRedisClient();

      // Step 1: Event arrives from HashNET (source network A)
      await request(app)
        .post('/internal/eventNotification/hashnet')
        .send(testEvent)
        .expect(200);

      // Step 2: Wait for initial processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Step 3: Verify event is marked on HashNET
      const hashnetBeforeReplication = await redis.sIsMember('publishedEvents:1', globalId);
      expect(hashnetBeforeReplication).toBe(true);

      // Step 4: Wait for replication to complete (delay + buffer)
      await new Promise((resolve) => setTimeout(resolve, REPLICATION_DELAY_MS + 200));

      // Step 5: Verify event was replicated to Alastria
      const alastriaAfterReplication = await redis.sIsMember('publishedEvents:2', globalId);
      expect(alastriaAfterReplication).toBe(true);

      // Step 6: Record current state
      const hashnetCountBefore = await redis.sCard('publishedEvents:1');
      const alastriaCountBefore = await redis.sCard('publishedEvents:2');

      expect(hashnetCountBefore).toBe(1);
      expect(alastriaCountBefore).toBe(1);

      // Step 7: Same event arrives from Alastria (simulating replicated event arriving back)
      await request(app)
        .post('/internal/eventNotification/alastria')
        .send(testEvent)
        .expect(200);

      // Step 8: Wait for any potential (incorrect) re-replication
      await new Promise((resolve) => setTimeout(resolve, REPLICATION_DELAY_MS + 200));

      // Step 9: Verify NO new entries were created (counts should remain 1 each)
      const hashnetCountAfter = await redis.sCard('publishedEvents:1');
      const alastriaCountAfter = await redis.sCard('publishedEvents:2');

      expect(hashnetCountAfter).toBe(1);
      expect(alastriaCountAfter).toBe(1);

      // Step 10: Verify the event is still marked correctly on both networks
      const hashnetFinal = await redis.sIsMember('publishedEvents:1', globalId);
      const alastriaFinal = await redis.sIsMember('publishedEvents:2', globalId);

      expect(hashnetFinal).toBe(true);
      expect(alastriaFinal).toBe(true);
    });

    it('should correctly identify event exists on source network before attempting replication', async () => {
      const globalId = '0xcrossnetwork_i15_exists';
      const testEvent = createTestEvent(globalId);

      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      const redis = getTestRedisClient();

      // Pre-populate: Event already exists on BOTH networks
      await redis.sAdd('publishedEvents:1', globalId);
      await redis.sAdd('publishedEvents:2', globalId);

      // Event arrives from HashNET
      await request(app)
        .post('/internal/eventNotification/hashnet')
        .send(testEvent)
        .expect(200);

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, REPLICATION_DELAY_MS + 200));

      // Verify no duplicates (counts should still be 1 each)
      const hashnetCount = await redis.sCard('publishedEvents:1');
      const alastriaCount = await redis.sCard('publishedEvents:2');

      expect(hashnetCount).toBe(1);
      expect(alastriaCount).toBe(1);
    });

    it('should handle rapid concurrent events from multiple networks correctly', async () => {
      const globalId1 = '0xcrossnetwork_concurrent1';
      const globalId2 = '0xcrossnetwork_concurrent2';
      const testEvent1 = createTestEvent(globalId1);
      const testEvent2 = createTestEvent(globalId2);

      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      const redis = getTestRedisClient();

      // Send events concurrently from different networks
      await Promise.all([
        request(app).post('/internal/eventNotification/hashnet').send(testEvent1),
        request(app).post('/internal/eventNotification/alastria').send(testEvent2),
      ]);

      // Wait for all replications
      await new Promise((resolve) => setTimeout(resolve, REPLICATION_DELAY_MS + 300));

      // Both events should exist on both networks
      const hashnetEvents = await redis.sMembers('publishedEvents:1');
      const alastriaEvents = await redis.sMembers('publishedEvents:2');

      expect(hashnetEvents).toContain(globalId1);
      expect(hashnetEvents).toContain(globalId2);
      expect(alastriaEvents).toContain(globalId1);
      expect(alastriaEvents).toContain(globalId2);

      // Each event should appear exactly once per network
      expect(hashnetEvents.length).toBe(2);
      expect(alastriaEvents.length).toBe(2);
    });
  });

  /**
   * Additional Cross-Network Consistency Tests
   * Supporting I13 and I14 from PDF
   */
  describe('Supporting Cross-Network Tests (I13, I14)', () => {
    it('[I13] should replicate event from A to B exactly once', async () => {
      const globalId = '0xcrossnetwork_i13_once';
      const testEvent = createTestEvent(globalId);

      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      const redis = getTestRedisClient();

      // Event arrives from HashNET
      await request(app)
        .post('/internal/eventNotification/hashnet')
        .send(testEvent)
        .expect(200);

      // Wait for replication
      await new Promise((resolve) => setTimeout(resolve, REPLICATION_DELAY_MS + 200));

      // Verify exactly one entry per network
      const hashnetCount = await redis.sCard('publishedEvents:1');
      const alastriaCount = await redis.sCard('publishedEvents:2');

      expect(hashnetCount).toBe(1);
      expect(alastriaCount).toBe(1);

      // Verify correct global ID
      const hashnetEvents = await redis.sMembers('publishedEvents:1');
      const alastriaEvents = await redis.sMembers('publishedEvents:2');

      expect(hashnetEvents).toEqual([globalId]);
      expect(alastriaEvents).toEqual([globalId]);
    });

    it('[I14] should prevent double replication when identical event is published twice', async () => {
      const globalId = '0xcrossnetwork_i14_double';
      const testEvent = createTestEvent(globalId);

      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      const redis = getTestRedisClient();

      // First notification
      await request(app)
        .post('/internal/eventNotification/hashnet')
        .send(testEvent)
        .expect(200);

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Second notification (same event)
      await request(app)
        .post('/internal/eventNotification/hashnet')
        .send(testEvent)
        .expect(200);

      // Wait for all potential replications
      await new Promise((resolve) => setTimeout(resolve, REPLICATION_DELAY_MS + 300));

      // Verify no duplicates
      const hashnetCount = await redis.sCard('publishedEvents:1');
      const alastriaCount = await redis.sCard('publishedEvents:2');

      expect(hashnetCount).toBe(1);
      expect(alastriaCount).toBe(1);
    });
  });
});
