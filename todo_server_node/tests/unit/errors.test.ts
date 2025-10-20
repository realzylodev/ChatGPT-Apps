/**
 * Unit tests for error handling classes and utilities
 * Tests custom error types, retry logic, and error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { z } from 'zod';
import {
  TodoError,
  ValidationError,
  StorageError,
  FileError,
  NotFoundError,
  ErrorCode,
  ERROR_STATUS_CODES,
  ErrorHandler,
  RetryHandler,
  ConsoleLogger,
  HealthChecker,
  logger
} from '../../src/errors.js';

describe('Error Classes', () => {
  describe('TodoError', () => {
    it('should create error with all properties', () => {
      const error = new TodoError(
        'Test error',
        ErrorCode.VALIDATION_ERROR,
        { field: 'test' },
        'req_123'
      );

      expect(error.message).toBe('Test error');
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual({ field: 'test' });
      expect(error.requestId).toBe('req_123');
      expect(error.timestamp).toBeDefined();
      expect(error.name).toBe('TodoError');
    });

    it('should create error response object', () => {
      const error = new TodoError('Test error', ErrorCode.INTERNAL_ERROR);
      const response = error.toResponse();

      expect(response.error).toBe(true);
      expect(response.message).toBe('Test error');
      expect(response.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(response.statusCode).toBe(500);
      expect(response.timestamp).toBeDefined();
    });

    it('should map error codes to correct status codes', () => {
      const validationError = new TodoError('Validation failed', ErrorCode.VALIDATION_ERROR);
      const notFoundError = new TodoError('Not found', ErrorCode.TODO_NOT_FOUND);
      const serverError = new TodoError('Server error', ErrorCode.INTERNAL_ERROR);

      expect(validationError.statusCode).toBe(400);
      expect(notFoundError.statusCode).toBe(404);
      expect(serverError.statusCode).toBe(500);
    });
  });

  describe('ValidationError', () => {
    it('should create validation error', () => {
      const error = new ValidationError('Invalid input', { field: 'title' });

      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual({ field: 'title' });
    });

    it('should create validation error from Zod error', () => {
      const zodSchema = z.object({
        title: z.string().min(1),
        priority: z.enum(['low', 'medium', 'high'])
      });

      try {
        zodSchema.parse({ title: '', priority: 'invalid' });
      } catch (zodError) {
        const validationError = ValidationError.fromZodError(zodError as z.ZodError);

        expect(validationError.name).toBe('ValidationError');
        expect(validationError.code).toBe(ErrorCode.VALIDATION_ERROR);
        expect(validationError.details?.validationErrors).toHaveLength(2);
        expect(validationError.message).toContain('title');
        expect(validationError.message).toContain('priority');
      }
    });
  });

  describe('StorageError', () => {
    it('should create storage error', () => {
      const originalError = new Error('File system error');
      const error = new StorageError('Storage failed', originalError);

      expect(error.name).toBe('StorageError');
      expect(error.code).toBe(ErrorCode.STORAGE_ERROR);
      expect(error.statusCode).toBe(500);
      expect(error.details?.originalError).toBeDefined();
      expect(error.details?.originalError.message).toBe('File system error');
    });

    it('should create storage error without original error', () => {
      const error = new StorageError('Storage failed');

      expect(error.name).toBe('StorageError');
      expect(error.details).toBeUndefined();
    });
  });

  describe('FileError', () => {
    it('should create file read error', () => {
      const originalError = new Error('ENOENT: no such file');
      (originalError as any).code = 'ENOENT';
      
      const error = new FileError(
        'File not found',
        'read',
        '/path/to/file.json',
        originalError
      );

      expect(error.name).toBe('FileError');
      expect(error.code).toBe(ErrorCode.FILE_READ_ERROR);
      expect(error.statusCode).toBe(500);
      expect(error.details?.operation).toBe('read');
      expect(error.details?.filePath).toBe('/path/to/file.json');
      expect(error.details?.originalError?.code).toBe('ENOENT');
    });

    it('should create file write error', () => {
      const error = new FileError('Write failed', 'write', '/path/to/file.json');

      expect(error.code).toBe(ErrorCode.FILE_WRITE_ERROR);
      expect(error.details?.operation).toBe('write');
    });

    it('should create backup error', () => {
      const error = new FileError('Backup failed', 'backup', '/path/to/backup.json');

      expect(error.code).toBe(ErrorCode.BACKUP_ERROR);
      expect(error.details?.operation).toBe('backup');
    });
  });

  describe('NotFoundError', () => {
    it('should create todo not found error', () => {
      const error = new NotFoundError('todo', 'todo-123');

      expect(error.name).toBe('NotFoundError');
      expect(error.code).toBe(ErrorCode.TODO_NOT_FOUND);
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('todo not found: todo-123');
      expect(error.details?.resource).toBe('todo');
      expect(error.details?.identifier).toBe('todo-123');
    });

    it('should create generic resource not found error', () => {
      const error = new NotFoundError('widget', 'widget-456');

      expect(error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
      expect(error.message).toBe('widget not found: widget-456');
    });
  });
});

describe('ConsoleLogger', () => {
  let consoleLogger: ConsoleLogger;
  let consoleSpy: any;

  beforeEach(() => {
    consoleLogger = new ConsoleLogger();
    consoleSpy = {
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      log: vi.spyOn(console, 'log').mockImplementation(() => {})
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('error', () => {
    it('should log error message', () => {
      consoleLogger.error('Test error message');

      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('ERROR: Test error message')
      );
    });

    it('should log error with context', () => {
      consoleLogger.error('Test error', undefined, { userId: '123' });

      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('{"userId":"123"}')
      );
    });

    it('should log error with Error object', () => {
      const error = new Error('Original error');
      consoleLogger.error('Test error', error, { context: 'test' });

      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('Original error')
      );
    });
  });

  describe('warn', () => {
    it('should log warning message', () => {
      consoleLogger.warn('Test warning');

      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringContaining('WARN: Test warning')
      );
    });
  });

  describe('info', () => {
    it('should log info message', () => {
      consoleLogger.info('Test info');

      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('INFO: Test info')
      );
    });
  });

  describe('debug', () => {
    it('should log debug message in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      consoleLogger.debug('Test debug');

      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('DEBUG: Test debug')
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should not log debug message in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      consoleLogger.debug('Test debug');

      expect(consoleSpy.log).not.toHaveBeenCalled();

      process.env.NODE_ENV = originalEnv;
    });
  });
});

describe('ErrorHandler', () => {
  describe('generateRequestId', () => {
    it('should generate unique request IDs', () => {
      const id1 = ErrorHandler.generateRequestId();
      const id2 = ErrorHandler.generateRequestId();

      expect(id1).toMatch(/^req_\d+_\d+$/);
      expect(id2).toMatch(/^req_\d+_\d+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('handleError', () => {
    it('should handle TodoError', () => {
      const error = new TodoError('Test error', ErrorCode.VALIDATION_ERROR);
      const response = ErrorHandler.handleError(error);

      expect(response.error).toBe(true);
      expect(response.message).toBe('Test error');
      expect(response.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(response.statusCode).toBe(400);
    });

    it('should handle Zod validation error', () => {
      const zodSchema = z.object({ title: z.string().min(1) });
      
      try {
        zodSchema.parse({ title: '' });
      } catch (zodError) {
        const response = ErrorHandler.handleError(zodError);

        expect(response.error).toBe(true);
        expect(response.code).toBe(ErrorCode.VALIDATION_ERROR);
        expect(response.statusCode).toBe(400);
        expect(response.message).toContain('Validation failed');
      }
    });

    it('should handle Node.js file system errors', () => {
      const fsError = new Error('File not found') as NodeJS.ErrnoException;
      fsError.code = 'ENOENT';
      fsError.path = '/test/file.json';

      const response = ErrorHandler.handleError(fsError);

      expect(response.error).toBe(true);
      expect(response.code).toBe(ErrorCode.FILE_READ_ERROR);
      expect(response.message).toBe('File not found');
    });

    it('should handle permission denied errors', () => {
      const fsError = new Error('Permission denied') as NodeJS.ErrnoException;
      fsError.code = 'EACCES';
      fsError.path = '/test/file.json';

      const response = ErrorHandler.handleError(fsError);

      expect(response.code).toBe(ErrorCode.FILE_READ_ERROR);
    });

    it('should handle disk space errors', () => {
      const fsError = new Error('No space left') as NodeJS.ErrnoException;
      fsError.code = 'ENOSPC';
      fsError.path = '/test/file.json';

      const response = ErrorHandler.handleError(fsError);

      expect(response.code).toBe(ErrorCode.FILE_WRITE_ERROR);
    });

    it('should handle generic Error objects', () => {
      const error = new Error('Generic error');
      const response = ErrorHandler.handleError(error);

      expect(response.error).toBe(true);
      expect(response.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(response.message).toBe('Generic error');
      expect(response.statusCode).toBe(500);
    });

    it('should handle unknown error types', () => {
      const response = ErrorHandler.handleError('String error');

      expect(response.error).toBe(true);
      expect(response.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(response.message).toBe('An unknown error occurred');
    });
  });

  describe('createToolErrorResponse', () => {
    it('should create tool error response', () => {
      const error = new ValidationError('Invalid input');
      const response = ErrorHandler.createToolErrorResponse(error, 'create-todo');

      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');
      expect(response.content[0].text).toContain('Error in create-todo');
      expect(response.isError).toBe(true);
      expect(response._meta?.error).toBeDefined();
      expect(response._meta?.toolName).toBe('create-todo');
    });
  });

  describe('createResourceErrorResponse', () => {
    it('should throw error for resource errors', () => {
      const error = new NotFoundError('resource', 'test.html');

      expect(() => {
        ErrorHandler.createResourceErrorResponse(error, 'ui://test.html');
      }).toThrow('Failed to read resource ui://test.html');
    });
  });
});

describe('RetryHandler', () => {
  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const result = await RetryHandler.withRetry(operation, 3, 100);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Attempt 1 failed'))
        .mockRejectedValueOnce(new Error('Attempt 2 failed'))
        .mockResolvedValue('success');

      const result = await RetryHandler.withRetry(operation, 3, 10);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Always fails'));

      await expect(
        RetryHandler.withRetry(operation, 2, 10)
      ).rejects.toThrow('Operation failed after 2 attempts');

      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should not retry validation errors', async () => {
      const validationError = new ValidationError('Invalid input');
      const operation = vi.fn().mockRejectedValue(validationError);

      await expect(
        RetryHandler.withRetry(operation, 3, 10)
      ).rejects.toThrow(ValidationError);

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should not retry not found errors', async () => {
      const notFoundError = new NotFoundError('todo', 'test-id');
      const operation = vi.fn().mockRejectedValue(notFoundError);

      await expect(
        RetryHandler.withRetry(operation, 3, 10)
      ).rejects.toThrow(NotFoundError);

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should use exponential backoff', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');

      const startTime = Date.now();
      await RetryHandler.withRetry(operation, 3, 50);
      const endTime = Date.now();

      // Should have waited at least 50ms + 100ms = 150ms for retries
      expect(endTime - startTime).toBeGreaterThan(100);
    });
  });
});

describe('HealthChecker', () => {
  describe('checkStorageHealth', () => {
    it('should return healthy for accessible storage', async () => {
      // Mock fs module for this test
      const mockFs = {
        access: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined),
        unlink: vi.fn().mockResolvedValue(undefined)
      };

      // Mock the dynamic import
      vi.doMock('fs/promises', () => mockFs);

      const result = await HealthChecker.checkStorageHealth('./test');

      expect(result.healthy).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return unhealthy for inaccessible storage', async () => {
      const mockFs = {
        access: vi.fn().mockRejectedValue(new Error('Permission denied'))
      };

      vi.doMock('fs/promises', () => mockFs);

      const result = await HealthChecker.checkStorageHealth('./test');

      expect(result.healthy).toBe(false);
      expect(result.error).toBe('Permission denied');
    });
  });

  describe('checkMemoryUsage', () => {
    it('should return memory usage information', async () => {
      const result = await HealthChecker.checkMemoryUsage();

      expect(result.usage).toBeDefined();
      expect(result.usage?.heapUsed).toBeGreaterThan(0);
      expect(result.usage?.heapTotal).toBeGreaterThan(0);
      expect(typeof result.healthy).toBe('boolean');
    });
  });
});