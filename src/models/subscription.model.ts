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
 */
export interface AdapterSubscriptionRequest {
  eventTypes: string[];
  notificationEndpoint: string;
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
