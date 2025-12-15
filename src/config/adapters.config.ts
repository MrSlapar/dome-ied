/**
 * DLT Adapters Configuration
 *
 * Configures available DLT Adapters based on environment variables.
 */

/**
 * DLT Adapter configuration
 */
export interface AdapterConfig {
  name: string;
  url: string;
  chainId: string;  // Blockchain chain identifier for Redis keys (publishedEvents:<chainId>)
  healthEndpoint: string;
  publishEndpoint: string;
  subscribeEndpoint: string;
  eventsEndpoint: string;
}

/**
 * Get adapter URL from environment or throw error
 */
function getAdapterUrl(name: string): string {
  const envKey = `${name.toUpperCase()}_ADAPTER_URL`;
  const url = process.env[envKey];
  if (!url) {
    throw new Error(`Missing adapter URL for ${name}: ${envKey}`);
  }
  return url;
}

/**
 * Get adapter name from environment or use default
 */
function getAdapterName(prefix: string, defaultName: string): string {
  const envKey = `${prefix.toUpperCase()}_ADAPTER_NAME`;
  return process.env[envKey] || defaultName;
}

/**
 * Get adapter chain ID from environment
 * Chain ID is used for Redis keys: publishedEvents:<chainId>
 */
function getAdapterChainId(name: string): string {
  const envKey = `${name.toUpperCase()}_CHAIN_ID`;
  const chainId = process.env[envKey];
  if (!chainId) {
    // Fallback to network name if chain ID not configured
    // This maintains backward compatibility but logs a warning
    console.warn(`Chain ID not configured for ${name} (${envKey}), using name as fallback`);
    return name;
  }
  return chainId;
}

/**
 * Load adapter configurations from environment variables
 */
function loadAdapterConfigs(): AdapterConfig[] {
  const configs: AdapterConfig[] = [];

  // HashNET Adapter
  try {
    const hashnetName = getAdapterName('HASHNET', 'hashnet');
    const hashnetUrl = getAdapterUrl(hashnetName);
    const hashnetChainId = getAdapterChainId(hashnetName);
    configs.push({
      name: hashnetName,
      url: hashnetUrl,
      chainId: hashnetChainId,
      healthEndpoint: '/health',
      publishEndpoint: '/api/v1/publishEvent',
      subscribeEndpoint: '/api/v1/subscribe',
      eventsEndpoint: '/api/v1/events',
    });
  } catch (error) {
    console.warn('HashNET adapter not configured:', error);
  }

  // Alastria Adapter
  try {
    const alastriaName = getAdapterName('ALASTRIA', 'alastria');
    const alastriaUrl = getAdapterUrl(alastriaName);
    const alastriaChainId = getAdapterChainId(alastriaName);
    configs.push({
      name: alastriaName,
      url: alastriaUrl,
      chainId: alastriaChainId,
      healthEndpoint: '/health',
      publishEndpoint: '/api/v2/publishEvent',
      subscribeEndpoint: '/api/v2/subscribe',
      eventsEndpoint: '/api/v2/events',
    });
  } catch (error) {
    console.warn('Alastria adapter not configured:', error);
  }

  // Dynamic adapter loading from ADAPTER_NAMES env var
  const adapterNames = process.env.ADAPTER_NAMES;
  if (adapterNames) {
    const names = adapterNames.split(',').map((n) => n.trim());
    for (const name of names) {
      // Skip if already loaded (hashnet, alastria)
      if (configs.find((c) => c.name === name)) {
        continue;
      }

      try {
        const url = getAdapterUrl(name);
        const chainId = getAdapterChainId(name);
        configs.push({
          name,
          url,
          chainId,
          healthEndpoint: '/health',
          publishEndpoint: '/api/v1/publishEvent',
          subscribeEndpoint: '/api/v1/subscribe',
          eventsEndpoint: '/api/v1/events',
        });
      } catch (error) {
        console.warn(`Adapter ${name} not configured:`, error);
      }
    }
  }

  if (configs.length === 0) {
    throw new Error(
      'No DLT Adapters configured. Please set HASHNET_ADAPTER_URL, ALASTRIA_ADAPTER_URL, or ADAPTER_NAMES in environment.'
    );
  }

  return configs;
}

/**
 * Available DLT Adapters
 */
export const adapters: AdapterConfig[] = loadAdapterConfigs();

/**
 * Get adapter configuration by name
 */
export function getAdapterByName(name: string): AdapterConfig | undefined {
  return adapters.find((adapter) => adapter.name === name);
}

/**
 * Get all adapter names
 */
export function getAdapterNames(): string[] {
  return adapters.map((adapter) => adapter.name);
}

/**
 * Get number of configured adapters
 */
export function getAdapterCount(): number {
  return adapters.length;
}

/**
 * Get chain ID for a network by name
 * Used by cache.service.ts for Redis keys
 *
 * @param networkName - Network name (e.g., "hashnet", "alastria")
 * @returns Chain ID for Redis keys (e.g., "1", "2")
 * @throws Error if network not found
 */
export function getChainIdByNetwork(networkName: string): string {
  const adapter = adapters.find((a) => a.name === networkName);
  if (!adapter) {
    throw new Error(`Adapter not found for network: ${networkName}`);
  }
  return adapter.chainId;
}

/**
 * Get network name by chain ID
 * Reverse lookup for debugging/logging
 *
 * @param chainId - Chain ID
 * @returns Network name or undefined if not found
 */
export function getNetworkByChainId(chainId: string): string | undefined {
  const adapter = adapters.find((a) => a.chainId === chainId);
  return adapter?.name;
}

/**
 * Get all chain IDs
 */
export function getChainIds(): string[] {
  return adapters.map((adapter) => adapter.chainId);
}
