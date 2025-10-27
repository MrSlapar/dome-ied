/**
 * Validation Middleware
 *
 * Request validation using Joi schemas.
 */

import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { logError } from '../utils/logger';
import { isValidBytes32Hash } from '../utils/hash.utils';

/**
 * Custom Joi validator for bytes32 hash
 */
const bytes32Validator = (value: string, helpers: Joi.CustomHelpers) => {
  if (!isValidBytes32Hash(value)) {
    return helpers.error('bytes32.invalid', {
      value,
      length: value.length,
    });
  }
  return value;
};

/**
 * Joi schema for publishEvent request
 */
export const publishEventSchema = Joi.object({
  eventType: Joi.string().required().min(1).max(255),
  dataLocation: Joi.string().required().uri().min(1),
  relevantMetadata: Joi.array().items(Joi.string()).default([]),
  entityId: Joi.string()
    .required()
    .custom(bytes32Validator, 'bytes32 hash validation')
    .messages({
      'bytes32.invalid': 'entityId must be a valid bytes32 hash (66 characters: 0x + 64 hex chars). Got "{{#value}}" ({{#length}} characters)',
    }),
  previousEntityHash: Joi.string()
    .required()
    .custom(bytes32Validator, 'bytes32 hash validation')
    .messages({
      'bytes32.invalid': 'previousEntityHash must be a valid bytes32 hash (66 characters: 0x + 64 hex chars). Got "{{#value}}" ({{#length}} characters)',
    }),
  iss: Joi.string().optional(),
  rpcAddress: Joi.string().optional().uri(),
});

/**
 * Joi schema for subscribe request
 */
export const subscribeSchema = Joi.object({
  eventTypes: Joi.array().items(Joi.string().min(1)).min(1).required(),
  notificationEndpoint: Joi.string().required().uri(),
  iss: Joi.string().optional(),
});

/**
 * Generic validation middleware factory
 *
 * @param schema - Joi schema to validate against
 * @returns Express middleware function
 */
export function validateRequest(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false, // Return all errors
      stripUnknown: true, // Remove unknown fields
    });

    if (error) {
      const errors = error.details.map((detail) => detail.message);
      logError('Request validation failed', error, {
        path: req.path,
        method: req.method,
        errors,
      });

      res.status(400).json({
        error: 'Validation failed',
        message: 'Invalid request body',
        details: errors,
      });
      return;
    }

    // Replace req.body with validated/sanitized value
    req.body = value;
    next();
  };
}

/**
 * Validate publishEvent request
 */
export const validatePublishEvent = validateRequest(publishEventSchema);

/**
 * Validate subscribe request
 */
export const validateSubscribe = validateRequest(subscribeSchema);
