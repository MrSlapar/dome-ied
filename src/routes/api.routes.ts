/**
 * API Routes
 *
 * Express route definitions with OpenAPI/Swagger annotations.
 *
 * @swagger
 * components:
 *   schemas:
 *     PublishEventRequest:
 *       type: object
 *       required:
 *         - eventType
 *         - dataLocation
 *         - entityId
 *         - previousEntityHash
 *       properties:
 *         eventType:
 *           type: string
 *           description: Type of DOME event
 *           example: ProductAdded
 *         dataLocation:
 *           type: string
 *           description: URL with global ID in hl query parameter
 *           example: https://marketplace.dome-marketplace.org/product/laptop?hl=0xabc123def456
 *         relevantMetadata:
 *           type: array
 *           items:
 *             type: string
 *           description: Environment tags and metadata
 *           example: ["sbx", "category:electronics", "price:1299"]
 *         entityId:
 *           type: string
 *           description: Entity identifier hash
 *           example: 0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890
 *         previousEntityHash:
 *           type: string
 *           description: Previous entity hash (0x0000... for new entities)
 *           example: 0x0000000000000000000000000000000000000000000000000000000000000000
 *
 *     PublishEventResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: Event published successfully
 *         timestamp:
 *           type: number
 *           example: 1699200000000
 *         adapters:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: hashnet
 *               success:
 *                 type: boolean
 *                 example: true
 *               timestamp:
 *                 type: number
 *                 example: 1699200001234
 *               error:
 *                 type: string
 *                 example: Network timeout
 *
 *     SubscriptionRequest:
 *       type: object
 *       required:
 *         - eventTypes
 *         - notificationEndpoint
 *       properties:
 *         eventTypes:
 *           type: array
 *           items:
 *             type: string
 *           description: Event types to subscribe to (use ["*"] for all events)
 *           example: ["ProductAdded", "ProductUpdated"]
 *         notificationEndpoint:
 *           type: string
 *           description: Webhook URL for event notifications
 *           example: https://desmos.example.com/webhook/events
 *         metadata:
 *           type: array
 *           items:
 *             type: string
 *           description: Optional metadata filters
 *           example: ["sbx", "prd"]
 *
 *     SubscriptionResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: Subscription successful
 *         adapters:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: alastria
 *               success:
 *                 type: boolean
 *                 example: true
 *
 *     HealthResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           enum: [UP, DEGRADED, DOWN]
 *           example: UP
 *         timestamp:
 *           type: number
 *           example: 1699200000000
 *         redis:
 *           type: object
 *           properties:
 *             status:
 *               type: string
 *               example: UP
 *         adapters:
 *           type: object
 *           additionalProperties:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 example: UP
 *               url:
 *                 type: string
 *                 example: http://localhost:8081
 *
 *     StatsResponse:
 *       type: object
 *       properties:
 *         networks:
 *           type: object
 *           additionalProperties:
 *             type: number
 *           example:
 *             hashnet: 150
 *             alastria: 145
 *         notifiedEvents:
 *           type: number
 *           example: 120
 *         total:
 *           type: number
 *           example: 295
 *
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           example: Validation failed
 *         message:
 *           type: string
 *           example: "\"eventType\" is required"
 *         timestamp:
 *           type: number
 *           example: 1699200000000
 */

import { Router } from 'express';
import { publishEvent } from '../controllers/publish.controller';
import {
  subscribe,
  handleEventNotification,
  handleDesmosEventNotification,
} from '../controllers/subscribe.controller';
import { healthCheck, stats, adapterSubscriptions } from '../controllers/health.controller';
import { validatePublishEvent, validateSubscribe } from '../middleware/validation.middleware';
import { asyncHandler } from '../middleware/error.middleware';

const router = Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     description: Check health status of IED, Redis, and all DLT adapters
 *     tags:
 *       - Monitoring
 *     responses:
 *       200:
 *         description: Health check response
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 */
router.get('/health', asyncHandler(healthCheck));

/**
 * @swagger
 * /stats:
 *   get:
 *     summary: Cache statistics
 *     description: Get Redis cache statistics showing event distribution across networks
 *     tags:
 *       - Monitoring
 *     responses:
 *       200:
 *         description: Cache statistics
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StatsResponse'
 */
router.get('/stats', asyncHandler(stats));

/**
 * @swagger
 * /stats/subscriptions:
 *   get:
 *     summary: Active subscriptions
 *     description: Get active subscriptions from all DLT adapters (Alastria v1.5.1+ feature)
 *     tags:
 *       - Monitoring
 *     responses:
 *       200:
 *         description: List of active subscriptions per adapter
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 adapters:
 *                   type: object
 *                   additionalProperties:
 *                     type: array
 *                     items:
 *                       type: object
 */
router.get('/stats/subscriptions', asyncHandler(adapterSubscriptions));

/**
 * Public API endpoints (for Desmos)
 */

/**
 * @swagger
 * /api/v1/publishEvent:
 *   post:
 *     summary: Publish event to all networks
 *     description: |
 *       Publishes an event to all configured DLT networks (HashNET, Alastria) in parallel.
 *
 *       **Flow:**
 *       1. Extracts global ID from dataLocation (?hl= parameter)
 *       2. Publishes to all adapters simultaneously
 *       3. Updates Redis cache for successful publishes
 *       4. Returns results for each adapter
 *
 *       **Global ID:** Must be present in dataLocation URL as `?hl=<value>`
 *
 *       **Success:** At least one adapter successful (HTTP 201)
 *
 *       **Failure:** All adapters failed (HTTP 500)
 *     tags:
 *       - Public API
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PublishEventRequest'
 *     responses:
 *       201:
 *         description: Event published successfully (full or partial success)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PublishEventResponse'
 *       400:
 *         description: Validation error (missing required fields)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: All adapters failed or missing global ID
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/api/v1/publishEvent', validatePublishEvent, asyncHandler(publishEvent));

/**
 * @swagger
 * /api/v1/subscribe:
 *   post:
 *     summary: Subscribe to events across all networks
 *     description: |
 *       Subscribe to specific event types across all configured DLT networks.
 *
 *       **Flow:**
 *       1. Subscribes to ALL adapters (HashNET, Alastria)
 *       2. Each adapter will send events to notificationEndpoint
 *       3. IED deduplicates and forwards to Desmos once per unique event
 *
 *       **Wildcard:** Use `["*"]` in eventTypes to subscribe to all event types (Alastria v1.5.2+)
 *
 *       **Deduplication:** Same event from multiple networks sent only once to Desmos
 *
 *       **Webhook:** Your notificationEndpoint receives POST requests with event data
 *     tags:
 *       - Public API
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SubscriptionRequest'
 *     responses:
 *       200:
 *         description: Subscription successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SubscriptionResponse'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: All subscriptions failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/api/v1/subscribe', validateSubscribe, asyncHandler(subscribe));

/**
 * Internal webhook endpoints (for DLT Adapters)
 */

/**
 * @swagger
 * /internal/eventNotification/{network}:
 *   post:
 *     summary: Event replication webhook
 *     description: |
 *       Internal webhook called by DLT adapters when events are published.
 *       Triggers automatic replication to missing networks.
 *
 *       **Flow:**
 *       1. Adapter publishes event to blockchain
 *       2. Adapter calls this webhook with event data
 *       3. IED marks event on source network in Redis
 *       4. IED waits 15 seconds (prevent duplicates from propagation delays)
 *       5. IED checks which networks still missing the event
 *       6. IED replicates to missing networks
 *
 *       **Network Parameter:** Identifies source network (hashnet, alastria)
 *
 *       **Delay Mechanism:** 15s wait prevents duplicate events from network propagation delays
 *     tags:
 *       - Internal API
 *     parameters:
 *       - in: path
 *         name: network
 *         required: true
 *         schema:
 *           type: string
 *           enum: [hashnet, alastria]
 *         description: Source network name
 *         example: hashnet
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: number
 *               timestamp:
 *                 type: number
 *               eventType:
 *                 type: string
 *               dataLocation:
 *                 type: string
 *               relevantMetadata:
 *                 type: array
 *                 items:
 *                   type: string
 *               entityIdHash:
 *                 type: string
 *               previousEntityHash:
 *                 type: string
 *     responses:
 *       200:
 *         description: Event processed for replication
 *       500:
 *         description: Processing error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/internal/eventNotification/:network', asyncHandler(handleEventNotification));

/**
 * @swagger
 * /internal/desmosNotification:
 *   post:
 *     summary: Desmos subscription webhook
 *     description: |
 *       Internal webhook called by DLT adapters when subscribed events are published.
 *       Forwards events to Desmos with deduplication.
 *
 *       **Flow:**
 *       1. Adapter publishes subscribed event to blockchain
 *       2. Adapter calls this webhook with event data
 *       3. IED checks if event already notified (Redis: notifiedEvents set)
 *       4. If not notified, forwards to Desmos notification endpoint
 *       5. Marks event as notified in Redis
 *
 *       **Deduplication:** Same event from multiple networks sent only once
 *
 *       **Global ID:** Used for deduplication tracking
 *     tags:
 *       - Internal API
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: number
 *               timestamp:
 *                 type: number
 *               eventType:
 *                 type: string
 *               dataLocation:
 *                 type: string
 *               relevantMetadata:
 *                 type: array
 *                 items:
 *                   type: string
 *               entityIdHash:
 *                 type: string
 *               previousEntityHash:
 *                 type: string
 *     responses:
 *       200:
 *         description: Event forwarded to Desmos
 *       500:
 *         description: Notification error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/internal/desmosNotification', asyncHandler(handleDesmosEventNotification));

export default router;
