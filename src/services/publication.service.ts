/**
 * Publication Service
 *
 * Handles direct publication of events to all configured DLT Adapters.
 * Implements parallel publishing with error handling and cache marking.
 */

import { adapterPool } from './adapter.client';
import { markEventPublished } from './cache.service';
import { extractGlobalId } from '../utils/global-id.extractor';
import { logPublish, logError, logInfo } from '../utils/logger';
import {
  PublishEventRequest,
  AdapterPublishRequest,
  PublishEventResult,
  PublishEventResponse,
} from '../models/event.model';

/**
 * Publish event to all configured adapters in parallel
 *
 * @param request - Event publication request from Desmos
 * @returns Publication response with results from all adapters
 */
export async function publishEventToAllAdapters(
  request: PublishEventRequest
): Promise<PublishEventResponse> {
  // Extract global ID for tracking
  const globalId = extractGlobalId(request.dataLocation);

  const adapters = adapterPool.getAll();
  const adapterNames = adapters.map((a) => a.getName());

  logPublish(globalId, adapterNames, {
    eventType: request.eventType,
    entityId: request.entityId,
  });

  // Prepare adapter request (same as incoming request)
  const adapterRequest: AdapterPublishRequest = {
    eventType: request.eventType,
    dataLocation: request.dataLocation,
    relevantMetadata: request.relevantMetadata,
    entityId: request.entityId,
    previousEntityHash: request.previousEntityHash,
    iss: request.iss,
    rpcAddress: request.rpcAddress,
  };

  // Publish to all adapters in parallel using Promise.allSettled
  // This ensures one adapter failure doesn't stop the others
  const publishPromises = adapters.map(async (client) => {
    const result = await client.publishEvent(adapterRequest);

    // Mark in cache if successful
    if (result.success) {
      try {
        await markEventPublished(client.getName(), globalId);
      } catch (cacheError) {
        logError('Failed to mark event in cache', cacheError, {
          adapter: client.getName(),
          globalId,
        });
      }
    }

    return result;
  });

  const results = await Promise.allSettled(publishPromises);

  // Process results
  const publishResults: PublishEventResult[] = [];
  const errors: string[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      publishResults.push(result.value);

      if (!result.value.success) {
        errors.push(`${result.value.adapter}: ${result.value.error}`);
      }
    } else {
      // Promise rejected (shouldn't happen with try-catch inside, but just in case)
      errors.push(`Unknown error: ${result.reason}`);
      publishResults.push({
        adapter: 'unknown',
        success: false,
        error: result.reason,
      });
    }
  }

  const success = publishResults.some((r) => r.success);

  if (success) {
    const successfulAdapters = publishResults
      .filter((r) => r.success)
      .map((r) => r.adapter);

    logInfo('Event published successfully', {
      globalId,
      adapters: successfulAdapters,
      failedAdapters: publishResults.filter((r) => !r.success).map((r) => r.adapter),
    });
  } else {
    logError('Event publication failed on all adapters', new Error('All adapters failed'), {
      globalId,
      errors,
    });
  }

  return {
    success,
    results: publishResults,
    errors,
  };
}

/**
 * Publish event to specific adapters
 *
 * @param request - Event publication request
 * @param adapterNames - Names of adapters to publish to
 * @returns Publication response
 */
export async function publishEventToAdapters(
  request: PublishEventRequest,
  adapterNames: string[]
): Promise<PublishEventResponse> {
  const globalId = extractGlobalId(request.dataLocation);

  logPublish(globalId, adapterNames, {
    eventType: request.eventType,
    entityId: request.entityId,
  });

  const adapterRequest: AdapterPublishRequest = {
    eventType: request.eventType,
    dataLocation: request.dataLocation,
    relevantMetadata: request.relevantMetadata,
    entityId: request.entityId,
    previousEntityHash: request.previousEntityHash,
    iss: request.iss,
    rpcAddress: request.rpcAddress,
  };

  const publishPromises = adapterNames.map(async (name) => {
    const client = adapterPool.get(name);

    if (!client) {
      logError(`Adapter ${name} not found`, new Error('Adapter not configured'), { name });
      return {
        adapter: name,
        success: false,
        error: 'Adapter not configured',
      };
    }

    const result = await client.publishEvent(adapterRequest);

    if (result.success) {
      try {
        await markEventPublished(name, globalId);
      } catch (cacheError) {
        logError('Failed to mark event in cache', cacheError, { adapter: name, globalId });
      }
    }

    return result;
  });

  const results = await Promise.allSettled(publishPromises);

  const publishResults: PublishEventResult[] = [];
  const errors: string[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      publishResults.push(result.value);

      if (!result.value.success) {
        errors.push(`${result.value.adapter}: ${result.value.error}`);
      }
    } else {
      errors.push(`Unknown error: ${result.reason}`);
      publishResults.push({
        adapter: 'unknown',
        success: false,
        error: result.reason,
      });
    }
  }

  const success = publishResults.some((r) => r.success);

  return {
    success,
    results: publishResults,
    errors,
  };
}
