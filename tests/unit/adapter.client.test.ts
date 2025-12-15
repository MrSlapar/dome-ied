/**
 * Unit Tests: Adapter Client
 *
 * Tests the HTTP client for communicating with DLT Adapters.
 * Includes retry logic, timeouts, and health checks.
 */

import { AdapterClient, adapterPool } from '../../src/services/adapter.client';
import { AdapterConfig } from '../../src/config/adapters.config';
import axios, { AxiosError } from 'axios';

// Mock axios
jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

describe('AdapterClient', () => {
  const testConfig: AdapterConfig = {
    name: 'test-adapter',
    url: 'http://localhost:8081',
    chainId: 'test-chain-1',
    healthEndpoint: '/health',
    publishEndpoint: '/api/v1/publishEvent',
    subscribeEndpoint: '/api/v1/subscribe',
    eventsEndpoint: '/api/v1/events',
  };

  let client: AdapterClient;
  let mockAxiosInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock axios.create to return a mock instance
    mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
    };

    mockAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);

    client = new AdapterClient(testConfig);
  });

  describe('getName', () => {
    it('should return adapter name', () => {
      expect(client.getName()).toBe('test-adapter');
    });
  });

  describe('healthCheck', () => {
    it('should return true when adapter is healthy', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: { status: 'UP' },
      });

      const result = await client.healthCheck();

      expect(result).toBe(true);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/health');
    });

    it('should return false when adapter returns non-200 status', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 503,
        data: { status: 'DOWN' },
      });

      const result = await client.healthCheck();

      expect(result).toBe(false);
    });

    it('should return false when adapter status is not UP', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: { status: 'DOWN' },
      });

      const result = await client.healthCheck();

      expect(result).toBe(false);
    });

    it('should return false when request fails', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Connection refused'));

      const result = await client.healthCheck();

      expect(result).toBe(false);
    });
  });

  describe('publishEvent', () => {
    const publishRequest = {
      eventType: 'ProductAdded',
      dataLocation: 'https://example.com/product?hl=0xtest123',
      relevantMetadata: ['sbx'],
      entityId: '0xentity123',
      previousEntityHash: '0x0000',
    };

    it('should publish event successfully', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: 1234567890,
      });

      const result = await client.publishEvent(publishRequest);

      expect(result.adapter).toBe('test-adapter');
      expect(result.success).toBe(true);
      expect(result.timestamp).toBe(1234567890);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/publishEvent',
        publishRequest
      );
    });

    it('should retry on failure and succeed', async () => {
      mockAxiosInstance.post
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ data: 1234567890 });

      const result = await client.publishEvent(publishRequest);

      expect(result.success).toBe(true);
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(3);
    });

    it('should return failure after max retries', async () => {
      mockAxiosInstance.post.mockRejectedValue(new Error('Persistent failure'));

      const result = await client.publishEvent(publishRequest);

      expect(result.adapter).toBe('test-adapter');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(3); // Default max attempts
    });

    it('should handle AxiosError with response data', async () => {
      // Create a proper AxiosError instance
      const axiosError = new AxiosError('Request failed');
      axiosError.response = {
        data: 'Validation failed',
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config: {} as any,
      };

      mockAxiosInstance.post.mockRejectedValue(axiosError);

      const result = await client.publishEvent(publishRequest);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Validation failed');
    });

    it('should handle generic Error', async () => {
      mockAxiosInstance.post.mockRejectedValue(new Error('Generic error'));

      const result = await client.publishEvent(publishRequest);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Generic error');
    });
  });

  describe('subscribe', () => {
    const subscribeRequest = {
      eventTypes: ['ProductAdded'],
      notificationEndpoint: 'http://ied-server/webhook',
    };

    it('should subscribe successfully', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        status: 200,
        data: {},
      });

      const result = await client.subscribe(subscribeRequest);

      expect(result).toBe(true);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/subscribe',
        subscribeRequest
      );
    });

    it('should return false on failure', async () => {
      mockAxiosInstance.post.mockRejectedValue(new Error('Subscription failed'));

      const result = await client.subscribe(subscribeRequest);

      expect(result).toBe(false);
    });

    it('should retry on failure and succeed', async () => {
      mockAxiosInstance.post
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ status: 200, data: {} });

      const result = await client.subscribe(subscribeRequest);

      expect(result).toBe(true);
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);
    });
  });

  describe('getActiveSubscriptions', () => {
    it('should return active subscriptions', async () => {
      const mockSubscriptions = [
        {
          eventTypes: ['ProductAdded'],
          notificationEndpoint: 'http://ied/webhook',
        },
      ];

      mockAxiosInstance.get.mockResolvedValue({
        data: mockSubscriptions,
      });

      const result = await client.getActiveSubscriptions();

      expect(result).toEqual(mockSubscriptions);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v1/subscribe');
    });

    it('should return empty array on failure', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Failed to fetch'));

      const result = await client.getActiveSubscriptions();

      expect(result).toEqual([]);
    });
  });
});

describe('adapterPool', () => {
  beforeEach(() => {
    // Note: We test the global adapterPool instance
    // Tests will work with existing state as we can't clear the singleton
  });

  describe('register and getAll', () => {
    it('should register adapter', () => {
      const config: AdapterConfig = {
        name: 'test-adapter-1',
        url: 'http://localhost:9001',
        chainId: 'test-chain-1',
        healthEndpoint: '/health',
        publishEndpoint: '/api/v1/publishEvent',
        subscribeEndpoint: '/api/v1/subscribe',
        eventsEndpoint: '/api/v1/events',
      };

      const beforeCount = adapterPool.getAll().length;
      adapterPool.register(config);

      const adapters = adapterPool.getAll();
      expect(adapters.length).toBeGreaterThanOrEqual(beforeCount);

      const registered = adapterPool.get('test-adapter-1');
      expect(registered).toBeDefined();
      expect(registered!.getName()).toBe('test-adapter-1');
    });

    it('should register multiple adapters', () => {
      const config1: AdapterConfig = {
        name: 'test-adapter-2',
        url: 'http://localhost:9002',
        chainId: 'test-chain-2',
        healthEndpoint: '/health',
        publishEndpoint: '/api/v1/publishEvent',
        subscribeEndpoint: '/api/v1/subscribe',
        eventsEndpoint: '/api/v1/events',
      };

      const config2: AdapterConfig = {
        name: 'test-adapter-3',
        url: 'http://localhost:9003',
        chainId: 'test-chain-3',
        healthEndpoint: '/health',
        publishEndpoint: '/api/v2/publishEvent',
        subscribeEndpoint: '/api/v2/subscribe',
        eventsEndpoint: '/api/v2/events',
      };

      adapterPool.register(config1);
      adapterPool.register(config2);

      const adapter1 = adapterPool.get('test-adapter-2');
      const adapter2 = adapterPool.get('test-adapter-3');

      expect(adapter1).toBeDefined();
      expect(adapter2).toBeDefined();
    });

    it('should overwrite adapter when registering duplicate name', () => {
      const config: AdapterConfig = {
        name: 'test-adapter-4',
        url: 'http://localhost:9004',
        chainId: 'test-chain-4',
        healthEndpoint: '/health',
        publishEndpoint: '/api/v1/publishEvent',
        subscribeEndpoint: '/api/v1/subscribe',
        eventsEndpoint: '/api/v1/events',
      };

      adapterPool.register(config);

      const beforeCount = adapterPool.getAll().length;

      // Register again with same name
      adapterPool.register(config);

      const afterCount = adapterPool.getAll().length;
      expect(afterCount).toBe(beforeCount); // Same count, not incremented
    });
  });

  describe('get', () => {
    it('should get adapter by name', () => {
      const config: AdapterConfig = {
        name: 'test-adapter-5',
        url: 'http://localhost:9005',
        chainId: 'test-chain-5',
        healthEndpoint: '/health',
        publishEndpoint: '/api/v1/publishEvent',
        subscribeEndpoint: '/api/v1/subscribe',
        eventsEndpoint: '/api/v1/events',
      };

      adapterPool.register(config);

      const adapter = adapterPool.get('test-adapter-5');

      expect(adapter).toBeDefined();
      expect(adapter!.getName()).toBe('test-adapter-5');
    });

    it('should return undefined for non-existent adapter', () => {
      const adapter = adapterPool.get('non-existent-adapter-xyz');

      expect(adapter).toBeUndefined();
    });
  });

  describe('healthCheckAll', () => {
    it('should check health of all registered adapters', async () => {
      // Mock axios for health checks
      const mockAxiosInstance = {
        get: jest.fn().mockResolvedValue({
          status: 200,
          data: { status: 'UP' },
        }),
      };

      mockAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);

      const config: AdapterConfig = {
        name: 'test-adapter-6',
        url: 'http://localhost:9006',
        chainId: 'test-chain-6',
        healthEndpoint: '/health',
        publishEndpoint: '/api/v1/publishEvent',
        subscribeEndpoint: '/api/v1/subscribe',
        eventsEndpoint: '/api/v1/events',
      };

      adapterPool.register(config);

      const results = await adapterPool.healthCheckAll();

      expect(results).toBeDefined();
      expect(typeof results).toBe('object');
      expect(results['test-adapter-6']).toBe(true);
    });
  });
});
