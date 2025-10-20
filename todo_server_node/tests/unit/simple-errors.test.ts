/**
 * Simplified error handling tests
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  TodoError,
  ValidationError,
  StorageError,
  FileError,
  NotFoundError,
  ErrorCode,
  ErrorHandler
} from '../../src/errors.js';

describe('Error Classes', () => {
  describe('TodoError', () => {
    it('should create error with correct properties', () => {
      const error = new TodoError('Test error', ErrorCode.VALIDATION_ERROR);
      
      expect(error.message).toBe('Test error');
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('TodoError');
    });

    it('should create error response', () => {
      const error = new TodoError('Test error', ErrorCode.INTERNAL_ERROR);
      const response = error.toResponse();
      
      expect(response.error).toBe(true);
      expect(response.message).toBe('Test error');
      expect(response.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(response.statusCode).toBe(500);
    });
  });

  describe('ValidationError', () => {
    it('should create validation error', () => {
      const error = new ValidationError('Invalid input');
      
      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error.statusCode).toBe(400);
    });

    it('should create from Zod error', () => {
      const schema = z.object({ title: z.string().min(1) });
      
      try {
        schema.parse({ title: '' });
      } catch (zodError) {
        const validationError = ValidationError.fromZodError(zodError as z.ZodError);
        
        expect(validationError.name).toBe('ValidationError');
        expect(validationError.message).toContain('title');
      }
    });
  });

  describe('StorageError', () => {
    it('should create storage error', () => {
      const error = new StorageError('Storage failed');
      
      expect(error.name).toBe('StorageError');
      expect(error.code).toBe(ErrorCode.STORAGE_ERROR);
      expect(error.statusCode).toBe(500);
    });
  });

  describe('FileError', () => {
    it('should create file error', () => {
      const error = new FileError('File not found', 'read', '/path/to/file');
      
      expect(error.name).toBe('FileError');
      expect(error.code).toBe(ErrorCode.FILE_READ_ERROR);
      expect(error.statusCode).toBe(500);
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error', () => {
      const error = new NotFoundError('todo', 'todo-123');
      
      expect(error.name).toBe('NotFoundError');
      expect(error.code).toBe(ErrorCode.TODO_NOT_FOUND);
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('todo not found: todo-123');
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
    });

    it('should handle generic Error', () => {
      const error = new Error('Generic error');
      const response = ErrorHandler.handleError(error);
      
      expect(response.error).toBe(true);
      expect(response.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(response.message).toBe('Generic error');
    });

    it('should handle unknown errors', () => {
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
    });
  });
});