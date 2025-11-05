/**
 * Environment Configuration
 *
 * Loads and validates environment variables.
 */

import dotenv from 'dotenv';
import path from 'path';

// Load .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/**
 * Environment configuration interface
 */
export interface EnvConfig {
  // Server configuration
  port: number;
  nodeEnv: string;

  // Redis configuration
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };

  // IED configuration
  ied: {
    baseUrl: string;
  };

  // Logging configuration
  logging: {
    level: string;
    format: string;
  };

  // Health check configuration
  healthCheck: {
    intervalMs: number;
  };

  // Retry configuration
  retry: {
    maxAttempts: number;
    delayMs: number;
  };

  // Timeout configuration
  timeout: {
    adapterTimeoutMs: number;
    notificationTimeoutMs: number;
  };

  // Replication configuration
  replication: {
    delayMs: number;
  };
}

/**
 * Get environment variable or throw error if missing (currently unused but kept for future use)
 */
// function getEnvVar(key: string, defaultValue?: string): string {
//   const value = process.env[key] || defaultValue;
//   if (value === undefined) {
//     throw new Error(`Missing required environment variable: ${key}`);
//   }
//   return value;
// }

/**
 * Get optional environment variable
 */
function getOptionalEnvVar(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

/**
 * Parse integer from environment variable
 */
function getEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid integer value for ${key}: ${value}`);
  }
  return parsed;
}

/**
 * Load and validate environment configuration
 */
export const envConfig: EnvConfig = {
  port: getEnvInt('PORT', 8080),
  nodeEnv: getOptionalEnvVar('NODE_ENV', 'development'),

  redis: {
    host: getOptionalEnvVar('REDIS_HOST', 'localhost'),
    port: getEnvInt('REDIS_PORT', 6379),
    password: process.env.REDIS_PASSWORD,
    db: getEnvInt('REDIS_DB', 0),
  },

  ied: {
    baseUrl: getOptionalEnvVar('IED_BASE_URL', 'http://localhost:8080'),
  },

  logging: {
    level: getOptionalEnvVar('LOG_LEVEL', 'info'),
    format: getOptionalEnvVar('LOG_FORMAT', 'json'),
  },

  healthCheck: {
    intervalMs: getEnvInt('HEALTH_CHECK_INTERVAL_MS', 30000),
  },

  retry: {
    maxAttempts: getEnvInt('MAX_RETRY_ATTEMPTS', 3),
    delayMs: getEnvInt('RETRY_DELAY_MS', 1000),
  },

  timeout: {
    adapterTimeoutMs: getEnvInt('ADAPTER_TIMEOUT_MS', 5000),
    notificationTimeoutMs: getEnvInt('NOTIFICATION_TIMEOUT_MS', 5000),
  },

  replication: {
    delayMs: getEnvInt('REPLICATION_DELAY_MS', 15000),
  },
};

/**
 * Check if running in production
 */
export const isProduction = (): boolean => {
  return envConfig.nodeEnv === 'production';
};

/**
 * Check if running in development
 */
export const isDevelopment = (): boolean => {
  return envConfig.nodeEnv === 'development';
};

/**
 * Check if running in test
 */
export const isTest = (): boolean => {
  return envConfig.nodeEnv === 'test';
};
