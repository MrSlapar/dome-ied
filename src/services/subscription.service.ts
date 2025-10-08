/**
 * Subscription Service
 *
 * Manages Desmos subscriptions to specific events.
 * Handles deduplication to ensure Desmos receives each event only once.
 */

import axios from 'axios';
import { adapterPool } from './adapter.client';
import { isEventNotified, markEventNotified } from './cache.service';
import { extractGlobalId } from '../utils/global-id.extractor';
import { stripNetworkParameter } from '../utils/event.transformer';
import { logNotify, logError, logInfo, logWarn } from '../utils/logger';
import { DomeEvent } from '../models/event.model';
import {
  SubscriptionRequest,
  SubscriptionResponse,
  SubscriptionResult,
} from '../models/subscription.model';
import { envConfig } from '../config/env.config';
import { v4 as uuidv4 } from 'uuid';

/**
 * Active subscriptions storage
 * In production, this should be persisted in Redis or a database
 */
const activeSubscriptions = new Map<
  string,
  {
    id: string;
    eventTypes: string[];
    callbackUrl: string;
    createdAt: Date;
  }
>();

/**
 * Subscribe Desmos to specific event types across all adapters
 *
 * @param request - Subscription request from Desmos
 * @returns Subscription response with results
 */
export async function subscribeDesmosToEvents(
  request: SubscriptionRequest
): Promise<SubscriptionResponse> {
  const subscriptionId = uuidv4();
  const iedBaseUrl = envConfig.ied.baseUrl;

  logInfo('Creating Desmos subscription', {
    operation: 'subscription:create',
    subscriptionId,
    eventTypes: request.eventTypes,
    callbackUrl: request.notificationEndpoint,
  });

  // Store subscription info
  activeSubscriptions.set(subscriptionId, {
    id: subscriptionId,
    eventTypes: request.eventTypes,
    callbackUrl: request.notificationEndpoint,
    createdAt: new Date(),
  });

  const adapters = adapterPool.getAll();

  // Subscribe to specified event types on ALL adapters
  // The notification endpoint is the same for all adapters (IED's Desmos webhook)
  const notificationEndpoint = `${iedBaseUrl}/internal/desmosNotification`;

  const subscriptionPromises = adapters.map(async (client) => {
    try {
      const success = await client.subscribe({
        eventTypes: request.eventTypes,
        notificationEndpoint,
      });

      const result: SubscriptionResult = {
        adapter: client.getName(),
        success,
        error: success ? undefined : 'Subscription failed',
      };

      return result;
    } catch (error) {
      logError(`Subscription failed for ${client.getName()}`, error, {
        adapter: client.getName(),
        eventTypes: request.eventTypes,
      });

      return {
        adapter: client.getName(),
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  const results = await Promise.allSettled(subscriptionPromises);

  const subscriptionResults: SubscriptionResult[] = [];
  const errors: string[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      subscriptionResults.push(result.value);

      if (!result.value.success) {
        errors.push(`${result.value.adapter}: ${result.value.error}`);
      }
    } else {
      errors.push(`Unknown error: ${result.reason}`);
      subscriptionResults.push({
        adapter: 'unknown',
        success: false,
        error: result.reason,
      });
    }
  }

  const success = subscriptionResults.some((r) => r.success);

  if (success) {
    logInfo('Desmos subscription created successfully', {
      subscriptionId,
      successfulAdapters: subscriptionResults.filter((r) => r.success).map((r) => r.adapter),
      failedAdapters: subscriptionResults.filter((r) => !r.success).map((r) => r.adapter),
    });
  } else {
    logError(
      'Desmos subscription failed on all adapters',
      new Error('All adapters failed'),
      {
        subscriptionId,
        errors,
      }
    );

    // Remove from active subscriptions
    activeSubscriptions.delete(subscriptionId);
  }

  return {
    success,
    subscriptionId,
    results: subscriptionResults,
    errors,
  };
}

/**
 * Handle incoming event for Desmos notification
 *
 * This is called when an event matching a Desmos subscription arrives from any adapter.
 * Implements deduplication to ensure Desmos receives each event only once.
 *
 * @param event - Event received from adapter
 */
export async function handleDesmosNotification(event: DomeEvent): Promise<void> {
  try {
    // Extract global ID for deduplication
    const globalId = extractGlobalId(event.dataLocation);

    logInfo('Received event for Desmos notification', {
      operation: 'desmos:receive',
      globalId,
      eventType: event.eventType,
    });

    // Check if already notified
    const alreadyNotified = await isEventNotified(globalId);

    if (alreadyNotified) {
      logInfo('Event already notified to Desmos, skipping', {
        globalId,
        eventType: event.eventType,
      });
      return;
    }

    // Find matching subscriptions
    const matchingSubscriptions = Array.from(activeSubscriptions.values()).filter((sub) =>
      sub.eventTypes.length === 0 || sub.eventTypes.includes(event.eventType)
    );

    if (matchingSubscriptions.length === 0) {
      logWarn('No matching subscriptions found for event', {
        globalId,
        eventType: event.eventType,
      });
      return;
    }

    // Strip network parameter before notifying Desmos
    const eventWithoutNetwork = stripNetworkParameter(event);

    // Notify all matching subscriptions
    const notificationPromises = matchingSubscriptions.map(async (subscription) => {
      await notifyDesmos(subscription.callbackUrl, eventWithoutNetwork, globalId);
    });

    await Promise.allSettled(notificationPromises);

    // Mark as notified (even if some notifications failed)
    // This prevents repeated notification attempts
    await markEventNotified(globalId);

    logInfo('Desmos notification complete', {
      globalId,
      notificationCount: matchingSubscriptions.length,
    });
  } catch (error) {
    logError('Failed to handle Desmos notification', error, {
      eventType: event.eventType,
    });
  }
}

/**
 * Notify Desmos via callback URL
 *
 * @param callbackUrl - Desmos callback URL
 * @param event - Event to send (without network parameter)
 * @param globalId - Event global ID
 */
async function notifyDesmos(
  callbackUrl: string,
  event: DomeEvent,
  globalId: string
): Promise<void> {
  try {
    logNotify(globalId, callbackUrl, { eventType: event.eventType });

    await axios.post(callbackUrl, event, {
      timeout: envConfig.timeout.notificationTimeoutMs,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    logInfo('Desmos notified successfully', {
      operation: 'desmos:notify:success',
      globalId,
      callbackUrl,
    });
  } catch (error) {
    logError('Failed to notify Desmos', error, {
      globalId,
      callbackUrl,
    });
    // Don't throw - we don't want one failed notification to stop others
  }
}

/**
 * Get active subscriptions
 *
 * @returns List of active subscriptions
 */
export function getActiveSubscriptions(): Array<{
  id: string;
  eventTypes: string[];
  callbackUrl: string;
  createdAt: Date;
}> {
  return Array.from(activeSubscriptions.values());
}

/**
 * Get subscription count
 *
 * @returns Number of active subscriptions
 */
export function getSubscriptionCount(): number {
  return activeSubscriptions.size;
}

/**
 * Remove subscription
 *
 * @param subscriptionId - Subscription ID to remove
 * @returns true if removed, false if not found
 */
export function removeSubscription(subscriptionId: string): boolean {
  return activeSubscriptions.delete(subscriptionId);
}
