# DOME Interchain Event Distributor (IED)

Middleware component for replicating blockchain events between different DLT networks (HashNET, Alastria, etc.).

## Overview

The IED acts as an orchestrator between DLT Adapters and the Desmos component, ensuring that:
- Events published to one network are replicated to all other configured networks
- Subscribers receive events only once, regardless of how many networks they're published on
- Network-specific parameters are handled transparently

## Architecture

```
┌──────────────────────────────────────────────────┐
│              Desmos Component                    │
└────────────────────┬─────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────┐
│     IED (Interchain Event Distributor)          │
│  ┌────────────────────────────────────────────┐ │
│  │ REST API (Express + TypeScript)            │ │
│  │ - Publish endpoint                         │ │
│  │ - Subscribe endpoint                       │ │
│  └────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────┐ │
│  │ Event Replication Logic                    │ │
│  │ - Track published events (Redis)           │ │
│  │ - Detect missing networks                  │ │
│  │ - Propagate to missing networks            │ │
│  └────────────────────────────────────────────┘ │
└────────┬──────────────────────┬──────────────────┘
         │                      │
         ▼                      ▼
┌─────────────────┐    ┌─────────────────┐
│  DLT Adapter    │    │  DLT Adapter    │
│   HashNET       │    │   Alastria      │
│   Port: 8081    │    │   Port: 8082    │
└────────┬────────┘    └────────┬────────┘
         │                      │
         ▼                      ▼
    [HashNET]              [Alastria]
    Blockchain             Blockchain
```

## Features

- **Direct Publication**: Publish events to all configured networks in parallel
- **Automatic Replication**: Detect and replicate events to missing networks
- **Deduplication**: Ensure subscribers receive each event only once
- **Network Transparency**: Handle network-specific parameters internally
- **Redis Caching**: Fast event tracking and deduplication using Redis SET structures

## Prerequisites

- Node.js >= 14.20.0
- Redis 7.x (with SET data structure support)
- Running DLT Adapter instances (HashNET, Alastria, etc.)

## Installation

```bash
# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Edit .env with your configuration
nano .env
```

## Configuration

Edit `.env` file:

```bash
# IED Server
PORT=8080

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# DLT Adapters
HASHNET_ADAPTER_URL=http://localhost:8081
ALASTRIA_ADAPTER_URL=http://localhost:8082
```

## Development

```bash
# Run in development mode (with auto-reload)
npm run dev

# Build TypeScript
npm run build

# Run production build
npm start
```

## Testing

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests
npm run test:integration

# Run E2E tests
npm run test:e2e

# Generate coverage report
npm run test:coverage
```

## API Endpoints

### POST /api/v1/publishEvent

Publish an event to all configured DLT networks.

**Request:**
```json
{
  "eventType": "ProductAdded",
  "dataLocation": "http://example.com/entity/123?hl=0xabc...",
  "relevantMetadata": ["metadata1"],
  "entityId": "0x...",
  "previousEntityHash": "0x..."
}
```

**Response:** `201 Created`

### POST /api/v1/subscribe

Subscribe to specific event types across all networks.

**Request:**
```json
{
  "eventTypes": ["ProductAdded", "ProductUpdated"],
  "notificationEndpoint": "http://desmos:8080/notifications"
}
```

**Response:** `201 Created`

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "UP",
  "redis": "UP",
  "adapters": {
    "hashnet": "UP",
    "alastria": "UP"
  }
}
```

## Docker Deployment

```bash
# Build and run with Docker Compose
cd docker
docker-compose up -d
```

The `docker-compose.yml` includes:
- IED service
- Redis cache
- HashNET DLT Adapter
- Alastria DLT Adapter

## Project Structure

```
dome-ied/
├── src/
│   ├── config/          # Configuration loading
│   ├── models/          # TypeScript interfaces
│   ├── utils/           # Utilities (global ID, logger, etc.)
│   ├── services/        # Business logic
│   ├── controllers/     # API controllers
│   ├── middleware/      # Express middleware
│   ├── routes/          # API routes
│   └── app.ts           # Application entry point
├── tests/               # Test suites
├── docker/              # Docker configuration
└── package.json
```

## Key Concepts

### Global ID
Each event has a unique identifier extracted from the `dataLocation` URL parameter `?hl=<value>`.

### Network Parameter
DLT Adapters don't add network parameters. The IED tracks network association internally based on which adapter the event came from.

### Deduplication
Redis SET structures track:
- `network:<name>` - Events published to each network
- `notifiedEvents` - Events already sent to subscribers

## License

Apache License 2.0

## Authors

DOME Project Team

## Documentation

See `/docs` for detailed documentation:
- [Investigation Report](../DLT_ADAPTER_INVESTIGATION_REPORT.md)
- [Architecture Decision Records](./docs/adr/)
- [API Documentation](./docs/api.md)
