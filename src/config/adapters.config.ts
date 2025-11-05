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
 * Load adapter configurations from environment variables
 */
function loadAdapterConfigs(): AdapterConfig[] {
  const configs: AdapterConfig[] = [];

  // HashNET Adapter
  try {
    const hashnetName = getAdapterName('HASHNET', 'hashnet');
    const hashnetUrl = getAdapterUrl(hashnetName);
    configs.push({
      name: hashnetName,
      url: hashnetUrl,
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
    configs.push({
      name: alastriaName,
      url: alastriaUrl,
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
        configs.push({
          name,
          url,
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
