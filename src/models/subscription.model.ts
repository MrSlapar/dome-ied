/**
 * Subscription Models
 *
 * Defines TypeScript interfaces for event subscriptions.
 */

/**
 * Subscription request from Desmos
 */
export interface SubscriptionRequest {
  eventTypes: string[];
  notificationEndpoint: string;
  iss?: string;
}

/**
 * Adapter subscription configuration
 *
 * For Alastria adapter v1.5.0+ (API v2):
 * - metadata: Optional filter for event metadata as array (e.g., ["prd", "sbx"])
 * - eventTypes: Can use wildcard ["*"] to subscribe to all events (v1.5.2+)
 */
export interface AdapterSubscriptionRequest {
  eventTypes: string[];
  notificationEndpoint: string;
  metadata?: string[];  // v1.5.0+ optional metadata filtering (API v2 uses array)
}

/**
 * Internal subscription tracking
 */
export interface Subscription {
  id: string;
  eventTypes: string[];
  callbackUrl: string;
  createdAt: Date;
  active: boolean;
}

/**
 * Subscription result from adapter
 */
export interface SubscriptionResult {
  adapter: string;
  success: boolean;
  error?: string;
}

/**
 * Aggregated subscription response
 */
export interface SubscriptionResponse {
  success: boolean;
  subscriptionId: string;
  results: SubscriptionResult[];
  errors: string[];
}
