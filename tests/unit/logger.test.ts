/**
 * Unit Tests: Logger Utility
 *
 * Tests Winston-based logger with structured logging.
 */

import {
  logger,
  logInfo,
  logWarn,
  logError,
  logDebug,
  logPublish,
  logReplicate,
  logNotify,
  logCacheOperation,
  logAdapterCall,
} from '../../src/utils/logger';

// Mock winston logger
jest.mock('winston', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  return {
    createLogger: jest.fn(() => mockLogger),
    format: {
      combine: jest.fn(),
      timestamp: jest.fn(),
      errors: jest.fn(),
      splat: jest.fn(),
      json: jest.fn(),
      colorize: jest.fn(),
      printf: jest.fn(),
    },
    transports: {
      Console: jest.fn(),
    },
  };
});

describe('logger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic logging functions', () => {
    describe('logInfo', () => {
      it('should call logger.info with message', () => {
        const message = 'Test info message';

        logInfo(message);

        expect(logger.info).toHaveBeenCalledWith(message, undefined);
      });

      it('should call logger.info with message and context', () => {
        const message = 'Test info message';
        const context = { operation: 'test', globalId: '0xabc' };

        logInfo(message, context);

        expect(logger.info).toHaveBeenCalledWith(message, context);
      });

      it('should handle empty context', () => {
        const message = 'Test message';

        logInfo(message, {});

        expect(logger.info).toHaveBeenCalledWith(message, {});
      });
    });

    describe('logWarn', () => {
      it('should call logger.warn with message', () => {
        const message = 'Test warning';

        logWarn(message);

        expect(logger.warn).toHaveBeenCalledWith(message, undefined);
      });

      it('should call logger.warn with message and context', () => {
        const message = 'Test warning';
        const context = { network: 'hashnet' };

        logWarn(message, context);

        expect(logger.warn).toHaveBeenCalledWith(message, context);
      });
    });

    describe('logDebug', () => {
      it('should call logger.debug with message', () => {
        const message = 'Test debug';

        logDebug(message);

        expect(logger.debug).toHaveBeenCalledWith(message, undefined);
      });

      it('should call logger.debug with message and context', () => {
        const message = 'Test debug';
        const context = { adapter: 'alastria' };

        logDebug(message, context);

        expect(logger.debug).toHaveBeenCalledWith(message, context);
      });
    });

    describe('logError', () => {
      it('should call logger.error with message only', () => {
        const message = 'Test error';

        logError(message);

        expect(logger.error).toHaveBeenCalledWith(message, { error: undefined });
      });

      it('should call logger.error with Error object', () => {
        const message = 'Test error';
        const error = new Error('Something went wrong');
        error.stack = 'Error stack trace';

        logError(message, error);

        expect(logger.error).toHaveBeenCalledWith(message, {
          error: {
            message: 'Something went wrong',
            stack: 'Error stack trace',
            name: 'Error',
          },
        });
      });

      it('should call logger.error with Error and context', () => {
        const message = 'Test error';
        const error = new Error('Failed');
        const context = { operation: 'test', globalId: '0xabc' };

        logError(message, error, context);

        expect(logger.error).toHaveBeenCalledWith(message, {
          ...context,
          error: {
            message: 'Failed',
            stack: error.stack,
            name: 'Error',
          },
        });
      });

      it('should handle non-Error objects', () => {
        const message = 'Test error';
        const error = { custom: 'error object' };
        const context = { network: 'hashnet' };

        logError(message, error, context);

        expect(logger.error).toHaveBeenCalledWith(message, {
          ...context,
          error,
        });
      });

      it('should handle string as error', () => {
        const message = 'Test error';
        const error = 'String error';

        logError(message, error);

        expect(logger.error).toHaveBeenCalledWith(message, { error });
      });

      it('should handle custom error types', () => {
        const message = 'Custom error';

        class CustomError extends Error {
          constructor(msg: string) {
            super(msg);
            this.name = 'CustomError';
          }
        }

        const error = new CustomError('Custom error occurred');

        logError(message, error);

        expect(logger.error).toHaveBeenCalledWith(message, {
          error: {
            message: 'Custom error occurred',
            stack: error.stack,
            name: 'CustomError',
          },
        });
      });
    });
  });

  describe('Operation-specific logging', () => {
    describe('logPublish', () => {
      it('should log publish operation with globalId and networks', () => {
        const globalId = '0xabc123';
        const networks = ['hashnet', 'alastria'];

        logPublish(globalId, networks);

        expect(logger.info).toHaveBeenCalledWith('Publishing event', {
          operation: 'publish',
          globalId,
          networks,
        });
      });

      it('should log publish with additional context', () => {
        const globalId = '0xabc123';
        const networks = ['hashnet'];
        const context = { eventType: 'ProductAdded', entityId: '0xdef456' };

        logPublish(globalId, networks, context);

        expect(logger.info).toHaveBeenCalledWith('Publishing event', {
          operation: 'publish',
          globalId,
          networks,
          ...context,
        });
      });

      it('should handle empty networks array', () => {
        const globalId = '0xabc123';
        const networks: string[] = [];

        logPublish(globalId, networks);

        expect(logger.info).toHaveBeenCalledWith('Publishing event', {
          operation: 'publish',
          globalId,
          networks: [],
        });
      });
    });

    describe('logReplicate', () => {
      it('should log replicate operation', () => {
        const globalId = '0xabc123';
        const sourceNetwork = 'hashnet';
        const targetNetworks = ['alastria'];

        logReplicate(globalId, sourceNetwork, targetNetworks);

        expect(logger.info).toHaveBeenCalledWith('Replicating event', {
          operation: 'replicate',
          globalId,
          sourceNetwork,
          targetNetworks,
        });
      });

      it('should log replicate with additional context', () => {
        const globalId = '0xabc123';
        const sourceNetwork = 'hashnet';
        const targetNetworks = ['alastria', 'fabric'];
        const context = { eventType: 'ProductUpdated' };

        logReplicate(globalId, sourceNetwork, targetNetworks, context);

        expect(logger.info).toHaveBeenCalledWith('Replicating event', {
          operation: 'replicate',
          globalId,
          sourceNetwork,
          targetNetworks,
          ...context,
        });
      });

      it('should handle multiple target networks', () => {
        const globalId = '0xabc123';
        const sourceNetwork = 'hashnet';
        const targetNetworks = ['alastria', 'fabric', 'polygon'];

        logReplicate(globalId, sourceNetwork, targetNetworks);

        expect(logger.info).toHaveBeenCalledWith('Replicating event', {
          operation: 'replicate',
          globalId,
          sourceNetwork,
          targetNetworks,
        });
      });
    });

    describe('logNotify', () => {
      it('should log notify operation', () => {
        const globalId = '0xabc123';
        const callbackUrl = 'http://desmos-server/webhook';

        logNotify(globalId, callbackUrl);

        expect(logger.info).toHaveBeenCalledWith('Notifying subscriber', {
          operation: 'notify',
          globalId,
          callbackUrl,
        });
      });

      it('should log notify with additional context', () => {
        const globalId = '0xabc123';
        const callbackUrl = 'http://desmos-server/webhook';
        const context = { eventType: 'ProductAdded', timestamp: Date.now() };

        logNotify(globalId, callbackUrl, context);

        expect(logger.info).toHaveBeenCalledWith('Notifying subscriber', {
          operation: 'notify',
          globalId,
          callbackUrl,
          ...context,
        });
      });
    });

    describe('logCacheOperation', () => {
      it('should log cache operation', () => {
        const operation = 'get';
        const key = 'publishedEvents:1';

        logCacheOperation(operation, key);

        expect(logger.debug).toHaveBeenCalledWith('Cache operation', {
          operation: 'cache:get',
          key,
          value: undefined,
        });
      });

      it('should log cache operation with value', () => {
        const operation = 'set';
        const key = 'publishedEvents:1';
        const value = '0xabc123';

        logCacheOperation(operation, key, value);

        expect(logger.debug).toHaveBeenCalledWith('Cache operation', {
          operation: 'cache:set',
          key,
          value,
        });
      });

      it('should log cache operation with additional context', () => {
        const operation = 'delete';
        const key = 'notifiedEvents';
        const value = null;
        const context = { network: 'hashnet' };

        logCacheOperation(operation, key, value, context);

        expect(logger.debug).toHaveBeenCalledWith('Cache operation', {
          operation: 'cache:delete',
          key,
          value,
          ...context,
        });
      });

      it('should handle complex value types', () => {
        const operation = 'set';
        const key = 'subscription:123';
        const value = { eventTypes: ['ProductAdded'], callbackUrl: 'http://example.com' };

        logCacheOperation(operation, key, value);

        expect(logger.debug).toHaveBeenCalledWith('Cache operation', {
          operation: 'cache:set',
          key,
          value,
        });
      });
    });

    describe('logAdapterCall', () => {
      it('should log adapter API call', () => {
        const adapter = 'hashnet';
        const endpoint = '/api/v1/publishEvent';
        const method = 'POST';

        logAdapterCall(adapter, endpoint, method);

        expect(logger.debug).toHaveBeenCalledWith('Adapter API call', {
          operation: 'adapter:call',
          adapter,
          endpoint,
          method,
        });
      });

      it('should log adapter call with additional context', () => {
        const adapter = 'alastria';
        const endpoint = '/api/v2/subscribe';
        const method = 'POST';
        const context = { eventTypes: ['ProductAdded'], retryAttempt: 1 };

        logAdapterCall(adapter, endpoint, method, context);

        expect(logger.debug).toHaveBeenCalledWith('Adapter API call', {
          operation: 'adapter:call',
          adapter,
          endpoint,
          method,
          ...context,
        });
      });

      it('should handle GET requests', () => {
        const adapter = 'hashnet';
        const endpoint = '/health';
        const method = 'GET';

        logAdapterCall(adapter, endpoint, method);

        expect(logger.debug).toHaveBeenCalledWith('Adapter API call', {
          operation: 'adapter:call',
          adapter,
          endpoint,
          method,
        });
      });
    });
  });

  describe('Context merging', () => {
    it('should properly merge context in operation-specific logs', () => {
      const globalId = '0xabc123';
      const networks = ['hashnet'];
      const customContext = {
        eventType: 'ProductAdded',
        entityId: '0xdef456',
        timestamp: 1234567890,
      };

      logPublish(globalId, networks, customContext);

      expect(logger.info).toHaveBeenCalledWith('Publishing event', {
        operation: 'publish',
        globalId,
        networks,
        eventType: 'ProductAdded',
        entityId: '0xdef456',
        timestamp: 1234567890,
      });
    });

    it('should allow custom fields in context', () => {
      const message = 'Custom log';
      const context = {
        customField1: 'value1',
        customField2: 123,
        customField3: true,
        customField4: ['array', 'of', 'values'],
      };

      logInfo(message, context);

      expect(logger.info).toHaveBeenCalledWith(message, context);
    });
  });
});
