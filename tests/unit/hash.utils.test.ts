/**
 * Unit Tests: Hash Utilities
 *
 * Tests utility functions for working with Ethereum bytes32 hashes.
 */

import {
  isValidBytes32Hash,
  generateBytes32Hash,
  padToBytes32,
  zeroBytes32,
  requireBytes32Hash,
  ensureBytes32Hash,
} from '../../src/utils/hash.utils';

describe('hash.utils', () => {
  describe('isValidBytes32Hash', () => {
    it('should return true for valid bytes32 hash', () => {
      const validHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      expect(isValidBytes32Hash(validHash)).toBe(true);
    });

    it('should return true for valid bytes32 hash with uppercase', () => {
      const validHash = '0xABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890';
      expect(isValidBytes32Hash(validHash)).toBe(true);
    });

    it('should return true for valid bytes32 hash with mixed case', () => {
      const validHash = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf1234567890AbCdEf1234567890';
      expect(isValidBytes32Hash(validHash)).toBe(true);
    });

    it('should return true for zero bytes32 hash', () => {
      const zeroHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
      expect(isValidBytes32Hash(zeroHash)).toBe(true);
    });

    it('should return false for hash without 0x prefix', () => {
      const invalidHash = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      expect(isValidBytes32Hash(invalidHash)).toBe(false);
    });

    it('should return false for hash that is too short', () => {
      const invalidHash = '0xabcdef123456';
      expect(isValidBytes32Hash(invalidHash)).toBe(false);
    });

    it('should return false for hash that is too long', () => {
      const invalidHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678900000';
      expect(isValidBytes32Hash(invalidHash)).toBe(false);
    });

    it('should return false for hash with non-hex characters', () => {
      const invalidHash = '0xghijkl1234567890ghijkl1234567890ghijkl1234567890ghijkl1234567890';
      expect(isValidBytes32Hash(invalidHash)).toBe(false);
    });

    it('should return false for non-string input', () => {
      expect(isValidBytes32Hash(123 as any)).toBe(false);
      expect(isValidBytes32Hash(null as any)).toBe(false);
      expect(isValidBytes32Hash(undefined as any)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidBytes32Hash('')).toBe(false);
    });
  });

  describe('generateBytes32Hash', () => {
    it('should generate valid bytes32 hash from string', () => {
      const input = 'hello world';
      const hash = generateBytes32Hash(input);

      expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(isValidBytes32Hash(hash)).toBe(true);
    });

    it('should generate consistent hash for same input', () => {
      const input = 'test-input';
      const hash1 = generateBytes32Hash(input);
      const hash2 = generateBytes32Hash(input);

      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different inputs', () => {
      const hash1 = generateBytes32Hash('input1');
      const hash2 = generateBytes32Hash('input2');

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const hash = generateBytes32Hash('');
      expect(isValidBytes32Hash(hash)).toBe(true);
    });

    it('should handle special characters', () => {
      const hash = generateBytes32Hash('!@#$%^&*()_+-={}[]|:";\'<>?,./');
      expect(isValidBytes32Hash(hash)).toBe(true);
    });

    it('should handle unicode characters', () => {
      const hash = generateBytes32Hash('你好世界🌍');
      expect(isValidBytes32Hash(hash)).toBe(true);
    });
  });

  describe('padToBytes32', () => {
    it('should left-pad short hex string to bytes32', () => {
      const input = '0x123';
      const padded = padToBytes32(input);

      expect(padded).toBe('0x0000000000000000000000000000000000000000000000000000000000000123');
      expect(isValidBytes32Hash(padded)).toBe(true);
    });

    it('should handle hex string without 0x prefix', () => {
      const input = 'abc123';
      const padded = padToBytes32(input);

      expect(padded).toBe('0x0000000000000000000000000000000000000000000000000000000000abc123');
      expect(isValidBytes32Hash(padded)).toBe(true);
    });

    it('should return unchanged if already correct length', () => {
      const input = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const padded = padToBytes32(input);

      expect(padded).toBe(input);
    });

    it('should truncate if too long', () => {
      const input = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678901234';
      const padded = padToBytes32(input);

      expect(padded).toBe('0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890');
      expect(isValidBytes32Hash(padded)).toBe(true);
    });

    it('should handle empty string', () => {
      const padded = padToBytes32('');
      expect(padded).toBe('0x0000000000000000000000000000000000000000000000000000000000000000');
    });

    it('should throw error for non-hex characters', () => {
      expect(() => padToBytes32('0xghijkl')).toThrow('Invalid hex string');
      expect(() => padToBytes32('xyz')).toThrow('Invalid hex string');
    });

    it('should handle uppercase hex', () => {
      const input = '0xABC';
      const padded = padToBytes32(input);

      expect(padded).toBe('0x0000000000000000000000000000000000000000000000000000000000000ABC');
      expect(isValidBytes32Hash(padded)).toBe(true);
    });
  });

  describe('zeroBytes32', () => {
    it('should return zero bytes32 hash', () => {
      const zero = zeroBytes32();

      expect(zero).toBe('0x0000000000000000000000000000000000000000000000000000000000000000');
      expect(isValidBytes32Hash(zero)).toBe(true);
    });

    it('should return same value every time', () => {
      const zero1 = zeroBytes32();
      const zero2 = zeroBytes32();

      expect(zero1).toBe(zero2);
    });
  });

  describe('requireBytes32Hash', () => {
    it('should not throw for valid bytes32 hash', () => {
      const validHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

      expect(() => requireBytes32Hash(validHash, 'testField')).not.toThrow();
    });

    it('should throw for invalid hash with field name in error', () => {
      const invalidHash = '0x123';

      expect(() => requireBytes32Hash(invalidHash, 'entityId')).toThrow(
        'Invalid entityId: must be bytes32 hash (66 characters with 0x prefix). Got: "0x123" (5 characters)'
      );
    });

    it('should throw for hash without 0x prefix', () => {
      const invalidHash = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

      expect(() => requireBytes32Hash(invalidHash, 'hash')).toThrow('Invalid hash');
    });

    it('should throw for empty string', () => {
      expect(() => requireBytes32Hash('', 'hash')).toThrow('Invalid hash');
    });

    it('should throw for non-hex characters', () => {
      const invalidHash = '0xghijkl1234567890ghijkl1234567890ghijkl1234567890ghijkl1234567890';

      expect(() => requireBytes32Hash(invalidHash, 'hash')).toThrow('Invalid hash');
    });
  });

  describe('ensureBytes32Hash', () => {
    it('should return valid hash unchanged', () => {
      const validHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const result = ensureBytes32Hash(validHash);

      expect(result).toBe(validHash);
    });

    it('should pad short hex string', () => {
      const shortHex = '0x123';
      const result = ensureBytes32Hash(shortHex);

      expect(result).toBe('0x0000000000000000000000000000000000000000000000000000000000000123');
      expect(isValidBytes32Hash(result)).toBe(true);
    });

    it('should generate hash for non-hex string', () => {
      const input = 'hello world';
      const result = ensureBytes32Hash(input);

      expect(isValidBytes32Hash(result)).toBe(true);
      expect(result).toBe(generateBytes32Hash(input));
    });

    it('should generate hash for string without 0x prefix', () => {
      const input = 'notahex';
      const result = ensureBytes32Hash(input);

      expect(isValidBytes32Hash(result)).toBe(true);
    });

    it('should handle empty string by generating hash', () => {
      const result = ensureBytes32Hash('');

      expect(isValidBytes32Hash(result)).toBe(true);
      expect(result).toBe(generateBytes32Hash(''));
    });

    it('should pad valid hex with 0x prefix that is too short', () => {
      const shortHex = '0xabc123';
      const result = ensureBytes32Hash(shortHex);

      expect(isValidBytes32Hash(result)).toBe(true);
      expect(result).toBe(padToBytes32(shortHex));
    });

    it('should handle uppercase hex', () => {
      const input = '0xABC';
      const result = ensureBytes32Hash(input);

      expect(isValidBytes32Hash(result)).toBe(true);
    });
  });
});
