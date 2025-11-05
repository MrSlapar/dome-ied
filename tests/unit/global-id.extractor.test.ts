/**
 * Unit Tests: Global ID Extractor
 *
 * Tests the extractGlobalId utility function that extracts the
 * global event ID from dataLocation URLs.
 */

import { extractGlobalId } from '../../src/utils/global-id.extractor';

describe('extractGlobalId', () => {
  describe('Valid URLs', () => {
    it('should extract global ID from valid dataLocation URL', () => {
      const url = 'https://marketplace.dome-marketplace.org/product/laptop?hl=0xabc123def456';
      const result = extractGlobalId(url);
      expect(result).toBe('0xabc123def456');
    });

    it('should extract global ID when hl parameter is first', () => {
      const url = 'https://example.com/path?hl=0xtest123&other=value&foo=bar';
      const result = extractGlobalId(url);
      expect(result).toBe('0xtest123');
    });

    it('should extract global ID when hl parameter is in the middle', () => {
      const url = 'https://example.com/path?foo=bar&hl=0xmiddle123&baz=qux';
      const result = extractGlobalId(url);
      expect(result).toBe('0xmiddle123');
    });

    it('should extract global ID when hl parameter is last', () => {
      const url = 'https://example.com/path?other=value&hl=0xlast456';
      const result = extractGlobalId(url);
      expect(result).toBe('0xlast456');
    });

    it('should handle URL with fragment identifier', () => {
      const url = 'https://example.com/path?hl=0xfragment123#section';
      const result = extractGlobalId(url);
      expect(result).toBe('0xfragment123');
    });

    it('should extract global ID with special characters', () => {
      const url = 'https://example.com/path?hl=0xABCDEF123456789abcdef';
      const result = extractGlobalId(url);
      expect(result).toBe('0xABCDEF123456789abcdef');
    });
  });

  describe('Invalid URLs', () => {
    it('should throw error when hl parameter is missing', () => {
      const url = 'https://example.com/path?other=param&foo=bar';
      expect(() => extractGlobalId(url)).toThrow();
    });

    it('should throw error when hl parameter is empty', () => {
      const url = 'https://example.com/path?hl=&other=value';
      expect(() => extractGlobalId(url)).toThrow();
    });

    it('should throw error when URL has no query parameters', () => {
      const url = 'https://example.com/path';
      expect(() => extractGlobalId(url)).toThrow();
    });

    it('should throw error for empty string', () => {
      expect(() => extractGlobalId('')).toThrow();
    });

    it('should throw error for invalid URL format', () => {
      expect(() => extractGlobalId('not-a-valid-url')).toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle URL with only hl parameter', () => {
      const url = 'https://example.com/path?hl=0xonly123';
      const result = extractGlobalId(url);
      expect(result).toBe('0xonly123');
    });

    it('should handle URL with encoded characters', () => {
      const url = 'https://example.com/path?hl=0xtest123&other=value%20with%20spaces';
      const result = extractGlobalId(url);
      expect(result).toBe('0xtest123');
    });

    it('should handle very long global ID', () => {
      const longId = '0x' + 'a'.repeat(100);
      const url = `https://example.com/path?hl=${longId}`;
      const result = extractGlobalId(url);
      expect(result).toBe(longId);
    });
  });
});
