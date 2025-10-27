/**
 * Hash Utilities
 *
 * Utility functions for working with Ethereum bytes32 hashes.
 * Smart contracts require 32-byte hashes (66 characters with 0x prefix).
 */

import { createHash } from 'crypto';

/**
 * Validate if string is a valid bytes32 hash (66 characters with 0x prefix)
 *
 * @param value - Value to validate
 * @returns true if valid bytes32 hash
 */
export function isValidBytes32Hash(value: string): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  // Must start with 0x
  if (!value.startsWith('0x')) {
    return false;
  }

  // Must be exactly 66 characters (0x + 64 hex chars)
  if (value.length !== 66) {
    return false;
  }

  // Must be valid hex characters
  const hexRegex = /^0x[0-9a-fA-F]{64}$/;
  return hexRegex.test(value);
}

/**
 * Generate bytes32 hash from string input
 *
 * @param input - String to hash
 * @returns bytes32 hash (66 characters with 0x prefix)
 */
export function generateBytes32Hash(input: string): string {
  // Create SHA-256 hash
  const hash = createHash('sha256').update(input).digest('hex');
  return `0x${hash}`;
}

/**
 * Pad hex string to bytes32 (left-pad with zeros)
 *
 * @param value - Hex string (with or without 0x prefix)
 * @returns bytes32 hash (66 characters with 0x prefix)
 */
export function padToBytes32(value: string): string {
  // Remove 0x prefix if present
  const cleanValue = value.startsWith('0x') ? value.slice(2) : value;

  // Validate it's hex
  if (!/^[0-9a-fA-F]*$/.test(cleanValue)) {
    throw new Error('Invalid hex string');
  }

  // Truncate if too long
  if (cleanValue.length > 64) {
    return `0x${cleanValue.slice(0, 64)}`;
  }

  // Left-pad with zeros to 64 characters
  const padded = cleanValue.padStart(64, '0');
  return `0x${padded}`;
}

/**
 * Create zero bytes32 hash (for initial previousEntityHash)
 *
 * @returns bytes32 of all zeros
 */
export function zeroBytes32(): string {
  return '0x0000000000000000000000000000000000000000000000000000000000000000';
}

/**
 * Validate bytes32 hash and throw error if invalid
 *
 * @param value - Value to validate
 * @param fieldName - Name of field (for error message)
 * @throws Error if invalid
 */
export function requireBytes32Hash(value: string, fieldName: string): void {
  if (!isValidBytes32Hash(value)) {
    throw new Error(
      `Invalid ${fieldName}: must be bytes32 hash (66 characters with 0x prefix). ` +
      `Got: "${value}" (${value.length} characters)`
    );
  }
}

/**
 * Format any string to valid bytes32 hash
 * If already valid, return as-is
 * If too short, left-pad with zeros
 * If not hex, generate hash
 *
 * @param value - Input value
 * @returns Valid bytes32 hash
 */
export function ensureBytes32Hash(value: string): string {
  // Already valid
  if (isValidBytes32Hash(value)) {
    return value;
  }

  // If it starts with 0x and is hex, try padding
  if (value.startsWith('0x') && /^0x[0-9a-fA-F]+$/.test(value)) {
    return padToBytes32(value);
  }

  // Otherwise, generate hash from string
  return generateBytes32Hash(value);
}
