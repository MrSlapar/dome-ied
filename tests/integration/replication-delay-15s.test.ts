/**
 * Integration Tests: 15-Second Replication Delay (Production Timing)
 *
 * These tests verify the ACTUAL 15-second delay as specified in the test plan.
 *
 * WARNING: These tests take 15+ seconds to run and are SKIPPED by default.
 *
 * To run these tests:
 *   npm test -- replication-delay-15s.test.ts --testTimeout=30000
 *
 * Purpose:
 * - Validate production delay configuration (15 seconds)
 * - Verify timing requirements from official test plan (Test U5)
 * - Ensure replication does NOT happen before delay expires
 *
 * Test Plan Reference:
 * - Test ID: U5 - "Verify that replication delay is respected (15 s)"
 * - Test ID: I6 - "IED republishes it to other networks after 15 s delay"
 */

import {
  handleIncomingEvent,
} from '../../src/services/replication.service';
import { adapterPool } from '../../src/services/adapter.client';
import {
  markEventPublished,
  getMissingNetworks,
} from '../../src/services/cache.service';
import { DomeEvent } from '../../src/models/event.model';
import { envConfig } from '../../src/config/env.config';

// Mock dependencies
jest.mock('../../src/services/adapter.client');
jest.mock('../../src/services/cache.service');

const mockAdapterPool = adapterPool as jest.Mocked<typeof adapterPool>;
const mockMarkEventPublished = markEventPublished as jest.MockedFunction<typeof markEventPublished>;
const mockGetMissingNetworks = getMissingNetworks as jest.MockedFunction<typeof getMissingNetworks>;

/**
 * IMPORTANT: These tests are SKIPPED by default because they take 15+ seconds each.
 *
 * Use describe.skip to skip these tests in normal CI/CD runs.
 * Change to describe.only when you need to validate production timing.
 */
describe.skip('Replication Service - 15 Second Delay (Production)', () => {
  const testEvent: DomeEvent = {
    id: 1,
    timestamp: Date.now(),
    eventType: 'ProductAdded',
    dataLocation: 'https://example.com/product?hl=0x15stiming',
    relevantMetadata: ['prd'],
    entityIdHash: '0xentity15s',
    previousEntityHash: '0x0000',
  };

  const PRODUCTION_DELAY_MS = 15000; // 15 seconds
  const originalDelay = envConfig.replication.delayMs;

  beforeAll(() => {
    // Set to PRODUCTION delay (15 seconds)
    (envConfig.replication as any).delayMs = PRODUCTION_DELAY_MS;
    console.log(`\n⏱️  Tests configured with PRODUCTION delay: ${PRODUCTION_DELAY_MS}ms (15 seconds)\n`);
  });

  afterAll(() => {
    // Restore original delay
    (envConfig.replication as any).delayMs = originalDelay;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Test Plan ID: U5
   * Requirement: "Verify that replication delay is respected (15 s)"
   * Expected: "Event is not marked for replication before 15 s elapse"
   */
  it('should NOT replicate before 15 seconds elapse', async () => {
    const startTime = Date.now();
    let replicationTime: number | null = null;

    mockMarkEventPublished.mockResolvedValue();
    mockGetMissingNetworks
      .mockResolvedValueOnce(['alastria']) // Before delay
      .mockResolvedValueOnce(['alastria']); // After delay (still missing)

    const mockAlastriaAdapter = {
      getName: jest.fn(() => 'alastria'),
      publishEvent: jest.fn().mockImplementation(() => {
        replicationTime = Date.now();
        return Promise.resolve({
          success: true,
          eventId: 'evt_15s_test',
        });
      }),
    };

    mockAdapterPool.get.mockReturnValue(mockAlastriaAdapter as any);

    console.log('⏳ Starting handleIncomingEvent - waiting for 15s delay...');

    await handleIncomingEvent(testEvent, 'hashnet');

    const totalTime = Date.now() - startTime;
    const replicationDelay = replicationTime ? (replicationTime - startTime) : 0;

    console.log(`✅ Total execution time: ${totalTime}ms`);
    console.log(`✅ Replication occurred at: ${replicationDelay}ms`);

    // Assertions
    expect(mockMarkEventPublished).toHaveBeenCalledWith('hashnet', '0x15stiming');
    expect(mockAlastriaAdapter.publishEvent).toHaveBeenCalled();

    // CRITICAL: Replication must NOT happen before 15 seconds
    expect(replicationDelay).toBeGreaterThanOrEqual(PRODUCTION_DELAY_MS);

    // Allow small margin for processing time (max 500ms overhead)
    expect(replicationDelay).toBeLessThan(PRODUCTION_DELAY_MS + 500);

    console.log(`✅ Test PASSED: Replication respected 15-second delay (${replicationDelay}ms)`);
  }, 20000); // 20 second timeout

  /**
   * Test Plan ID: I6
   * Requirement: "IED republishes it to other networks after 15 s delay"
   * Expected: "Replication of events only happens after 15s to every configured network missing them"
   */
  it('should replicate to ALL missing networks after exactly 15 seconds', async () => {
    const startTime = Date.now();
    const replicationTimes: Record<string, number> = {};

    mockMarkEventPublished.mockResolvedValue();
    mockGetMissingNetworks
      .mockResolvedValueOnce(['alastria', 'fabric']) // 2 missing networks
      .mockResolvedValueOnce(['alastria', 'fabric']); // Still missing after delay

    const mockAlastriaAdapter = {
      getName: jest.fn(() => 'alastria'),
      publishEvent: jest.fn().mockImplementation(() => {
        replicationTimes.alastria = Date.now();
        return Promise.resolve({ success: true });
      }),
    };

    const mockFabricAdapter = {
      getName: jest.fn(() => 'fabric'),
      publishEvent: jest.fn().mockImplementation(() => {
        replicationTimes.fabric = Date.now();
        return Promise.resolve({ success: true });
      }),
    };

    mockAdapterPool.get.mockImplementation((name: string) => {
      if (name === 'alastria') return mockAlastriaAdapter as any;
      if (name === 'fabric') return mockFabricAdapter as any;
      return undefined;
    });

    console.log('⏳ Testing replication to 2 networks after 15s...');

    await handleIncomingEvent(testEvent, 'hashnet');

    const totalTime = Date.now() - startTime;

    // Both adapters should have been called
    expect(mockAlastriaAdapter.publishEvent).toHaveBeenCalled();
    expect(mockFabricAdapter.publishEvent).toHaveBeenCalled();

    // Both replications should occur after 15 seconds
    Object.entries(replicationTimes).forEach(([network, time]) => {
      const delay = time - startTime;
      console.log(`  ${network}: ${delay}ms`);
      expect(delay).toBeGreaterThanOrEqual(PRODUCTION_DELAY_MS);
      expect(delay).toBeLessThan(PRODUCTION_DELAY_MS + 500);
    });

    console.log(`✅ Total time: ${totalTime}ms`);
    console.log(`✅ All replications occurred after 15-second delay`);
  }, 20000);

  /**
   * Test Plan ID: U6
   * Requirement: "Verify timer resets correctly when new events arrive"
   * Expected: "Each event gets independent timing"
   */
  it('should handle multiple events with independent 15-second timings', async () => {
    const event1: DomeEvent = {
      ...testEvent,
      dataLocation: 'https://example.com/product?hl=0xevent1',
    };

    const event2: DomeEvent = {
      ...testEvent,
      dataLocation: 'https://example.com/product?hl=0xevent2',
    };

    const replicationTimes: Record<string, number> = {};
    const startTimes: Record<string, number> = {};

    mockMarkEventPublished.mockResolvedValue();
    mockGetMissingNetworks.mockResolvedValue(['alastria']);

    const mockAlastriaAdapter = {
      getName: jest.fn(() => 'alastria'),
      publishEvent: jest.fn().mockImplementation((request) => {
        const globalId = request.dataLocation.split('hl=')[1];
        replicationTimes[globalId] = Date.now();
        return Promise.resolve({ success: true });
      }),
    };

    mockAdapterPool.get.mockReturnValue(mockAlastriaAdapter as any);

    console.log('⏳ Testing independent timers for 2 events (5s apart)...');

    // Event 1: starts at T=0
    startTimes['0xevent1'] = Date.now();
    const promise1 = handleIncomingEvent(event1, 'hashnet');

    // Event 2: starts at T=5s (5 seconds after event 1)
    await new Promise((resolve) => setTimeout(resolve, 5000));
    startTimes['0xevent2'] = Date.now();
    const promise2 = handleIncomingEvent(event2, 'hashnet');

    // Wait for both to complete
    await Promise.all([promise1, promise2]);

    // Calculate delays
    const delay1 = replicationTimes['0xevent1'] - startTimes['0xevent1'];
    const delay2 = replicationTimes['0xevent2'] - startTimes['0xevent2'];

    console.log(`  Event 1 delay: ${delay1}ms`);
    console.log(`  Event 2 delay: ${delay2}ms`);

    // Both events should have ~15s delay independently
    expect(delay1).toBeGreaterThanOrEqual(PRODUCTION_DELAY_MS);
    expect(delay1).toBeLessThan(PRODUCTION_DELAY_MS + 500);

    expect(delay2).toBeGreaterThanOrEqual(PRODUCTION_DELAY_MS);
    expect(delay2).toBeLessThan(PRODUCTION_DELAY_MS + 500);

    // Event 2 should complete ~5 seconds after event 1 (independent timing)
    const timeDifference = Math.abs(
      replicationTimes['0xevent2'] - replicationTimes['0xevent1']
    );
    expect(timeDifference).toBeGreaterThan(4000); // At least 4 seconds apart
    expect(timeDifference).toBeLessThan(6000); // Less than 6 seconds apart

    console.log(`✅ Events had independent timings (${timeDifference}ms apart)`);
  }, 30000); // 30 second timeout for 2 sequential 15s delays
});

/**
 * Test Execution Notes:
 *
 * 1. By default, these tests are SKIPPED (describe.skip)
 * 2. To run: npm test -- replication-delay-15s.test.ts --testTimeout=30000
 * 3. Total execution time: ~50 seconds (3 tests × 15s each + overhead)
 * 4. Use these tests for:
 *    - Pre-production validation
 *    - Manual verification before deployment
 *    - Compliance with official test plan
 *
 * 5. Regular CI/CD should use fast tests (200ms delay)
 * 6. Production validation should use these tests (15s delay)
 */
