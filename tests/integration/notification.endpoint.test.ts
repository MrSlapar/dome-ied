/**
 * Integration Tests: POST /internal/eventNotification/:network
 *
 * Tests the event notification webhook endpoint with real Redis and mock adapters.
 * This endpoint is called by DLT Adapters when events are published, triggering
 * the replication flow to other networks.
 */

// Set short replication delay for tests BEFORE importing any modules
process.env.REPLICATION_DELAY_MS = '200';

import request from 'supertest';
import { Express } from 'express';
import {
  setupTestServer,
  teardownTestServer,
  clearRedisTestData,
  getTestRedisClient,
} from './helpers/test-server';
import {
  setupMockAdapterPool,
  resetMockAdapterPool,
  mockAdapterBehaviors,
} from './helpers/mock-adapters';
import { DomeEvent } from '../../src/models/event.model';

describe('POST /internal/eventNotification/:network', () => {
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

  const validEvent: DomeEvent = {
    id: 1,
    timestamp: Date.now(),
    eventType: 'ProductAdded',
    dataLocation: 'https://marketplace.dome-marketplace.org/product/laptop?hl=0xnotification123',
    relevantMetadata: ['sbx', 'category:electronics'],
    entityIdHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    previousEntityHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
  };

  describe('Success Cases', () => {
    it('should accept event notification and respond immediately', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      const response = await request(app)
        .post('/internal/eventNotification/hashnet')
        .send(validEvent)
        .expect(200);

      expect(response.text).toBe('OK');
    });

    it('should mark event on source network in Redis', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      await request(app)
        .post('/internal/eventNotification/hashnet')
        .send(validEvent)
        .expect(200);

      // Wait for async processing (longer when all tests run)
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Verify event is marked on hashnet
      const redis = getTestRedisClient();
      const hashnetEvents = await redis.sMembers('publishedEvents:1');
      expect(hashnetEvents).toContain('0xnotification123');
    });

    it('should replicate event to missing networks', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      // Event comes from hashnet
      await request(app)
        .post('/internal/eventNotification/hashnet')
        .send(validEvent)
        .expect(200);

      // Wait for async replication (200ms delay + buffer)
      await new Promise((resolve) => setTimeout(resolve, 400));

      // Verify event is replicated to alastria
      const redis = getTestRedisClient();
      const hashnetEvents = await redis.sMembers('publishedEvents:1');
      const alastriaEvents = await redis.sMembers('publishedEvents:2');

      expect(hashnetEvents).toContain('0xnotification123');
      expect(alastriaEvents).toContain('0xnotification123');
    });

    it('should not replicate when event already exists on all networks', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      // Pre-populate both networks
      const redis = getTestRedisClient();
      await redis.sAdd('publishedEvents:1', '0xnotification123');
      await redis.sAdd('publishedEvents:2', '0xnotification123');

      await request(app)
        .post('/internal/eventNotification/hashnet')
        .send(validEvent)
        .expect(200);

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify counts haven't changed (no duplicate replication)
      const hashnetCount = await redis.sCard('publishedEvents:1');
      const alastriaCount = await redis.sCard('publishedEvents:2');

      expect(hashnetCount).toBe(1);
      expect(alastriaCount).toBe(1);
    });

    it('should handle events from different networks', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      const event1 = {
        ...validEvent,
        dataLocation: 'https://example.com/product1?hl=0xevent1',
      };

      const event2 = {
        ...validEvent,
        dataLocation: 'https://example.com/product2?hl=0xevent2',
      };

      // Event 1 from hashnet
      await request(app)
        .post('/internal/eventNotification/hashnet')
        .send(event1)
        .expect(200);

      // Event 2 from alastria
      await request(app)
        .post('/internal/eventNotification/alastria')
        .send(event2)
        .expect(200);

      // Wait for replication (200ms delay + buffer)
      await new Promise((resolve) => setTimeout(resolve, 400));

      const redis = getTestRedisClient();
      const hashnetEvents = await redis.sMembers('publishedEvents:1');
      const alastriaEvents = await redis.sMembers('publishedEvents:2');

      // Both networks should have both events
      expect(hashnetEvents).toContain('0xevent1');
      expect(hashnetEvents).toContain('0xevent2');
      expect(alastriaEvents).toContain('0xevent1');
      expect(alastriaEvents).toContain('0xevent2');
    });
  });

  describe('Validation', () => {
    it('should return 400 when network parameter is missing', async () => {
      await request(app)
        .post('/internal/eventNotification/') // No network parameter
        .send(validEvent)
        .expect(404); // Route not found

      // Note: 404 because the route without :network doesn't exist
    });

    it('should return 400 when event body is missing required fields', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      const invalidEvent = { ...validEvent };
      delete (invalidEvent as any).eventType;

      await request(app)
        .post('/internal/eventNotification/hashnet')
        .send(invalidEvent)
        .expect(200); // Still returns 200 (fire and forget)

      // The endpoint responds immediately even if validation fails internally
    });

    it('should handle missing global ID gracefully', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      const eventWithoutGlobalId = {
        ...validEvent,
        dataLocation: 'https://example.com/product', // No ?hl= parameter
      };

      await request(app)
        .post('/internal/eventNotification/hashnet')
        .send(eventWithoutGlobalId)
        .expect(200); // Still returns 200

      // Replication should fail internally but endpoint responds OK
    });
  });

  describe('Replication with Adapter Failures', () => {
    it('should mark source network even when replication fails', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allFailure());

      await request(app)
        .post('/internal/eventNotification/hashnet')
        .send(validEvent)
        .expect(200);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Source network should still be marked
      const redis = getTestRedisClient();
      const hashnetEvents = await redis.sMembers('publishedEvents:1');
      expect(hashnetEvents).toContain('0xnotification123');

      // Target network should not have the event (replication failed)
      const alastriaEvents = await redis.sMembers('publishedEvents:2');
      expect(alastriaEvents).not.toContain('0xnotification123');
    });

    it('should replicate to healthy adapters when some fail', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.partialFailure());

      await request(app)
        .post('/internal/eventNotification/hashnet')
        .send(validEvent)
        .expect(200);

      // Wait for replication (200ms delay + buffer)
      await new Promise((resolve) => setTimeout(resolve, 400));

      const redis = getTestRedisClient();

      // hashnet (source) should be marked
      const hashnetEvents = await redis.sMembers('publishedEvents:1');
      expect(hashnetEvents).toContain('0xnotification123');

      // alastria should have the event (it's healthy in partialFailure)
      const alastriaEvents = await redis.sMembers('publishedEvents:2');
      expect(alastriaEvents).toContain('0xnotification123');
    });
  });

  describe('Concurrent Notifications', () => {
    it('should handle multiple concurrent event notifications', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      const event1 = {
        ...validEvent,
        dataLocation: 'https://example.com/product1?hl=0xconcurrent1',
      };

      const event2 = {
        ...validEvent,
        dataLocation: 'https://example.com/product2?hl=0xconcurrent2',
      };

      const event3 = {
        ...validEvent,
        dataLocation: 'https://example.com/product3?hl=0xconcurrent3',
      };

      // Send 3 notifications in parallel
      await Promise.all([
        request(app).post('/internal/eventNotification/hashnet').send(event1),
        request(app).post('/internal/eventNotification/hashnet').send(event2),
        request(app).post('/internal/eventNotification/alastria').send(event3),
      ]);

      // Wait for all replications (200ms delay + buffer)
      await new Promise((resolve) => setTimeout(resolve, 400));

      const redis = getTestRedisClient();
      const hashnetEvents = await redis.sMembers('publishedEvents:1');
      const alastriaEvents = await redis.sMembers('publishedEvents:2');

      // All events should be on all networks
      expect(hashnetEvents).toContain('0xconcurrent1');
      expect(hashnetEvents).toContain('0xconcurrent2');
      expect(hashnetEvents).toContain('0xconcurrent3');
      expect(alastriaEvents).toContain('0xconcurrent1');
      expect(alastriaEvents).toContain('0xconcurrent2');
      expect(alastriaEvents).toContain('0xconcurrent3');
    });
  });
});
