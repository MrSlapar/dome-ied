# DOME IED Development Guide

## Running the IED

You now have **3 options** for running the IED:

---

## ✅ Option 1: Development Mode (No Adapters Required)

**Best for**: Initial development, testing IED endpoints without adapters

The IED will now start in **DEGRADED mode** when adapters are not available:

```bash
npm run dev
```

**What happens:**
- ✅ IED starts on port 8080
- ⚠️  Shows warnings about missing adapters
- ✅ Redis connection works
- ✅ Health and Stats endpoints work
- ❌ Event publishing/replication won't work (no adapters)

**Output:**
```
⚠️  No healthy adapters found - starting in DEGRADED mode (development only)
⚠️  Please start DLT Adapters on ports 8081 and 8082 for full functionality
✓ DOME IED is running on port 8080
```

**Available Endpoints:**
```bash
# Health check (shows adapter status)
curl http://localhost:8080/health

# Statistics
curl http://localhost:8080/stats

# Try to publish (will fail gracefully)
curl -X POST http://localhost:8080/api/v1/publishEvent \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "TestEvent",
    "dataLocation": "http://test.com?hl=0xtest123",
    "relevantMetadata": [],
    "entityId": "0x123...",
    "previousEntityHash": "0x123..."
  }'
```

---

## ⭐ Option 2: Full Local Development (With Adapters)

**Best for**: Testing complete event flows, integration testing

### Step 1: Start Redis
```bash
# Using Docker
docker run -d -p 6379:6379 redis:7-alpine

# Or if already installed locally
redis-server
```

### Step 2: Start DLT Adapters

Unfortunately, the HashNET adapter has dependency issues (`@tolar/web3-plugin-tolar@^0.9.92` not found).

**You have two options:**

#### Option 2a: Fix Adapter Dependencies (if possible)
```bash
cd ../hashnet-adapter
npm install --legacy-peer-deps
npm run dev  # Port 8081

cd ../alastria-adapter
npm install
npm run dev  # Port 8082
```

#### Option 2b: Use Mock Adapters (recommended for testing)

Create simple mock adapters that implement the basic API:

```bash
# Create mock adapter directory
mkdir ../mock-adapters
cd ../mock-adapters
```

Then create a simple Express server that responds to `/health`, `/api/v1/publishEvent`, and `/api/v1/subscribe`.

### Step 3: Start IED
```bash
cd ../dome-ied
npm run dev
```

**Output (with healthy adapters):**
```
✓ Adapter hashnet is healthy
✓ Adapter alastria is healthy
✓ 2/2 adapters are healthy
✓ Internal subscriptions setup complete
DOME IED is running on port 8080
```

---

## 🐳 Option 3: Docker Compose (Full Stack)

**Best for**: Production-like environment, E2E testing

```bash
docker-compose up -d
```

**This starts:**
- ✅ Redis (port 6379)
- ✅ IED (port 8080)
- ✅ HashNET Adapter (port 8081)
- ✅ Alastria Adapter (port 8082)

**Note**: Currently the adapters may have dependency issues in Docker as well. You may need to fix their package.json files first.

**View logs:**
```bash
docker-compose logs -f ied
```

**Stop:**
```bash
docker-compose down
```

---

## Environment Modes

### Development Mode
- **File**: `.env` with `NODE_ENV=development`
- **Behavior**: Starts even without adapters (DEGRADED mode)
- **Logging**: Console format with colors
- **Log Level**: `debug`

### Production Mode
- **File**: `.env` with `NODE_ENV=production`
- **Behavior**: **Requires at least one healthy adapter** or fails to start
- **Logging**: JSON format for log aggregation
- **Log Level**: `info`

---

## Testing Individual Components

### Test Global ID Extraction
```bash
node -e "
const { extractGlobalId } = require('./dist/utils/global-id.extractor');
console.log(extractGlobalId('http://example.com?hl=0xabc123'));
"
# Output: 0xabc123
```

### Test Redis Connection
```bash
npm run dev
# Watch logs for "✓ Redis connected"
```

### Test Health Endpoint
```bash
curl http://localhost:8080/health | jq
```

**Response (no adapters):**
```json
{
  "status": "DEGRADED",
  "timestamp": "2025-10-08T19:18:27.000Z",
  "uptime": 12.5,
  "redis": "UP",
  "adapters": [
    { "name": "hashnet", "status": "DOWN" },
    { "name": "alastria", "status": "DOWN" }
  ],
  "subscriptions": 0
}
```

### Test Stats Endpoint
```bash
curl http://localhost:8080/stats | jq
```

---

## Troubleshooting

### "No healthy adapters available" Error

**In Development:**
✅ This is now a **warning**, IED starts anyway

**In Production:**
❌ This is an **error**, IED won't start

**Fix:**
- Start adapters on ports 8081 and 8082
- OR set `NODE_ENV=development` in `.env`

### "Redis connection failed" Error

**Symptoms:**
```
✗ Failed to connect to Redis
Redis connection failed
```

**Fix:**
```bash
# Start Redis with Docker
docker run -d -p 6379:6379 redis:7-alpine

# Or install locally
brew install redis  # macOS
redis-server

# Or update .env with different Redis host
REDIS_HOST=your-redis-host
```

### Adapter Dependency Issues

**HashNET Adapter:**
```
npm error notarget No matching version found for @tolar/web3-plugin-tolar@^0.9.92
```

**Potential Fixes:**
1. **Update package.json** in hashnet-adapter to use available version
2. **Use --legacy-peer-deps**: `npm install --legacy-peer-deps`
3. **Contact HashNET team** for correct package version
4. **Use mock adapter** for development

---

## Recommended Development Workflow

### Phase 1: IED API Development (No Adapters)
```bash
# .env
NODE_ENV=development
LOG_LEVEL=debug

# Start IED
npm run dev

# Test endpoints manually
curl http://localhost:8080/health
```

### Phase 2: With Mock Adapters
1. Create simple mock adapters
2. Start mock adapters
3. Test event publishing
4. Test subscriptions

### Phase 3: With Real Adapters
1. Fix adapter dependencies
2. Configure adapters properly
3. Test full event flows
4. Test replication

### Phase 4: Docker Deployment
1. Build Docker images
2. Run with docker-compose
3. Test complete system

---

## Next Steps

1. ✅ **IED core is complete** - starts in development mode
2. ⏳ **Fix DLT Adapter dependencies** - or create mocks
3. ⏳ **Write unit tests** - test services independently
4. ⏳ **Write integration tests** - test API endpoints
5. ⏳ **Write E2E tests** - test complete flows

---

## Quick Commands

```bash
# Development
npm run dev                 # Start with auto-reload
npm run build              # Build TypeScript
npm start                  # Start production build

# Testing
npm test                   # Run all tests (when implemented)
npm run test:unit          # Unit tests
npm run test:integration   # Integration tests
npm run test:e2e           # E2E tests

# Linting
npm run lint               # Check code style
npm run lint:fix           # Fix code style issues

# Docker
docker-compose up -d       # Start all services
docker-compose logs -f ied # View IED logs
docker-compose down        # Stop all services
```

---

**Current Status**: ✅ IED ready for development testing without adapters!

You can start coding and testing the IED API without waiting for adapters to be fixed.
