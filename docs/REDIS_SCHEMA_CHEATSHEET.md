# Redis Schema Cheatsheet - DOME IED

Quick reference za vse Redis strukture in operacije v IED projektu.

---

## Redis Connection Info

```bash
Host: localhost
Port: 6379
Database: 0
Password: (none - development only)
```

```bash
# Connect to Redis CLI
redis-cli

# Select database (če ni že 0)
SELECT 0

# Exit
exit
```

---

## Redis Data Structures Overview

**Key format (per official specification):**
- `publishedEvents:<chainId>` - Events published to each blockchain
- `notifiedEvents` - Events notified to Desmos

```
┌─────────────────────────────────────────────────────────────┐
│                    Redis Database 0                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Key: "publishedEvents:2"            Type: SET              │
│  Purpose: Events on Alastria (chainId=2)                    │
│  Value: {                                                    │
│    "0xfff9999999999999999999999999999999999999999999...",   │
│    "0xaaabbbcccdddeeefffaaabbbcccdddeeefffaaabbbccc...",   │
│    "0xddd1111222233334444555566667777888899990000..."      │
│  }                                                           │
│                                                              │
│  Key: "publishedEvents:1"            Type: SET              │
│  Purpose: Events on HashNET (chainId=1)                     │
│  Value: {                                                    │
│    "0x123456...",                                            │
│    "0xabcdef..."                                             │
│  }                                                           │
│                                                              │
│  Key: "notifiedEvents"                Type: SET             │
│  Value: {                                                    │
│    "0xfff999...",                                            │
│    "0xaaa111..."                                             │
│  }                                                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Schema

### Pattern 1: Network Event Tracking (publishedEvents)

**Pattern:** `publishedEvents:<chainId>`
**Type:** SET
**Purpose:** Track which events exist on which blockchain network

```
Key Examples:
  publishedEvents:1   (HashNET, chainId=1)
  publishedEvents:2   (Alastria, chainId=2)
  publishedEvents:3   (Fabric, chainId=3)

Value: SET of globalIds (bytes32 hashes, 66 characters)
```

**Configuration:** Chain IDs are configured via environment variables:
```bash
HASHNET_CHAIN_ID=1
ALASTRIA_CHAIN_ID=2
```

**Visual:**
```
publishedEvents:2 = {  # Alastria (chainId=2)
  "0xfff9999999999999999999999999999999999999999999999999999999999999",
  "0xaaabbbcccdddeeefffaaabbbcccdddeeefffaaabbbcccdddeeefffaaabbbccc",
  "0xddd1111222233334444555566667777888899990000aaaabbbbccccddddeee1"
}

publishedEvents:1 = {  # HashNET (chainId=1)
  "0xfff9999999999999999999999999999999999999999999999999999999999999",
  "0x111222333444555666777888999000aaabbbcccdddeeefff000111222333444"
}
```

---

### Pattern 2: Desmos Notification Tracking

**Pattern:** `notifiedEvents`
**Type:** SET
**Purpose:** Track which events have already been sent to Desmos (deduplication)

```
Key: notifiedEvents

Value: SET of globalIds that have been notified to Desmos
```

**Visual:**
```
notifiedEvents = {
  "0xfff9999999999999999999999999999999999999999999999999999999999999",
  "0xaaabbbcccdddeeefffaaabbbcccdddeeefffaaabbbcccdddeeefffaaabbbccc"
}
```

---

## Redis Commands Reference

### Basic Commands

```bash
# Show all keys
KEYS *

# Show keys matching pattern
KEYS publishedEvents:*

# Check if key exists
EXISTS publishedEvents:2   # Alastria (chainId=2)

# Get key type
TYPE publishedEvents:2

# Delete key
DEL publishedEvents:2

# Delete all keys (DANGEROUS!)
FLUSHDB
```

---

### SET Commands (Used in IED)

#### Add element to SET

```bash
# Add globalId to Alastria network (chainId=2)
SADD publishedEvents:2 "0xfff9999999999999999999999999999999999999999999999999999999999999"

# Add multiple elements at once
SADD publishedEvents:2 "0xaaa111..." "0xbbb222..." "0xccc333..."

# If element already exists, nothing happens (no duplicate)
SADD publishedEvents:2 "0xfff999..."  # Returns 0 (not added, already exists)
```

#### Check if element exists

```bash
# Check if event exists on Alastria (chainId=2)
SISMEMBER publishedEvents:2 "0xfff9999999999999999999999999999999999999999999999999999999999999"

# Returns:
#   1 = exists
#   0 = does not exist
```

#### Get all elements

```bash
# Get all events for Alastria (chainId=2)
SMEMBERS publishedEvents:2

# Output:
# 1) "0xfff9999999999999999999999999999999999999999999999999999999999999"
# 2) "0xaaabbbcccdddeeefffaaabbbcccdddeeefffaaabbbcccdddeeefffaaabbbccc"
# 3) "0xddd1111222233334444555566667777888899990000aaaabbbbccccddddeee1"
```

#### Count elements

```bash
# Count how many events on Alastria (chainId=2)
SCARD publishedEvents:2

# Output: 3
```

#### Remove element

```bash
# Remove specific event from Alastria (chainId=2)
SREM publishedEvents:2 "0xfff9999999999999999999999999999999999999999999999999999999999999"

# Returns:
#   1 = removed
#   0 = not found
```

#### Set operations (advanced)

```bash
# Find events on Alastria BUT NOT on HashNET (missing events)
SDIFF publishedEvents:2 publishedEvents:1

# Find events on BOTH networks (intersection)
SINTER publishedEvents:2 publishedEvents:1

# Find events on EITHER network (union)
SUNION publishedEvents:2 publishedEvents:1
```

---

## IED Code Examples

### TypeScript Operations

```typescript
import { getRedisClient } from '../config/redis.config';
import { getChainIdByNetwork } from '../config/adapters.config';

// Key prefix per official specification
const PUBLISHED_EVENTS_PREFIX = 'publishedEvents:';

// ============================================
// GET REDIS KEY FOR NETWORK (internal helper)
// ============================================
function getPublishedEventsKey(networkName: string): string {
  const chainId = getChainIdByNetwork(networkName);
  return `${PUBLISHED_EVENTS_PREFIX}${chainId}`;
  // Example: "hashnet" (chainId=1) -> "publishedEvents:1"
}

// ============================================
// ADD EVENT TO NETWORK
// ============================================
async function markEventPublished(networkName: string, globalId: string) {
  const redis = getRedisClient();
  const key = getPublishedEventsKey(networkName);
  await redis.sAdd(key, globalId);
  // Redis Command: SADD publishedEvents:2 "0xfff999..."  (for Alastria)
}

// ============================================
// CHECK IF EVENT EXISTS ON NETWORK
// ============================================
async function isEventOnNetwork(networkName: string, globalId: string): Promise<boolean> {
  const redis = getRedisClient();
  const key = getPublishedEventsKey(networkName);
  const result = await redis.sIsMember(key, globalId);
  return result;
  // Redis Command: SISMEMBER publishedEvents:2 "0xfff999..."
}

// ============================================
// GET ALL EVENTS FOR NETWORK
// ============================================
async function getAllEventsForNetwork(networkName: string): Promise<string[]> {
  const redis = getRedisClient();
  const key = getPublishedEventsKey(networkName);
  return await redis.sMembers(key);
  // Redis Command: SMEMBERS publishedEvents:2
}

// ============================================
// FIND MISSING NETWORKS (which networks don't have this event)
// ============================================
async function getMissingNetworks(globalId: string): Promise<string[]> {
  const allNetworks = ['alastria', 'hashnet'];
  const missing: string[] = [];

  for (const network of allNetworks) {
    const exists = await isEventOnNetwork(network, globalId);
    if (!exists) {
      missing.push(network);
    }
  }

  return missing;
}

// ============================================
// MARK EVENT AS NOTIFIED TO DESMOS
// ============================================
async function markEventNotified(globalId: string) {
  const redis = getRedisClient();
  await redis.sAdd('notifiedEvents', globalId);
  // Redis Command: SADD notifiedEvents "0xfff999..."
}

// ============================================
// CHECK IF DESMOS WAS ALREADY NOTIFIED
// ============================================
async function isEventNotified(globalId: string): Promise<boolean> {
  const redis = getRedisClient();
  const result = await redis.sIsMember('notifiedEvents', globalId);
  return result;
  // Redis Command: SISMEMBER notifiedEvents "0xfff999..."
}
```

---

## Real-World Scenarios

### Scenario 1: Direct Publication

**Flow:** Desmos publishes event → IED publishes to ALL adapters

```bash
# Event published with globalId = 0xfff999...

# IED marks event on both networks
SADD publishedEvents:2 "0xfff999..."   # Returns: 1 (added)
SADD publishedEvents:1 "0xfff999..."    # Returns: 1 (added)

# Check state
SMEMBERS publishedEvents:2
# Output: 1) "0xfff999..."

SMEMBERS publishedEvents:1
# Output: 1) "0xfff999..."
```

---

### Scenario 2: Replication Flow

**Flow:** Event appears on Alastria → IED replicates to HashNET

```bash
# Event arrives from Alastria webhook: globalId = 0xaaa111...

# IED checks which networks have this event
SISMEMBER publishedEvents:2 "0xaaa111..."   # Returns: 1 (exists)
SISMEMBER publishedEvents:1 "0xaaa111..."    # Returns: 0 (missing)

# IED publishes to HashNET (missing network)
# ... blockchain publication ...

# IED marks event on HashNET
SADD publishedEvents:1 "0xaaa111..."         # Returns: 1 (added)

# Now both networks have it
SISMEMBER publishedEvents:2 "0xaaa111..."   # Returns: 1
SISMEMBER publishedEvents:1 "0xaaa111..."    # Returns: 1
```

---

### Scenario 3: Desmos Notification (Deduplication)

**Flow:** Event on 2 networks → Desmos notified only ONCE

```bash
# Event exists on both networks: globalId = 0xbbb222...
SISMEMBER publishedEvents:2 "0xbbb222..."   # Returns: 1
SISMEMBER publishedEvents:1 "0xbbb222..."    # Returns: 1

# First webhook arrives from Alastria
SISMEMBER notifiedEvents "0xbbb222..."     # Returns: 0 (not notified yet)
# → IED notifies Desmos
SADD notifiedEvents "0xbbb222..."          # Mark as notified

# Second webhook arrives from HashNET (same event)
SISMEMBER notifiedEvents "0xbbb222..."     # Returns: 1 (already notified)
# → IED skips notification (deduplication)
```

---

## Troubleshooting Commands

### Check Current State

```bash
# Show all keys in database
KEYS *

# Check specific network
SMEMBERS publishedEvents:2

# Count events per network
SCARD publishedEvents:2
SCARD publishedEvents:1

# Check notified events
SMEMBERS notifiedEvents
SCARD notifiedEvents
```

---

### Debug Specific Event

```bash
# Set test globalId
SET test_id "0xfff9999999999999999999999999999999999999999999999999999999999999"

# Check where this event exists
SISMEMBER publishedEvents:2 $test_id
SISMEMBER publishedEvents:1 $test_id
SISMEMBER notifiedEvents $test_id

# Output interpretation:
# 1 = exists on that network/notified
# 0 = does not exist/not notified
```

---

### Find Missing Events

```bash
# Find events ONLY on Alastria (not replicated to HashNET)
SDIFF publishedEvents:2 publishedEvents:1

# Find events ONLY on HashNET (not replicated to Alastria)
SDIFF publishedEvents:1 publishedEvents:2

# Find events on BOTH networks
SINTER publishedEvents:2 publishedEvents:1
```

---

### Clean Up (Development)

```bash
# Remove specific event from network
SREM publishedEvents:2 "0xfff999..."

# Clear all events for specific network
DEL publishedEvents:2

# Clear notified events
DEL notifiedEvents

# DANGER: Clear entire database
FLUSHDB
```

---

## Statistics & Monitoring

### Get Cache Statistics

```bash
# Count per network
SCARD publishedEvents:2
SCARD publishedEvents:1

# Count notified events
SCARD notifiedEvents

# Total unique events across all networks
SUNIONSTORE temp_union publishedEvents:2 publishedEvents:1
SCARD temp_union
DEL temp_union
```

### Example Output

```bash
127.0.0.1:6379> SCARD publishedEvents:2
(integer) 3

127.0.0.1:6379> SCARD publishedEvents:1
(integer) 2

127.0.0.1:6379> SCARD notifiedEvents
(integer) 1
```

**Interpretation:**
- 3 events on Alastria
- 2 events on HashNET
- 1 event notified to Desmos

---

## Visual Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                 Event Publication Flow                       │
└─────────────────────────────────────────────────────────────┘

1. DIRECT PUBLICATION
   Desmos → IED.publishEvent()
   └─→ IED publishes to Alastria
       └─→ SADD publishedEvents:2 "0xfff999..."
   └─→ IED publishes to HashNET
       └─→ SADD publishedEvents:1 "0xfff999..."

2. REPLICATION
   Alastria Adapter → IED.webhook("/internal/eventNotification/alastria")
   └─→ IED checks: SISMEMBER publishedEvents:1 "0xaaa111..."
       └─→ Returns 0 (missing)
           └─→ IED publishes to HashNET
               └─→ SADD publishedEvents:1 "0xaaa111..."

3. DESMOS NOTIFICATION
   Adapter → IED.webhook("/internal/desmosNotification")
   └─→ IED checks: SISMEMBER notifiedEvents "0xbbb222..."
       └─→ Returns 0 (not notified)
           └─→ IED notifies Desmos
               └─→ SADD notifiedEvents "0xbbb222..."
       └─→ Returns 1 (already notified)
           └─→ IED skips (deduplication)
```

---

## Performance Notes

### Why Redis?

| Operation | Disk DB (MySQL) | Redis (RAM) |
|-----------|-----------------|-------------|
| SADD | ~10-50ms | ~0.1-0.5ms |
| SISMEMBER | ~10-50ms | ~0.1-0.5ms |
| SMEMBERS | ~50-200ms | ~1-10ms |

**Redis is 100-1000x faster!**

### Memory Usage

```
Event globalId size: 66 bytes (66 characters)
SET overhead per element: ~10 bytes

1,000 events ≈ 76 KB
10,000 events ≈ 760 KB
100,000 events ≈ 7.6 MB
1,000,000 events ≈ 76 MB
```

**Conclusion:** Redis can handle millions of events easily!

---

## Production Considerations

### Persistence (Don't lose data!)

```bash
# In redis.conf or docker-compose.yml
save 900 1       # Save if 1 change in 15 minutes
save 300 10      # Save if 10 changes in 5 minutes
save 60 10000    # Save if 10,000 changes in 1 minute
```

### Security (Production MUST-HAVE)

```bash
# Require password
requirepass "your-strong-password-here"

# Bind to specific IP (not 0.0.0.0)
bind 127.0.0.1

# Enable TLS
tls-port 6380
tls-cert-file /path/to/cert.pem
tls-key-file /path/to/key.pem
```

### Monitoring

```bash
# Get Redis info
INFO

# Monitor commands in real-time
MONITOR

# Check memory usage
INFO memory

# Check connected clients
CLIENT LIST
```

---

## Quick Test Script

```bash
#!/bin/bash
# test_redis.sh - Quick Redis test for IED

echo "=== Testing Redis Cache for IED ==="

# Test globalId
TEST_ID="0xfff9999999999999999999999999999999999999999999999999999999999999"

echo ""
echo "1. Adding event to Alastria..."
redis-cli SADD publishedEvents:2 "$TEST_ID"

echo ""
echo "2. Checking if event exists on Alastria..."
redis-cli SISMEMBER publishedEvents:2 "$TEST_ID"

echo ""
echo "3. Checking if event exists on HashNET..."
redis-cli SISMEMBER publishedEvents:1 "$TEST_ID"

echo ""
echo "4. Current Alastria events:"
redis-cli SMEMBERS publishedEvents:2

echo ""
echo "5. Event count per network:"
echo -n "Alastria: "
redis-cli SCARD publishedEvents:2
echo -n "HashNET: "
redis-cli SCARD publishedEvents:1

echo ""
echo "=== Test Complete ==="
```

**Run:**
```bash
chmod +x test_redis.sh
./test_redis.sh
```

---

## Common Issues & Solutions

### Issue: "Connection refused"

```bash
# Check if Redis is running
redis-cli ping

# If fails, start Redis:
# macOS:
brew services start redis

# Linux:
sudo systemctl start redis

# Docker:
docker-compose up -d redis
```

### Issue: "WRONGTYPE Operation against a key holding the wrong kind of value"

**Cause:** Trying to use SET operation on a key that's not a SET

**Solution:**
```bash
# Check key type
TYPE publishedEvents:2

# If wrong type, delete and recreate
DEL publishedEvents:2
SADD publishedEvents:2 "0xfff999..."
```

### Issue: Keys not persisting after restart

**Cause:** Redis persistence not configured

**Solution:**
```bash
# Check save configuration
CONFIG GET save

# Set persistence
CONFIG SET save "900 1 300 10 60 10000"

# Or edit redis.conf
```

---

## Summary

### Key Patterns
```
publishedEvents:<chainId>  →  SET of globalIds (event tracking)
notifiedEvents             →  SET of globalIds (notification deduplication)

Chain ID mapping (configured via environment):
  hashnet  → chainId=1  → publishedEvents:1
  alastria → chainId=2  → publishedEvents:2
```

### Main Operations
```bash
SADD     - Add event
SISMEMBER - Check if event exists
SMEMBERS  - Get all events
SCARD     - Count events
SDIFF     - Find missing events
```

### Performance
```
Average operation time: <1ms
Memory per 1M events: ~76 MB
Speed vs disk DB: 100-1000x faster
```

---

**Quick Reference URLs:**
- Redis Commands: https://redis.io/commands
- Redis Data Types: https://redis.io/docs/data-types/
- Redis Best Practices: https://redis.io/docs/manual/patterns/

**Project Files:**
- Code: `dome-ied/src/services/cache.service.ts`
- Config: `dome-ied/src/config/redis.config.ts`
- Docs: `dome-ied/docs/REDIS_SCHEMA_CHEATSHEET.md`

---

**Last Updated:** 2025-12-15
**Version:** 2.0 (Redis key format updated to publishedEvents:<chainId>)
**Project:** DOME Interchain Event Distributor
