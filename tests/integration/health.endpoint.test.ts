/**
 * Integration Tests: GET /health and GET /stats
 *
 * Tests the health check and statistics endpoints with real Redis and mock adapters.
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

describe('Health and Stats Endpoints', () => {
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

  describe('GET /health', () => {
    it('should return UP when all services are healthy', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('UP');
      expect(response.body.redis).toBe('UP');
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.uptime).toBeDefined();
      expect(response.body.adapters).toBeDefined();
      expect(response.body.adapters).toHaveLength(2);

      const hashnetAdapter = response.body.adapters.find((a: any) => a.name === 'hashnet');
      const alastriaAdapter = response.body.adapters.find((a: any) => a.name === 'alastria');

      expect(hashnetAdapter.status).toBe('UP');
      expect(alastriaAdapter.status).toBe('UP');
    });

    it('should return DEGRADED when some adapters are unhealthy', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.partialFailure());

      const response = await request(app)
        .get('/health')
        .expect(503); // 503 when degraded

      expect(response.body.status).toBe('DEGRADED');
      expect(response.body.redis).toBe('UP');
      expect(response.body.adapters).toBeDefined();

      const hashnetAdapter = response.body.adapters.find((a: any) => a.name === 'hashnet');
      const alastriaAdapter = response.body.adapters.find((a: any) => a.name === 'alastria');

      expect(hashnetAdapter.status).toBe('DOWN');
      expect(alastriaAdapter.status).toBe('UP');
    });

    it('should return DEGRADED when all adapters are unhealthy', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allFailure());

      const response = await request(app)
        .get('/health')
        .expect(503); // 503 when degraded

      expect(response.body.status).toBe('DEGRADED');
      expect(response.body.redis).toBe('UP');
      expect(response.body.adapters).toBeDefined();

      const hashnetAdapter = response.body.adapters.find((a: any) => a.name === 'hashnet');
      const alastriaAdapter = response.body.adapters.find((a: any) => a.name === 'alastria');

      expect(hashnetAdapter.status).toBe('DOWN');
      expect(alastriaAdapter.status).toBe('DOWN');
    });
  });

  describe('GET /stats', () => {
    it('should return cache statistics', async () => {
      const response = await request(app)
        .get('/stats')
        .expect(200);

      expect(response.body.cache).toBeDefined();
      expect(response.body.cache.networks).toBeDefined();
      expect(response.body.cache.networks.hashnet).toBe(0);
      expect(response.body.cache.networks.alastria).toBe(0);
      expect(response.body.cache.notifiedEvents).toBe(0);
      expect(response.body.subscriptions).toBe(0);
    });

    it('should reflect cached events in statistics', async () => {
      // Get initial state
      const initialStats = await request(app).get('/stats').expect(200);
      const initialHashnet = initialStats.body.cache.networks.hashnet || 0;
      const initialAlastria = initialStats.body.cache.networks.alastria || 0;
      const initialNotified = initialStats.body.cache.notifiedEvents || 0;

      // Add some events to Redis cache
      const redis = getTestRedisClient();
      await redis.sAdd('publishedEvents:1', '0xevent1cached');
      await redis.sAdd('publishedEvents:1', '0xevent2cached');
      await redis.sAdd('publishedEvents:2', '0xevent1cached');
      await redis.sAdd('notifiedEvents', '0xevent1cached');

      const response = await request(app)
        .get('/stats')
        .expect(200);

      // Verify increments (not absolute values)
      expect(response.body.cache.networks.hashnet).toBe(initialHashnet + 2);
      expect(response.body.cache.networks.alastria).toBe(initialAlastria + 1);
      expect(response.body.cache.notifiedEvents).toBe(initialNotified + 1);
    });

    it('should reflect active subscriptions in statistics', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      // Create a subscription
      const subResponse = await request(app)
        .post('/api/v1/subscribe')
        .send({
          eventTypes: ['ProductAdded'],
          notificationEndpoint: 'http://desmos-server/webhook',
        })
        .expect(201);

      expect(subResponse.body.subscriptionId).toBeDefined();

      const response = await request(app)
        .get('/stats');

      // Log response for debugging
      if (response.status !== 200) {
        console.log('Stats error:', response.status, response.body);
      }

      expect(response.status).toBe(200);
      expect(response.body.subscriptions).toBe(1);
    });

    it('should show updated statistics after multiple operations', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      // Get initial subscription count (may have some from previous tests)
      const initialStats = await request(app).get('/stats').expect(200);
      const initialSubCount = initialStats.body.subscriptions;

      // Create two subscriptions
      await request(app)
        .post('/api/v1/subscribe')
        .send({
          eventTypes: ['ProductAdded'],
          notificationEndpoint: 'http://desmos-server-1/webhook',
        })
        .expect(201);

      await request(app)
        .post('/api/v1/subscribe')
        .send({
          eventTypes: ['ProductUpdated'],
          notificationEndpoint: 'http://desmos-server-2/webhook',
        })
        .expect(201);

      // Add some events to cache
      const redis = getTestRedisClient();
      await redis.sAdd('publishedEvents:1', '0xstatsmulti1');
      await redis.sAdd('publishedEvents:1', '0xstatsmulti2');
      await redis.sAdd('publishedEvents:1', '0xstatsmulti3');
      await redis.sAdd('publishedEvents:2', '0xstatsmulti1');
      await redis.sAdd('publishedEvents:2', '0xstatsmulti2');
      await redis.sAdd('notifiedEvents', '0xstatsmulti1');
      await redis.sAdd('notifiedEvents', '0xstatsmulti2');

      const response = await request(app)
        .get('/stats')
        .expect(200);

      // Verify increments from initial state
      expect(response.body.cache.networks.hashnet).toBeGreaterThanOrEqual(3);
      expect(response.body.cache.networks.alastria).toBeGreaterThanOrEqual(2);
      expect(response.body.cache.notifiedEvents).toBeGreaterThanOrEqual(2);
      expect(response.body.subscriptions).toBe(initialSubCount + 2); // 2 new subscriptions added
    });
  });
});
