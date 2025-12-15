/**
 * Jest Setup File
 *
 * Configure environment variables for tests before any modules are loaded.
 * This ensures adapters.config.ts uses correct chainIds.
 */

// Set adapter environment variables for tests
// These must be set BEFORE adapters.config.ts is imported

// Adapter URLs (required for adapter config to load)
process.env.HASHNET_ADAPTER_URL = 'http://localhost:8081';
process.env.ALASTRIA_ADAPTER_URL = 'http://localhost:8082';

// Chain IDs - matching production values
// hashnet = chainId 1, alastria = chainId 2
process.env.HASHNET_CHAIN_ID = '1';
process.env.ALASTRIA_CHAIN_ID = '2';

// Redis configuration for tests
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.REDIS_DB = '1'; // Use database 1 for tests to avoid conflicts

// IED configuration
process.env.IED_BASE_URL = 'http://localhost:8080';
process.env.NODE_ENV = 'test';

// Logging - reduce noise in tests
process.env.LOG_LEVEL = 'error';
