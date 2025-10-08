/**
 * API Routes
 *
 * Express route definitions.
 */

import { Router } from 'express';
import { publishEvent } from '../controllers/publish.controller';
import {
  subscribe,
  handleEventNotification,
  handleDesmosEventNotification,
} from '../controllers/subscribe.controller';
import { healthCheck, stats } from '../controllers/health.controller';
import { validatePublishEvent, validateSubscribe } from '../middleware/validation.middleware';
import { asyncHandler } from '../middleware/error.middleware';

const router = Router();

/**
 * Health check endpoint
 */
router.get('/health', asyncHandler(healthCheck));

/**
 * Statistics endpoint
 */
router.get('/stats', asyncHandler(stats));

/**
 * Public API endpoints (for Desmos)
 */

// POST /api/v1/publishEvent
router.post('/api/v1/publishEvent', validatePublishEvent, asyncHandler(publishEvent));

// POST /api/v1/subscribe
router.post('/api/v1/subscribe', validateSubscribe, asyncHandler(subscribe));

/**
 * Internal webhook endpoints (for DLT Adapters)
 */

// POST /internal/eventNotification/:network
// Called by adapters when events are published (replication flow)
router.post('/internal/eventNotification/:network', asyncHandler(handleEventNotification));

// POST /internal/desmosNotification
// Called by adapters when subscribed events are published (Desmos subscription flow)
router.post('/internal/desmosNotification', asyncHandler(handleDesmosEventNotification));

export default router;
