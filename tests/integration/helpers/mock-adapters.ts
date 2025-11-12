/**
 * Mock Adapter Helpers
 *
 * Utilities for mocking DLT Adapters in integration tests.
 */

import { AdapterClient } from '../../../src/services/adapter.client';
import { adapterPool } from '../../../src/services/adapter.client';
import { AdapterPublishRequest, PublishEventResult } from '../../../src/models/event.model';
import { AdapterSubscriptionRequest } from '../../../src/models/subscription.model';

export interface MockAdapterBehavior {
  name: string;
  publishSuccess: boolean;
  publishDelay?: number;
  publishError?: string;
  subscribeSuccess: boolean;
  healthCheckSuccess: boolean;
}

/**
 * Create mock adapter client
 */
export function createMockAdapter(behavior: MockAdapterBehavior): Partial<AdapterClient> {
  return {
    getName: jest.fn(() => behavior.name),

    getUrl: jest.fn(() => `http://localhost:808${behavior.name === 'hashnet' ? '1' : '2'}`),

    publishEvent: jest.fn(async (_request: AdapterPublishRequest): Promise<PublishEventResult> => {
      if (behavior.publishDelay) {
        await new Promise((resolve) => setTimeout(resolve, behavior.publishDelay));
      }

      if (behavior.publishSuccess) {
        return {
          adapter: behavior.name,
          success: true,
          timestamp: Date.now(),
        };
      } else {
        return {
          adapter: behavior.name,
          success: false,
          error: behavior.publishError || 'Adapter failure',
        };
      }
    }),

    subscribe: jest.fn(async (_request: AdapterSubscriptionRequest): Promise<boolean> => {
      return behavior.subscribeSuccess;
    }),

    healthCheck: jest.fn(async (): Promise<boolean> => {
      return behavior.healthCheckSuccess;
    }),
  };
}

/**
 * Setup mock adapter pool with specified adapters
 */
export function setupMockAdapterPool(behaviors: MockAdapterBehavior[]): void {
  const mockAdapters = behaviors.map((behavior) => createMockAdapter(behavior));

  jest.spyOn(adapterPool, 'getAll').mockReturnValue(mockAdapters as AdapterClient[]);

  jest.spyOn(adapterPool, 'get').mockImplementation((name: string) => {
    const adapter = mockAdapters.find((a) => a.getName!() === name);
    return adapter as AdapterClient | undefined;
  });

  jest.spyOn(adapterPool, 'healthCheckAll').mockImplementation(async () => {
    const results: Record<string, boolean> = {};
    for (const behavior of behaviors) {
      results[behavior.name] = behavior.healthCheckSuccess;
    }
    return results;
  });
}

/**
 * Reset adapter pool mocks
 */
export function resetMockAdapterPool(): void {
  jest.restoreAllMocks();
}

/**
 * Default mock adapter behaviors for common scenarios
 */
export const mockAdapterBehaviors = {
  allSuccess: (): MockAdapterBehavior[] => [
    {
      name: 'hashnet',
      publishSuccess: true,
      subscribeSuccess: true,
      healthCheckSuccess: true,
    },
    {
      name: 'alastria',
      publishSuccess: true,
      subscribeSuccess: true,
      healthCheckSuccess: true,
    },
  ],

  partialFailure: (): MockAdapterBehavior[] => [
    {
      name: 'hashnet',
      publishSuccess: false,
      publishError: 'Network timeout',
      subscribeSuccess: false,
      healthCheckSuccess: false,
    },
    {
      name: 'alastria',
      publishSuccess: true,
      subscribeSuccess: true,
      healthCheckSuccess: true,
    },
  ],

  allFailure: (): MockAdapterBehavior[] => [
    {
      name: 'hashnet',
      publishSuccess: false,
      publishError: 'Connection refused',
      subscribeSuccess: false,
      healthCheckSuccess: false,
    },
    {
      name: 'alastria',
      publishSuccess: false,
      publishError: 'Blockchain unavailable',
      subscribeSuccess: false,
      healthCheckSuccess: false,
    },
  ],
};
