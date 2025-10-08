/**
 * Event Transformer
 *
 * Utilities for transforming events between different formats.
 * Handles adding/removing network parameter and converting between event types.
 */

import { DomeEvent, DomeEventWithNetwork } from '../models/event.model';

/**
 * Add network parameter to event
 *
 * Converts a DomeEvent to DomeEventWithNetwork by adding the network field.
 * This is used internally by IED to track which network an event came from.
 *
 * @param event - Event without network parameter
 * @param network - Network name (e.g., "hashnet", "alastria")
 * @returns Event with network parameter
 */
export function addNetworkParameter(event: DomeEvent, network: string): DomeEventWithNetwork {
  return {
    ...event,
    network,
  };
}

/**
 * Remove network parameter from event
 *
 * Strips the network parameter from an event before sending to Desmos or replicating.
 * Desmos should not see the network parameter.
 *
 * @param event - Event with or without network parameter
 * @returns Event without network parameter
 */
export function stripNetworkParameter(event: DomeEvent | DomeEventWithNetwork): DomeEvent {
  const { network, ...eventWithoutNetwork } = event as any;
  return eventWithoutNetwork;
}

/**
 * Check if event has network parameter
 *
 * @param event - Event to check
 * @returns true if event has network parameter
 */
export function hasNetworkParameter(event: any): event is DomeEventWithNetwork {
  return 'network' in event && typeof event.network === 'string';
}

/**
 * Clone event (deep copy)
 *
 * @param event - Event to clone
 * @returns Cloned event
 */
export function cloneEvent<T extends DomeEvent | DomeEventWithNetwork>(event: T): T {
  return JSON.parse(JSON.stringify(event));
}

/**
 * Normalize event field names
 *
 * DLT Adapters may use slightly different field names.
 * This function normalizes them to IED's expected format.
 *
 * @param event - Raw event from adapter
 * @returns Normalized event
 */
export function normalizeEvent(event: any): DomeEvent {
  return {
    id: event.id,
    timestamp: event.timestamp,
    eventType: event.eventType,
    dataLocation: event.dataLocation,
    entityIdHash: event.entityIdHash || event.entityIDHash,
    previousEntityHash: event.previousEntityHash,
    relevantMetadata: event.relevantMetadata || [],
    publisherAddress: event.publisherAddress,
  };
}

/**
 * Validate event structure
 *
 * @param event - Event to validate
 * @returns true if valid
 * @throws Error if invalid
 */
export function validateEvent(event: any): event is DomeEvent {
  if (!event) {
    throw new Error('Event is null or undefined');
  }

  if (typeof event.id !== 'number') {
    throw new Error('Event.id must be a number');
  }

  if (typeof event.timestamp !== 'number') {
    throw new Error('Event.timestamp must be a number');
  }

  if (typeof event.eventType !== 'string' || event.eventType === '') {
    throw new Error('Event.eventType must be a non-empty string');
  }

  if (typeof event.dataLocation !== 'string' || event.dataLocation === '') {
    throw new Error('Event.dataLocation must be a non-empty string');
  }

  if (typeof event.entityIdHash !== 'string') {
    throw new Error('Event.entityIdHash must be a string');
  }

  if (typeof event.previousEntityHash !== 'string') {
    throw new Error('Event.previousEntityHash must be a string');
  }

  if (!Array.isArray(event.relevantMetadata)) {
    throw new Error('Event.relevantMetadata must be an array');
  }

  return true;
}
