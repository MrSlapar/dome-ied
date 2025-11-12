/**
 * OpenAPI / Swagger Configuration
 *
 * Generates OpenAPI 3.0 specification from JSDoc annotations in route files.
 * Serves interactive Swagger UI at /api-docs endpoint.
 */

import swaggerJsdoc from 'swagger-jsdoc';
import { envConfig } from './env.config';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DOME Interchain Event Distributor (IED) API',
      version: '1.0.0',
      description: `
Middleware component for replicating blockchain events across multiple DLT networks.

The IED orchestrates event distribution between the Desmos component and multiple blockchain adapters (HashNET, Alastria), ensuring events published on one network are automatically replicated to all others.

### Global ID System

Each event has a unique identifier extracted from the dataLocation URL parameter ?hl=<value>. This global ID is used for:
- Event tracking across networks
- Deduplication
- Cache management

### Replication Delay

The IED implements a 15-second delay before replicating events to prevent duplicates from network propagation delays.
      `.trim(),
      contact: {
        name: 'DOME Project',
      },
      license: {
        name: 'ISC',
      },
    },
    servers: [
      {
        url: `http://localhost:${envConfig.port}`,
        description: 'Development server',
      },
      {
        url: envConfig.ied.baseUrl,
        description: 'IED Base URL (configurable)',
      },
    ],
    tags: [
      {
        name: 'Public API',
        description: 'Endpoints for Desmos component integration',
      },
      {
        name: 'Internal API',
        description: 'Webhook endpoints for DLT adapter callbacks (replication)',
      },
      {
        name: 'Monitoring',
        description: 'Health checks and operational statistics',
      },
    ],
  },
  // Scan routes and controllers for JSDoc annotations
  apis: [
    './src/routes/*.ts',
    './src/controllers/*.ts',
    './src/models/*.ts',
  ],
};

/**
 * Generated OpenAPI specification
 */
export const swaggerSpec = swaggerJsdoc(options);
