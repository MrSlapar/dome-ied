/**
 * Replication Service
 *
 * Handles automatic event replication to missing networks.
 * Subscribes to all events on each adapter and propagates to networks where missing.
 */

import { adapterPool } from './adapter.client';
import { getMissingNetworks, markEventPublished } from './cache.service';
import { extractGlobalId } from '../utils/global-id.extractor';
import { stripNetworkParameter } from '../utils/event.transformer';
import { logReplicate, logError, logInfo, logWarn } from '../utils/logger';
import { DomeEvent, PublishEventRequest } from '../models/event.model';
import { envConfig } from '../config/env.config';

/**
 * Handle incoming event from adapter (replication flow)
 *
 * @param event - Event received from adapter
 * @param sourceNetwork - Network where event originated
 */
export async function handleIncomingEvent(
  event: DomeEvent,
  sourceNetwork: string
): Promise<void> {
  try {
    // Extract global ID
    const globalId = extractGlobalId(event.dataLocation);

    logInfo('Received event from adapter', {
      operation: 'replication:receive',
      globalId,
      sourceNetwork,
      eventType: event.eventType,
    });

    // Mark event as published on source network
    await markEventPublished(sourceNetwork, globalId);

    // Find missing networks
    const missingNetworks = await getMissingNetworks(globalId);

    if (missingNetworks.length === 0) {
      logInfo('Event already on all networks, skipping replication', {
        globalId,
        sourceNetwork,
      });
      return;
    }

    logReplicate(globalId, sourceNetwork, missingNetworks, {
      eventType: event.eventType,
    });

    // Replicate to missing networks
    await replicateToNetworks(event, missingNetworks);
  } catch (error) {
    logError('Failed to handle incoming event', error, {
      sourceNetwork,
      eventType: event.eventType,
    });
  }
}

/**
 * Replicate event to specified networks
 *
 * @param event - Event to replicate
 * @param targetNetworks - Networks to replicate to
 */
export async function replicateToNetworks(
  event: DomeEvent,
  targetNetworks: string[]
): Promise<void> {
  if (targetNetworks.length === 0) {
    return;
  }

  const globalId = extractGlobalId(event.dataLocation);

  // Strip network parameter before replicating
  const eventWithoutNetwork = stripNetworkParameter(event);

  // Prepare publish request
  const publishRequest: PublishEventRequest = {
    eventType: eventWithoutNetwork.eventType,
    dataLocation: eventWithoutNetwork.dataLocation,
    relevantMetadata: eventWithoutNetwork.relevantMetadata,
    entityId: eventWithoutNetwork.entityIdHash,
    previousEntityHash: eventWithoutNetwork.previousEntityHash,
  };

  // Replicate to each target network in parallel
  const replicationPromises = targetNetworks.map(async (network) => {
    const client = adapterPool.get(network);

    if (!client) {
      logWarn(`Adapter ${network} not found for replication`, { network, globalId });
      return;
    }

    try {
      const result = await client.publishEvent(publishRequest);

      if (result.success) {
        // Mark as published on target network
        await markEventPublished(network, globalId);

        logInfo('Event replicated successfully', {
          operation: 'replication:success',
          globalId,
          targetNetwork: network,
          timestamp: result.timestamp,
        });
      } else {
        logError(
          `Replication failed to ${network}`,
          new Error(result.error || 'Unknown error'),
          {
            globalId,
            targetNetwork: network,
          }
        );
      }
    } catch (error) {
      logError(`Replication error for ${network}`, error, {
        globalId,
        targetNetwork: network,
      });
    }
  });

  await Promise.allSettled(replicationPromises);
}

/**
 * Setup internal subscriptions for replication on all adapters
 *
 * This is called on IED startup to subscribe to ALL events on each adapter.
 */
export async function setupInternalSubscriptions(): Promise<void> {
  const adapters = adapterPool.getAll();
  const iedBaseUrl = envConfig.ied.baseUrl;

  logInfo('Setting up internal subscriptions for replication', {
    operation: 'replication:setup',
    adapterCount: adapters.length,
  });

  const subscriptionPromises = adapters.map(async (client) => {
    const network = client.getName();

    // Alastria v1.5.2+ supports wildcard subscribe to ALL events: ["*"]
    // This simplifies internal subscriptions - no need to list all event types
    //
    // For backward compatibility with v1.3.0, you can still use specific event types
    // by setting INTERNAL_SUBSCRIPTION_EVENT_TYPES environment variable.
    const eventTypesEnv = process.env.INTERNAL_SUBSCRIPTION_EVENT_TYPES;
    const domeEventTypes = eventTypesEnv
      ? eventTypesEnv.split(',').map((t) => t.trim()).filter((t) => t.length > 0)
      : ['*'];  // v1.5.2+ wildcard: subscribe to ALL events

    // Metadata for subscription (environment tags: sbx, prd, dev)
    // Alastria adapter v2 requires at least one metadata value
    const metadataEnv = process.env.INTERNAL_SUBSCRIPTION_METADATA;
    const metadata = metadataEnv
      ? metadataEnv.split(',').map((m) => m.trim()).filter((m) => m.length > 0)
      : ['sbx'];  // Default to sandbox environment

    // The notification endpoint includes the network name so we can identify source
    const notificationEndpoint = `${iedBaseUrl}/internal/eventNotification/${network}`;

    try {
      logInfo(`Subscribing to ${network} for replication`, {
        network,
        eventTypes: domeEventTypes,
        notificationEndpoint,
      });

      const success = await client.subscribe({
        eventTypes: domeEventTypes,
        notificationEndpoint,
        metadata,  // v1.5.0+ metadata filtering (Alastria v2 requires at least one value)
      });

      if (success) {
        logInfo(`Internal subscription setup successful for ${network}`, {
          network,
          eventTypes: domeEventTypes,
          notificationEndpoint,
        });
      } else {
        logError(
          `Internal subscription setup failed for ${network}`,
          new Error('Subscription returned false'),
          { network }
        );
      }

      return success;
    } catch (error) {
      logError(`Internal subscription setup error for ${network}`, error, { network });
      return false;
    }
  });

  const results = await Promise.allSettled(subscriptionPromises);

  const successCount = results.filter(
    (r) => r.status === 'fulfilled' && r.value === true
  ).length;

  logInfo('Internal subscriptions setup complete', {
    total: adapters.length,
    successful: successCount,
    failed: adapters.length - successCount,
  });

  if (successCount === 0) {
    logError(
      'All internal subscriptions failed',
      new Error('No successful subscriptions'),
      {}
    );
    throw new Error('Failed to setup internal subscriptions on any adapter');
  }

  if (successCount < adapters.length) {
    logWarn('Some internal subscriptions failed', {
      successful: successCount,
      total: adapters.length,
    });
  }
}
