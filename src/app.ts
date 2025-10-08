/**
 * DOME Interchain Event Distributor (IED)
 * Main Application Entry Point
 */

import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { envConfig } from './config/env.config';
import { adapters } from './config/adapters.config';
import { connectRedis, disconnectRedis } from './config/redis.config';
import { adapterPool } from './services/adapter.client';
import { setupInternalSubscriptions } from './services/replication.service';
import apiRoutes from './routes/api.routes';
import { requestLogger } from './middleware/logging.middleware';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { logInfo, logError } from './utils/logger';

/**
 * Create Express application
 */
function createApp(): Application {
  const app = express();

  // Security middleware
  app.use(helmet());

  // CORS middleware
  app.use(cors());

  // JSON body parser
  app.use(express.json({ limit: '10mb' }));

  // URL-encoded body parser
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging
  app.use(requestLogger);

  // API routes
  app.use('/', apiRoutes);

  // 404 handler (must be after all routes)
  app.use(notFoundHandler);

  // Global error handler (must be last)
  app.use(errorHandler);

  return app;
}

/**
 * Initialize IED application
 */
async function initialize(): Promise<void> {
  logInfo('Initializing DOME Interchain Event Distributor...');

  // 1. Connect to Redis
  logInfo('Step 1: Connecting to Redis...');
  try {
    await connectRedis();
    logInfo('✓ Redis connected');
  } catch (error) {
    logError('✗ Failed to connect to Redis', error);
    throw new Error('Redis connection failed');
  }

  // 2. Register DLT Adapter clients
  logInfo('Step 2: Registering DLT Adapter clients...');
  for (const adapter of adapters) {
    adapterPool.register(adapter);
    logInfo(`✓ Registered adapter: ${adapter.name} (${adapter.url})`);
  }

  // 3. Health check all adapters
  logInfo('Step 3: Health checking adapters...');
  const healthResults = await adapterPool.healthCheckAll();
  for (const [name, healthy] of Object.entries(healthResults)) {
    if (healthy) {
      logInfo(`✓ Adapter ${name} is healthy`);
    } else {
      logError(`✗ Adapter ${name} is unhealthy or unreachable`, new Error('Health check failed'));
    }
  }

  const healthyCount = Object.values(healthResults).filter((h) => h).length;
  if (healthyCount === 0) {
    if (envConfig.nodeEnv === 'production') {
      logError('✗ No healthy adapters found', new Error('All adapters unhealthy'));
      throw new Error('No healthy adapters available');
    } else {
      logError('⚠️  No healthy adapters found - starting in DEGRADED mode (development only)');
      logError('⚠️  Please start DLT Adapters on ports 8081 and 8082 for full functionality');
    }
  } else {
    logInfo(`✓ ${healthyCount}/${adapters.length} adapters are healthy`);
  }

  // 4. Setup internal subscriptions for replication
  if (healthyCount > 0) {
    logInfo('Step 4: Setting up internal subscriptions...');
    try {
      await setupInternalSubscriptions();
      logInfo('✓ Internal subscriptions setup complete');
    } catch (error) {
      logError('✗ Failed to setup internal subscriptions', error);
      if (envConfig.nodeEnv === 'development') {
        logError('⚠️  Skipping subscription setup in development mode');
      }
    }
  } else {
    logError('⚠️  Skipping internal subscriptions (no healthy adapters)');
  }

  logInfo('✓ Initialization complete');
}

/**
 * Start HTTP server
 */
async function start(): Promise<void> {
  try {
    // Initialize
    await initialize();

    // Create Express app
    const app = createApp();

    // Start server
    const port = envConfig.port;
    const server = app.listen(port, () => {
      logInfo('========================================');
      logInfo(`DOME IED is running on port ${port}`);
      logInfo(`Environment: ${envConfig.nodeEnv}`);
      logInfo(`Adapters: ${adapters.map((a) => a.name).join(', ')}`);
      logInfo(`Health check: http://localhost:${port}/health`);
      logInfo(`Stats: http://localhost:${port}/stats`);
      logInfo('========================================');
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logInfo(`${signal} received, shutting down gracefully...`);

      server.close(async () => {
        logInfo('HTTP server closed');

        // Disconnect Redis
        await disconnectRedis();

        logInfo('Shutdown complete');
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logError('Forced shutdown after timeout', new Error('Shutdown timeout'));
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logError('Failed to start IED', error);
    process.exit(1);
  }
}

// Start application
if (require.main === module) {
  start();
}

export { createApp, initialize, start };
