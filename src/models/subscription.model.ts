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
 * For Alastria adapter v1.5.0+:
 * - metadata: Optional filter for event metadata (e.g., {"env": "prd"})
 * - eventTypes: Can use wildcard ["*"] to subscribe to all events (v1.5.2+)
 */
export interface AdapterSubscriptionRequest {
  eventTypes: string[];
  notificationEndpoint: string;
  metadata?: Record<string, any>;  // v1.5.0+ optional metadata filtering
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
