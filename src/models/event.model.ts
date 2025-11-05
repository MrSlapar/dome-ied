/**
 * Event Models
 *
 * Defines TypeScript interfaces for DOME events based on DLT Adapter specification.
 */

/**
 * DOME Event structure as received from DLT Adapters
 *
 * Supports both Alastria adapter versions:
 * - v1.3.0: Uses 'origin' field (mapped to publisherAddress by IED)
 * - v1.5.0+: Uses 'publisherAddress' and 'authorAddress' fields
 *
 * The optional fields ensure backward compatibility between versions.
 */
export interface DomeEvent {
  id: number;
  timestamp: number;
  eventType: string;
  dataLocation: string;
  entityIdHash: string;
  previousEntityHash: string;
  relevantMetadata: string[];

  // v1.5.0+ fields (optional for backward compatibility)
  publisherAddress?: string;  // Organization identifier (ISS) that published the event
  authorAddress?: string;      // Ethereum address of the account that signed the transaction

  // v1.3.0 legacy field (deprecated in v1.5.0+)
  origin?: string;             // Legacy field, mapped to publisherAddress
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
