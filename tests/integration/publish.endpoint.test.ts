/**
 * Integration Tests: POST /api/v1/publishEvent
 *
 * Tests the publication endpoint with real Redis and mock adapters.
 */

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
import { PublishEventRequest } from '../../src/models/event.model';

describe('POST /api/v1/publishEvent', () => {
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

  const validEvent: PublishEventRequest = {
    eventType: 'ProductAdded',
    dataLocation: 'https://marketplace.dome-marketplace.org/product/laptop?hl=0xintegration123',
    relevantMetadata: ['sbx', 'category:electronics'],
    entityId: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    previousEntityHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
  };

  describe('Success Cases', () => {
    it('should publish event to all adapters successfully', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      const response = await request(app)
        .post('/api/v1/publishEvent')
        .send(validEvent)
        .expect(201);

      expect(response.body.timestamp).toBeDefined();
      expect(response.body.adapters).toHaveLength(2);
      expect(response.body.adapters[0].name).toBe('hashnet');
      expect(response.body.adapters[0].success).toBe(true);
      expect(response.body.adapters[1].name).toBe('alastria');
      expect(response.body.adapters[1].success).toBe(true);
    });

    it('should update Redis cache after successful publish', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      await request(app)
        .post('/api/v1/publishEvent')
        .send(validEvent)
        .expect(201);

      // Verify Redis cache
      const redis = getTestRedisClient();
      const hashnetEvents = await redis.sMembers('publishedEvents:1');
      const alastriaEvents = await redis.sMembers('publishedEvents:2');

      expect(hashnetEvents).toContain('0xintegration123');
      expect(alastriaEvents).toContain('0xintegration123');
    });

    it('should return 201 with partial success when one adapter fails', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.partialFailure());

      const response = await request(app)
        .post('/api/v1/publishEvent')
        .send(validEvent)
        .expect(201);

      expect(response.body.timestamp).toBeDefined();
      expect(response.body.adapters).toHaveLength(2);

      // HashNET failed
      expect(response.body.adapters[0].name).toBe('hashnet');
      expect(response.body.adapters[0].success).toBe(false);
      expect(response.body.adapters[0].error).toBe('Network timeout');

      // Alastria succeeded
      expect(response.body.adapters[1].name).toBe('alastria');
      expect(response.body.adapters[1].success).toBe(true);
    });

    it('should only cache successful publishes', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.partialFailure());

      await request(app)
        .post('/api/v1/publishEvent')
        .send(validEvent)
        .expect(201);

      // Verify Redis cache - only Alastria should have the event
      const redis = getTestRedisClient();
      const hashnetEvents = await redis.sMembers('publishedEvents:1');
      const alastriaEvents = await redis.sMembers('publishedEvents:2');

      expect(hashnetEvents).not.toContain('0xintegration123');
      expect(alastriaEvents).toContain('0xintegration123');
    });
  });

  describe('Failure Cases', () => {
    it('should return 500 when all adapters fail', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allFailure());

      const response = await request(app)
        .post('/api/v1/publishEvent')
        .send(validEvent)
        .expect(500);

      expect(response.body.error).toBe('Publication failed');
      expect(response.body.message).toBe('Failed to publish event on all adapters');
      expect(response.body.details).toBeDefined();
    });

    it('should not cache when all adapters fail', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allFailure());

      await request(app)
        .post('/api/v1/publishEvent')
        .send(validEvent)
        .expect(500);

      // Verify Redis cache is empty
      const redis = getTestRedisClient();
      const hashnetEvents = await redis.sMembers('publishedEvents:1');
      const alastriaEvents = await redis.sMembers('publishedEvents:2');

      expect(hashnetEvents).toHaveLength(0);
      expect(alastriaEvents).toHaveLength(0);
    });
  });

  describe('Validation', () => {
    it('should return 400 when eventType is missing', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      const invalidEvent = { ...validEvent };
      delete (invalidEvent as any).eventType;

      const response = await request(app)
        .post('/api/v1/publishEvent')
        .send(invalidEvent)
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 when dataLocation is missing', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      const invalidEvent = { ...validEvent };
      delete (invalidEvent as any).dataLocation;

      const response = await request(app)
        .post('/api/v1/publishEvent')
        .send(invalidEvent)
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 500 when global ID (hl parameter) is missing in dataLocation', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      const invalidEvent = {
        ...validEvent,
        dataLocation: 'https://marketplace.dome-marketplace.org/product/laptop', // No ?hl=
      };

      const response = await request(app)
        .post('/api/v1/publishEvent')
        .send(invalidEvent)
        .expect(500);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 when entityId is missing', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      const invalidEvent = { ...validEvent };
      delete (invalidEvent as any).entityId;

      const response = await request(app)
        .post('/api/v1/publishEvent')
        .send(invalidEvent)
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 when previousEntityHash is missing', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      const invalidEvent = { ...validEvent };
      delete (invalidEvent as any).previousEntityHash;

      const response = await request(app)
        .post('/api/v1/publishEvent')
        .send(invalidEvent)
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle multiple rapid requests without race conditions', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      const event1 = {
        ...validEvent,
        dataLocation: 'https://example.com/product1?hl=0xevent1',
      };
      const event2 = {
        ...validEvent,
        dataLocation: 'https://example.com/product2?hl=0xevent2',
      };
      const event3 = {
        ...validEvent,
        dataLocation: 'https://example.com/product3?hl=0xevent3',
      };

      // Send 3 requests in parallel
      const results = await Promise.all([
        request(app).post('/api/v1/publishEvent').send(event1),
        request(app).post('/api/v1/publishEvent').send(event2),
        request(app).post('/api/v1/publishEvent').send(event3),
      ]);

      // All should succeed
      results.forEach((response) => {
        expect(response.status).toBe(201);
        expect(response.body.timestamp).toBeDefined();
        expect(response.body.adapters).toHaveLength(2);
      });

      // Verify all events are in cache
      const redis = getTestRedisClient();
      const hashnetEvents = await redis.sMembers('publishedEvents:1');

      expect(hashnetEvents).toContain('0xevent1');
      expect(hashnetEvents).toContain('0xevent2');
      expect(hashnetEvents).toContain('0xevent3');
    });
  });
});
