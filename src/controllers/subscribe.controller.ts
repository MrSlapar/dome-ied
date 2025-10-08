/**
 * Subscribe Controller
 *
 * Handles subscription requests from Desmos and internal webhook handlers.
 */

import { Request, Response } from 'express';
import { subscribeDesmosToEvents, handleDesmosNotification } from '../services/subscription.service';
import { handleIncomingEvent } from '../services/replication.service';
import { SubscriptionRequest } from '../models/subscription.model';
import { DomeEvent } from '../models/event.model';
import { logInfo, logError, logWarn } from '../utils/logger';

/**
 * POST /api/v1/subscribe
 *
 * Subscribe to specific event types across all adapters.
 */
export async function subscribe(req: Request, res: Response): Promise<void> {
  try {
    const request: SubscriptionRequest = req.body;

    logInfo('Creating subscription', {
      operation: 'subscribe',
      eventTypes: request.eventTypes,
      callbackUrl: request.notificationEndpoint,
    });

    const result = await subscribeDesmosToEvents(request);

    if (result.success) {
      res.status(201).json({
        subscriptionId: result.subscriptionId,
        message: 'Subscription created successfully',
        adapters: result.results.map((r) => ({
          name: r.adapter,
          success: r.success,
          error: r.error,
        })),
      });
    } else {
      logError('Subscription failed on all adapters', new Error('Subscription failed'), {
        errors: result.errors,
      });

      res.status(500).json({
        error: 'Subscription failed',
        message: 'Failed to subscribe on all adapters',
        details: result.errors,
      });
    }
  } catch (error) {
    logError('Error in subscribe controller', error);

    res.status(500).json({
      error: 'InternalServerError',
      message: 'An error occurred while creating subscription',
    });
  }
}

/**
 * POST /internal/eventNotification/:network
 *
 * Internal webhook for receiving events from adapters (replication flow).
 * Called by DLT Adapters when events are published.
 */
export async function handleEventNotification(req: Request, res: Response): Promise<void> {
  try {
    const network = req.params.network;
    const event: DomeEvent = req.body;

    if (!network) {
      logWarn('Event notification without network parameter');
      res.status(400).json({
        error: 'Bad Request',
        message: 'Network parameter is required',
      });
      return;
    }

    logInfo('Received event notification', {
      operation: 'replication:webhook',
      network,
      eventType: event.eventType,
      eventId: event.id,
    });

    // Handle replication (async, don't wait)
    handleIncomingEvent(event, network).catch((error) => {
      logError('Error handling incoming event', error, { network });
    });

    // Respond immediately
    res.status(200).send('OK');
  } catch (error) {
    logError('Error in handleEventNotification', error);
    res.status(500).json({
      error: 'InternalServerError',
      message: 'An error occurred while processing event notification',
    });
  }
}

/**
 * POST /internal/desmosNotification
 *
 * Internal webhook for receiving events to notify Desmos (subscription flow).
 * Called by DLT Adapters when subscribed events are published.
 */
export async function handleDesmosEventNotification(req: Request, res: Response): Promise<void> {
  try {
    const event: DomeEvent = req.body;

    logInfo('Received Desmos event notification', {
      operation: 'desmos:webhook',
      eventType: event.eventType,
      eventId: event.id,
    });

    // Handle Desmos notification (async, don't wait)
    handleDesmosNotification(event).catch((error) => {
      logError('Error handling Desmos notification', error);
    });

    // Respond immediately
    res.status(200).send('OK');
  } catch (error) {
    logError('Error in handleDesmosEventNotification', error);
    res.status(500).json({
      error: 'InternalServerError',
      message: 'An error occurred while processing Desmos notification',
    });
  }
}
