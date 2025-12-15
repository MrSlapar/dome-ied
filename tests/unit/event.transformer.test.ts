/**
 * Unit Tests: Event Transformer
 *
 * Tests the stripNetworkParameter utility function that removes
 * network identifiers from events before replication.
 */

import { stripNetworkParameter } from '../../src/utils/event.transformer';
import { DomeEvent, DomeEventWithNetwork } from '../../src/models/event.model';

describe('stripNetworkParameter', () => {
  describe('Event with network parameter', () => {
    it('should remove network parameter from event', () => {
      const event: DomeEventWithNetwork = {
        id: 1,
        timestamp: Date.now(),
        eventType: 'ProductAdded',
        dataLocation: 'https://example.com/product?hl=0xtest123',
        relevantMetadata: ['sbx', 'category:electronics'],
        entityIdHash: '0xentity123',
        previousEntityHash: '0x0000',
        network: 'hashnet',
      };

      const result = stripNetworkParameter(event);

      expect(result).not.toHaveProperty('network');
      expect(result.eventType).toBe('ProductAdded');
      expect(result.dataLocation).toBe('https://example.com/product?hl=0xtest123');
    });

    it('should preserve all other event properties', () => {
      const event: DomeEventWithNetwork = {
        id: 2,
        timestamp: Date.now(),
        eventType: 'ServiceUpdated',
        dataLocation: 'https://example.com/service?hl=0xservice456',
        relevantMetadata: ['prd', 'tier:premium'],
        entityIdHash: '0xentity456',
        previousEntityHash: '0xprev123',
        network: 'alastria',
      };

      const result = stripNetworkParameter(event);

      expect(result.eventType).toBe('ServiceUpdated');
      expect(result.dataLocation).toBe('https://example.com/service?hl=0xservice456');
      expect(result.relevantMetadata).toEqual(['prd', 'tier:premium']);
      expect(result.entityIdHash).toBe('0xentity456');
      expect(result.previousEntityHash).toBe('0xprev123');
    });
  });

  describe('Event without network parameter', () => {
    it('should return event unchanged when network parameter is missing', () => {
      const event: DomeEvent = {
        id: 3,
        timestamp: Date.now(),
        eventType: 'ProductDeleted',
        dataLocation: 'https://example.com/product?hl=0xdeleted789',
        relevantMetadata: ['dev'],
        entityIdHash: '0xentity789',
        previousEntityHash: '0xprev456',
      };

      const result = stripNetworkParameter(event);

      expect(result).toEqual(event);
      expect(result).not.toHaveProperty('network');
    });

    it('should handle event with minimal properties', () => {
      const event: DomeEvent = {
        id: 4,
        timestamp: Date.now(),
        eventType: 'ProductOffering',
        dataLocation: 'https://example.com/offering?hl=0xminimal111',
        relevantMetadata: [],
        entityIdHash: '0xentity111',
        previousEntityHash: '0x0000',
      };

      const result = stripNetworkParameter(event);

      expect(result).toEqual(event);
      expect(result.relevantMetadata).toEqual([]);
    });
  });

  describe('Edge cases', () => {
    it('should not mutate original event object', () => {
      const event: DomeEventWithNetwork = {
        id: 5,
        timestamp: Date.now(),
        eventType: 'ProductAdded',
        dataLocation: 'https://example.com/product?hl=0ximmutable123',
        relevantMetadata: ['sbx'],
        entityIdHash: '0xentity222',
        previousEntityHash: '0x0000',
        network: 'hashnet',
      };

      const originalEventCopy = { ...event };
      const result = stripNetworkParameter(event);

      // Original event should remain unchanged
      expect(event).toEqual(originalEventCopy);
      // Result should be a different object
      expect(result).not.toBe(event);
    });

    it('should handle event with undefined metadata', () => {
      const event = {
        id: 6,
        timestamp: Date.now(),
        eventType: 'ServiceAdded',
        dataLocation: 'https://example.com/service?hl=0xundefined333',
        entityIdHash: '0xentity333',
        previousEntityHash: '0x0000',
        network: 'alastria',
      } as any;

      const result = stripNetworkParameter(event);

      expect(result).not.toHaveProperty('network');
      expect(result.eventType).toBe('ServiceAdded');
    });

    it('should handle event with empty metadata array', () => {
      const event: DomeEventWithNetwork = {
        id: 7,
        timestamp: Date.now(),
        eventType: 'ProductUpdated',
        dataLocation: 'https://example.com/product?hl=0xempty444',
        relevantMetadata: [],
        entityIdHash: '0xentity444',
        previousEntityHash: '0xprev789',
        network: 'hashnet',
      };

      const result = stripNetworkParameter(event);

      expect(result).not.toHaveProperty('network');
      expect(result.relevantMetadata).toEqual([]);
    });
  });
});
