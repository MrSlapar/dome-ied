/**
 * Event Models
 *
 * Defines TypeScript interfaces for DOME events based on DLT Adapter specification.
 */

/**
 * DOME Event structure as received from DLT Adapters
 */
export interface DomeEvent {
  id: number;
  timestamp: number;
  eventType: string;
  dataLocation: string;
  entityIdHash: string;
  previousEntityHash: string;
  relevantMetadata: string[];
  publisherAddress?: string;
}

/**
 * Internal event structure with network tracking
 * Used by IED to track which network an event came from
 */
export interface DomeEventWithNetwork extends DomeEvent {
  network: string; // "hashnet" | "alastria" | etc.
}

/**
 * Event publication request from Desmos
 */
export interface PublishEventRequest {
  eventType: string;
  dataLocation: string;
  relevantMetadata: string[];
  entityId: string;
  previousEntityHash: string;
  iss?: string;
  rpcAddress?: string;
}

/**
 * Adapter-specific publication request
 * (same as PublishEventRequest, sent to DLT Adapter)
 */
export interface AdapterPublishRequest {
  eventType: string;
  dataLocation: string;
  relevantMetadata: string[];
  entityId: string;
  previousEntityHash: string;
  iss?: string;
  rpcAddress?: string;
}

/**
 * Publication result from adapter
 */
export interface PublishEventResult {
  adapter: string;
  success: boolean;
  timestamp?: number;
  error?: string;
}

/**
 * Aggregated publication results from all adapters
 */
export interface PublishEventResponse {
  success: boolean;
  results: PublishEventResult[];
  errors: string[];
}
