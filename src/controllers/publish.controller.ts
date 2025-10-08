/**
 * Publish Controller
 *
 * Handles event publication requests from Desmos.
 */

import { Request, Response } from 'express';
import { publishEventToAllAdapters } from '../services/publication.service';
import { PublishEventRequest } from '../models/event.model';
import { logInfo, logError } from '../utils/logger';

/**
 * POST /api/v1/publishEvent
 *
 * Publish event to all configured DLT Adapters.
 */
export async function publishEvent(req: Request, res: Response): Promise<void> {
  try {
    const request: PublishEventRequest = req.body;

    logInfo('Publishing event', {
      operation: 'publish',
      eventType: request.eventType,
      entityId: request.entityId,
    });

    // Publish to all adapters
    const result = await publishEventToAllAdapters(request);

    if (result.success) {
      // Return 201 if at least one adapter succeeded
      const successfulResults = result.results.filter((r) => r.success);
      const timestamp =
        successfulResults.length > 0 ? successfulResults[0].timestamp : Date.now();

      res.status(201).json({
        timestamp,
        adapters: result.results.map((r) => ({
          name: r.adapter,
          success: r.success,
          timestamp: r.timestamp,
          error: r.error,
        })),
      });
    } else {
      // All adapters failed
      logError('Event publication failed on all adapters', new Error('Publication failed'), {
        errors: result.errors,
      });

      res.status(500).json({
        error: 'Publication failed',
        message: 'Failed to publish event on all adapters',
        details: result.errors,
      });
    }
  } catch (error) {
    logError('Error in publishEvent controller', error);

    res.status(500).json({
      error: 'InternalServerError',
      message: 'An error occurred while publishing the event',
    });
  }
}
