/**
 * Adapter HTTP Client
 *
 * HTTP client for communicating with DLT Adapters.
 * Includes retry logic, timeouts, and health checks.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { AdapterConfig } from '../config/adapters.config';
import { envConfig } from '../config/env.config';
import { logAdapterCall, logError, logWarn } from '../utils/logger';
import {
  AdapterPublishRequest,
  DomeEvent,
  PublishEventResult,
} from '../models/event.model';
import { AdapterSubscriptionRequest } from '../models/subscription.model';

/**
 * Health check response
 */
export interface HealthCheckResponse {
  status: string;
  checks?: Array<{ name: string; status: string }>;
}

/**
 * Create Axios instance for an adapter
 */
function createAxiosInstance(adapter: AdapterConfig): AxiosInstance {
  return axios.create({
    baseURL: adapter.url,
    timeout: envConfig.timeout.adapterTimeoutMs,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Retry wrapper for adapter calls
 */
async function retryCall<T>(
  fn: () => Promise<T>,
  adapterName: string,
  operation: string,
  maxAttempts: number = envConfig.retry.maxAttempts
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxAttempts) {
        const delay = envConfig.retry.delayMs * attempt; // Exponential backoff
        logWarn(`Adapter ${adapterName} ${operation} failed, retrying (${attempt}/${maxAttempts})`, {
          adapter: adapterName,
          operation,
          attempt,
          delay,
          error: lastError.message,
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  logError(`Adapter ${adapterName} ${operation} failed after ${maxAttempts} attempts`, lastError, {
    adapter: adapterName,
    operation,
  });

  throw lastError;
}

/**
 * Adapter Client
 */
export class AdapterClient {
  private adapter: AdapterConfig;
  private axiosInstance: AxiosInstance;

  constructor(adapter: AdapterConfig) {
    this.adapter = adapter;
    this.axiosInstance = createAxiosInstance(adapter);
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      logAdapterCall(this.adapter.name, this.adapter.healthEndpoint, 'GET');

      const response = await this.axiosInstance.get<HealthCheckResponse>(
        this.adapter.healthEndpoint
      );

      const isHealthy = response.status === 200 && response.data.status === 'UP';
      return isHealthy;
    } catch (error) {
      logError(`Health check failed for ${this.adapter.name}`, error, {
        adapter: this.adapter.name,
      });
      return false;
    }
  }

  /**
   * Publish event
   */
  async publishEvent(request: AdapterPublishRequest): Promise<PublishEventResult> {
    const operation = 'publishEvent';

    try {
      logAdapterCall(this.adapter.name, this.adapter.publishEndpoint, 'POST', {
        eventType: request.eventType,
      });

      const result = await retryCall(
        async () => {
          const response = await this.axiosInstance.post<number>(
            this.adapter.publishEndpoint,
            request
          );
          return response.data;
        },
        this.adapter.name,
        operation
      );

      return {
        adapter: this.adapter.name,
        success: true,
        timestamp: result,
      };
    } catch (error) {
      const errorMessage = error instanceof AxiosError
        ? error.response?.data || error.message
        : (error as Error).message;

      return {
        adapter: this.adapter.name,
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Subscribe to events
   *
   * For Alastria v1.5.0+:
   * - Supports metadata filtering (e.g., {"env": "prd"})
   * - Supports wildcard eventTypes: ["*"] (v1.5.2+)
   */
  async subscribe(request: AdapterSubscriptionRequest): Promise<boolean> {
    const operation = 'subscribe';

    try {
      logAdapterCall(this.adapter.name, this.adapter.subscribeEndpoint, 'POST', {
        eventTypes: request.eventTypes,
        notificationEndpoint: request.notificationEndpoint,
        metadata: request.metadata,  // v1.5.0+ metadata filtering
      });

      await retryCall(
        async () => {
          await this.axiosInstance.post(this.adapter.subscribeEndpoint, request);
        },
        this.adapter.name,
        operation
      );

      return true;
    } catch (error) {
      logError(`Subscribe failed for ${this.adapter.name}`, error, {
        adapter: this.adapter.name,
        eventTypes: request.eventTypes,
        metadata: request.metadata,
      });
      return false;
    }
  }

  /**
   * Get active subscriptions (Alastria v1.5.1+)
   *
   * Returns a list of currently active event subscriptions on this adapter.
   * This endpoint is available in Alastria adapter v1.5.1+.
   */
  async getActiveSubscriptions(): Promise<any[]> {
    const operation = 'getActiveSubscriptions';

    try {
      logAdapterCall(this.adapter.name, this.adapter.subscribeEndpoint, 'GET');

      const subscriptions = await retryCall(
        async () => {
          const response = await this.axiosInstance.get(this.adapter.subscribeEndpoint);
          return response.data;
        },
        this.adapter.name,
        operation
      );

      return subscriptions;
    } catch (error) {
      logError(`Get active subscriptions failed for ${this.adapter.name}`, error, {
        adapter: this.adapter.name,
      });
      return [];
    }
  }

  /**
   * Get events by date range
   */
  async getEvents(startDate: number, endDate: number): Promise<DomeEvent[]> {
    const operation = 'getEvents';

    try {
      logAdapterCall(this.adapter.name, this.adapter.eventsEndpoint, 'GET', {
        startDate,
        endDate,
      });

      const events = await retryCall(
        async () => {
          const response = await this.axiosInstance.get<DomeEvent[]>(
            this.adapter.eventsEndpoint,
            {
              params: { startDate, endDate },
            }
          );
          return response.data;
        },
        this.adapter.name,
        operation
      );

      return events;
    } catch (error) {
      logError(`Get events failed for ${this.adapter.name}`, error, {
        adapter: this.adapter.name,
        startDate,
        endDate,
      });
      return [];
    }
  }

  /**
   * Get adapter name
   */
  getName(): string {
    return this.adapter.name;
  }

  /**
   * Get adapter URL
   */
  getUrl(): string {
    return this.adapter.url;
  }
}

/**
 * Adapter client pool
 */
class AdapterClientPool {
  private clients: Map<string, AdapterClient> = new Map();

  /**
   * Register an adapter client
   */
  register(adapter: AdapterConfig): void {
    const client = new AdapterClient(adapter);
    this.clients.set(adapter.name, client);
  }

  /**
   * Get adapter client by name
   */
  get(name: string): AdapterClient | undefined {
    return this.clients.get(name);
  }

  /**
   * Get all adapter clients
   */
  getAll(): AdapterClient[] {
    return Array.from(this.clients.values());
  }

  /**
   * Check health of all adapters
   */
  async healthCheckAll(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    for (const client of this.clients.values()) {
      results[client.getName()] = await client.healthCheck();
    }

    return results;
  }
}

/**
 * Global adapter client pool
 */
export const adapterPool = new AdapterClientPool();
