/**
 * Global ID Extractor
 *
 * Extracts the global ID from the dataLocation URL parameter.
 *
 * The global ID is the value of the "hl" query parameter in the dataLocation URL.
 * Example: "http://example.com/entity/123?hl=0xabc123" → "0xabc123"
 */

/**
 * Extract global ID from dataLocation URL
 *
 * @param dataLocation - URL string containing the hl parameter
 * @returns The global ID value
 * @throws Error if dataLocation is invalid or hl parameter is missing
 */
export function extractGlobalId(dataLocation: string): string {
  if (!dataLocation) {
    throw new Error('dataLocation is required');
  }

  if (typeof dataLocation !== 'string') {
    throw new Error('dataLocation must be a string');
  }

  try {
    const url = new URL(dataLocation);
    const globalId = url.searchParams.get('hl');

    if (!globalId) {
      throw new Error('Missing "hl" parameter in dataLocation URL');
    }

    if (globalId.trim() === '') {
      throw new Error('Empty "hl" parameter in dataLocation URL');
    }

    return globalId;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('hl')) {
        throw error; // Re-throw our custom errors
      }
      throw new Error(`Invalid dataLocation URL: ${dataLocation} - ${error.message}`);
    }
    throw new Error(`Invalid dataLocation URL: ${dataLocation}`);
  }
}

/**
 * Validate if dataLocation contains a valid global ID
 *
 * @param dataLocation - URL string to validate
 * @returns true if valid, false otherwise
 */
export function hasValidGlobalId(dataLocation: string): boolean {
  try {
    extractGlobalId(dataLocation);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract global ID safely (returns null instead of throwing)
 *
 * @param dataLocation - URL string containing the hl parameter
 * @returns The global ID value or null if extraction fails
 */
export function extractGlobalIdSafe(dataLocation: string): string | null {
  try {
    return extractGlobalId(dataLocation);
  } catch {
    return null;
  }
}
