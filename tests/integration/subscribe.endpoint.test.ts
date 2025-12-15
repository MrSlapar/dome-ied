/**
 * Integration Tests: POST /api/v1/subscribe
 *
 * Tests the subscription endpoint with real Redis and mock adapters.
 */

import request from 'supertest';
import { Express } from 'express';
import {
  setupTestServer,
  teardownTestServer,
  clearRedisTestData,
} from './helpers/test-server';
import {
  setupMockAdapterPool,
  resetMockAdapterPool,
  mockAdapterBehaviors,
} from './helpers/mock-adapters';
import { SubscriptionRequest } from '../../src/models/subscription.model';

describe('POST /api/v1/subscribe', () => {
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

  const validSubscription: SubscriptionRequest = {
    eventTypes: ['ProductAdded', 'ProductUpdated'],
    notificationEndpoint: 'http://desmos-server/webhook',
  };

  describe('Success Cases', () => {
    it('should create subscription on all adapters successfully', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      const response = await request(app)
        .post('/api/v1/subscribe')
        .send(validSubscription)
        .expect(201);

      expect(response.body.subscriptionId).toBeDefined();
      expect(response.body.subscriptionId).toMatch(/^[0-9a-f-]{36}$/); // UUID format
      expect(response.body.message).toBe('Subscription created successfully');
      expect(response.body.adapters).toHaveLength(2);
      expect(response.body.adapters[0].name).toBe('hashnet');
      expect(response.body.adapters[0].success).toBe(true);
      expect(response.body.adapters[1].name).toBe('alastria');
      expect(response.body.adapters[1].success).toBe(true);
    });

    it('should succeed with partial failures', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.partialFailure());

      const response = await request(app)
        .post('/api/v1/subscribe')
        .send(validSubscription)
        .expect(201);

      expect(response.body.subscriptionId).toBeDefined();
      expect(response.body.adapters).toHaveLength(2);

      // HashNET failed
      expect(response.body.adapters[0].name).toBe('hashnet');
      expect(response.body.adapters[0].success).toBe(false);

      // Alastria succeeded
      expect(response.body.adapters[1].name).toBe('alastria');
      expect(response.body.adapters[1].success).toBe(true);
    });

    it('should support wildcard subscription', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      const wildcardSubscription: SubscriptionRequest = {
        eventTypes: ['*'], // Subscribe to all events
        notificationEndpoint: 'http://desmos-server/webhook',
      };

      const response = await request(app)
        .post('/api/v1/subscribe')
        .send(wildcardSubscription)
        .expect(201);

      expect(response.body.subscriptionId).toBeDefined();
      expect(response.body.adapters).toHaveLength(2);
      expect(response.body.adapters[0].success).toBe(true);
      expect(response.body.adapters[1].success).toBe(true);
    });
  });

  describe('Failure Cases', () => {
    it('should return 500 when all adapters fail', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allFailure());

      const response = await request(app)
        .post('/api/v1/subscribe')
        .send(validSubscription)
        .expect(500);

      expect(response.body.error).toBe('Subscription failed');
      expect(response.body.message).toBe('Failed to subscribe on all adapters');
    });
  });

  describe('Validation', () => {
    it('should return 400 when eventTypes is missing', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      const invalidSubscription = { ...validSubscription };
      delete (invalidSubscription as any).eventTypes;

      const response = await request(app)
        .post('/api/v1/subscribe')
        .send(invalidSubscription)
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 when eventTypes is not an array', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      const invalidSubscription = {
        ...validSubscription,
        eventTypes: 'ProductAdded', // Should be array
      };

      const response = await request(app)
        .post('/api/v1/subscribe')
        .send(invalidSubscription)
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 when eventTypes is empty array', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      const invalidSubscription = {
        ...validSubscription,
        eventTypes: [], // Empty array
      };

      const response = await request(app)
        .post('/api/v1/subscribe')
        .send(invalidSubscription)
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 when notificationEndpoint is missing', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      const invalidSubscription = { ...validSubscription };
      delete (invalidSubscription as any).notificationEndpoint;

      const response = await request(app)
        .post('/api/v1/subscribe')
        .send(invalidSubscription)
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 when notificationEndpoint is not a valid URL', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      const invalidSubscription = {
        ...validSubscription,
        notificationEndpoint: 'not-a-valid-url',
      };

      const response = await request(app)
        .post('/api/v1/subscribe')
        .send(invalidSubscription)
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('Multiple Subscriptions', () => {
    it('should allow multiple subscriptions from the same endpoint', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      const subscription1: SubscriptionRequest = {
        eventTypes: ['ProductAdded'],
        notificationEndpoint: 'http://desmos-server/webhook',
      };

      const subscription2: SubscriptionRequest = {
        eventTypes: ['ProductUpdated'],
        notificationEndpoint: 'http://desmos-server/webhook',
      };

      const response1 = await request(app)
        .post('/api/v1/subscribe')
        .send(subscription1)
        .expect(201);

      const response2 = await request(app)
        .post('/api/v1/subscribe')
        .send(subscription2)
        .expect(201);

      // Should get different subscription IDs
      expect(response1.body.subscriptionId).toBeDefined();
      expect(response2.body.subscriptionId).toBeDefined();
      expect(response1.body.subscriptionId).not.toBe(response2.body.subscriptionId);
    });

    it('should allow subscriptions from different endpoints', async () => {
      setupMockAdapterPool(mockAdapterBehaviors.allSuccess());

      const subscription1: SubscriptionRequest = {
        eventTypes: ['ProductAdded'],
        notificationEndpoint: 'http://desmos-server-1/webhook',
      };

      const subscription2: SubscriptionRequest = {
        eventTypes: ['ProductAdded'],
        notificationEndpoint: 'http://desmos-server-2/webhook',
      };

      const response1 = await request(app)
        .post('/api/v1/subscribe')
        .send(subscription1)
        .expect(201);

      const response2 = await request(app)
        .post('/api/v1/subscribe')
        .send(subscription2)
        .expect(201);

      expect(response1.body.subscriptionId).toBeDefined();
      expect(response2.body.subscriptionId).toBeDefined();
    });
  });
});
