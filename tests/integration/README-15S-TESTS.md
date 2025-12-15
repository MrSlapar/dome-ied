# 15-Second Delay Tests - Production Timing Validation

## Overview

This directory contains tests that validate the **production 15-second replication delay** as specified in the official IED Test Plan.

**File:** `replication-delay-15s.test.ts`

---

## Why Two Sets of Delay Tests?

### Fast Tests (200ms) - Default CI/CD
- **Location:** Other test files (e.g., `notification.endpoint.test.ts`)
- **Delay:** 200ms (configurable via `REPLICATION_DELAY_MS`)
- **Purpose:** Fast feedback during development
- **Execution Time:** ~2-3 seconds
- **Run By:** `npm test` (default)

### Slow Tests (15s) - Production Validation
- **Location:** `replication-delay-15s.test.ts`
- **Delay:** 15000ms (15 seconds - production value)
- **Purpose:** Validate actual production timing requirements
- **Execution Time:** ~50 seconds (3 tests)
- **Run By:** `npm run test:15s` (manual)

---

## Test Plan Compliance

These tests address the following requirements from the official test plan:

| Test ID | Description | Status |
|---------|-------------|--------|
| **U5** | Verify that replication delay is respected (15 s) | PASS |
| **U6** | Verify timer resets correctly when new events arrive | PASS |
| **I6** | IED republishes to other networks after 15 s delay | PASS |

**Test Plan Quote:**
> "Confirm that the 15 s delay before replication effectively prevents premature propagation."

---

## Running the Tests

### Method 1: Using npm script (Recommended)

```bash
# Run 15-second delay tests only
npm run test:15s

# Run with verbose output
npm run test:production-timing
```

### Method 2: Direct Jest command

```bash
# Basic execution
jest replication-delay-15s.test.ts --testTimeout=30000

# With verbose output
jest replication-delay-15s.test.ts --testTimeout=30000 --verbose

# Run specific test
jest replication-delay-15s.test.ts -t "should NOT replicate before 15 seconds"
```

### Method 3: Enable in normal test run

Edit `replication-delay-15s.test.ts` and change:
```typescript
describe.skip('Replication Service - 15 Second Delay', () => {
```
to:
```typescript
describe('Replication Service - 15 Second Delay', () => {
```

Then run:
```bash
npm test
```

**Warning:** This will make ALL test runs take 50+ seconds longer!

---

## Test Cases

### Test 1: No Premature Replication (U5)
**Validates:** Events are NOT replicated before 15 seconds elapse

**Flow:**
1. Event received from network A
2. Mark event on network A in Redis
3. **Wait 15 seconds** (configurable delay)
4. Check missing networks
5. Replicate to missing network B
6. **Assertion:** Replication occurred ≥15000ms after event received

**Expected Result:**
```
PASS: Replication respected 15-second delay (15023ms)
```

---

### Test 2: Multiple Networks After 15s (I6)
**Validates:** ALL missing networks receive replication after 15 seconds

**Flow:**
1. Event received from network A
2. Two networks missing: B and C
3. **Wait 15 seconds**
4. Replicate to BOTH B and C simultaneously
5. **Assertion:** Both replications occurred ≥15000ms after event

**Expected Result:**
```
alastria: 15012ms
fabric: 15034ms
PASS: All replications occurred after 15-second delay
```

---

### Test 3: Independent Timers (U6)
**Validates:** Each event has independent 15-second timer

**Flow:**
1. Event 1 arrives at T=0
2. Event 2 arrives at T=5s (5 seconds later)
3. Event 1 replicates at T=15s
4. Event 2 replicates at T=20s (15s after its arrival)
5. **Assertion:** 5-second difference maintained

**Expected Result:**
```
Event 1 delay: 15018ms
Event 2 delay: 15042ms
PASS: Events had independent timings (5024ms apart)
```

---

## Why Tests Are Skipped By Default

The tests use `describe.skip()` for the following reasons:

1. **CI/CD Performance:**
   - 50+ seconds execution time
   - Slows down development feedback loop
   - Not necessary for every commit

2. **Regular Tests Are Sufficient:**
   - Fast tests (200ms) validate the LOGIC
   - Slow tests (15s) validate the TIMING
   - Logic doesn't change, timing is config

3. **Manual Validation:**
   - Run before production deployment
   - Run during pre-release testing
   - Run when delay configuration changes

---

## When To Run These Tests

### Run These Tests When:
- Preparing for production deployment
- Validating release candidates
- Testing delay configuration changes
- Compliance verification with test plan
- Pre-production acceptance testing

### Don't Run These Tests When:
- During normal development
- In automated CI/CD pipelines
- For every commit
- When only changing unrelated code

---

## Configuration

### Production Delay Value
```typescript
const PRODUCTION_DELAY_MS = 15000; // 15 seconds
```

This value is set in the test file and overrides the environment configuration for the duration of the test.

### Environment Variable
```bash
# In .env file or environment
REPLICATION_DELAY_MS=15000
```

### Test Timeouts
```typescript
// Per-test timeout (20 seconds for single 15s delay)
it('should NOT replicate...', async () => {
  // test code
}, 20000);

// Global timeout for multi-event tests
jest.setTimeout(30000);
```

---

## Interpreting Results

### Successful Test Output
```
Starting handleIncomingEvent - waiting for 15s delay...
Total execution time: 15123ms
Replication occurred at: 15018ms
Test PASSED: Replication respected 15-second delay (15018ms)
```

### What To Look For:
- Replication time >= 15000ms (PASS)
- Replication time < 15500ms (PASS - allows 500ms processing overhead)
- No replication before 15000ms (PASS)

### Failed Test Indicators:
- Replication time < 15000ms (FAIL - premature replication)
- Replication time > 16000ms (WARNING - unexpected delay)
- Test timeout (FAIL - > 20 seconds)

---

## Technical Details

### Mock Setup
```typescript
// Real 15-second delay
(envConfig.replication as any).delayMs = PRODUCTION_DELAY_MS;

// Mock cache service (Redis operations)
mockMarkEventPublished.mockResolvedValue();
mockGetMissingNetworks.mockResolvedValue(['alastria']);

// Mock adapter pool
mockAdapterPool.get.mockReturnValue(mockAlastriaAdapter as any);
```

### Timing Measurement
```typescript
const startTime = Date.now();
await handleIncomingEvent(testEvent, 'hashnet');
const replicationDelay = Date.now() - startTime;

// Verify delay
expect(replicationDelay).toBeGreaterThanOrEqual(15000);
```

---

## Troubleshooting

### Test Timeout
**Error:** `Exceeded timeout of 20000 ms for a test`

**Solution:** Increase timeout:
```bash
jest replication-delay-15s.test.ts --testTimeout=60000
```

### Test Takes Too Long
**Issue:** Tests taking > 20 seconds

**Check:**
1. Are multiple events being tested? (each adds 15s)
2. Is network/system slow?
3. Are there nested delays?

### Replication Happens Too Early
**Issue:** `expected 14500 to be >= 15000`

**Possible Causes:**
1. Wrong delay configuration
2. Environment variable override
3. Code bug in delay mechanism

**Debug:**
```typescript
console.log('Configured delay:', envConfig.replication.delayMs);
console.log('Actual delay:', replicationDelay);
```

### Tests Pass But Production Fails
**Issue:** Tests pass but production has issues

**Check:**
1. Is `REPLICATION_DELAY_MS` set correctly in production?
2. Are real adapters slower than mocks?
3. Is network latency affecting timing?

---

## Maintenance

### Updating Delay Value
If production delay changes from 15s:

1. Update constant in test file:
```typescript
const PRODUCTION_DELAY_MS = 20000; // Changed to 20 seconds
```

2. Update test timeout:
```typescript
}, 25000); // 20s delay + 5s buffer
```

3. Update npm script timeout:
```json
"test:15s": "jest replication-delay-15s.test.ts --testTimeout=35000"
```

### Adding New Tests
Follow the pattern:
```typescript
it('should test new timing requirement', async () => {
  const startTime = Date.now();
  // ... test code ...
  const elapsed = Date.now() - startTime;
  expect(elapsed).toBeGreaterThanOrEqual(PRODUCTION_DELAY_MS);
}, 20000);
```

---

## Related Documentation

- **Test Plan:** `docs/DOME D(x.y) - Interchain Event Distributor – Unit and Integration Test Plan-1.pdf`
- **Compliance Analysis:** `docs/TEST_PLAN_COMPLIANCE_ANALYSIS.md`
- **Testing Guide:** `docs/TESTING_GUIDE.md`
- **CLAUDE.md:** Section on testing strategy

---

## Summary

**Purpose:** Validate production 15-second delay requirement

**Usage:** Manual execution before production deployment

**Status:** Fully compliant with test plan requirements U5, U6, I6

**Next Steps:** Run these tests as part of pre-production validation checklist
