/**
 * Comprehensive error handling system for Todo MCP Server
 * Provides structured error responses, logging, and HTTP status codes
 */

import { z } from 'zod';

// Error types and codes
export enum ErrorCode {
  // Validation errors (400)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  
  // Resource errors (404)
  TODO_NOT_FOUND = 'TODO_NOT_FOUND',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  
  // Storage errors (500)
  STORAGE_ERROR = 'STORAGE_ERROR',
  FILE_READ_ERROR = 'FILE_READ_ERROR',
  FILE_WRITE_ERROR = 'FILE_WRITE_ERROR',
  BACKUP_ERROR = 'BACKUP_ERROR',
  
  // Server errors (500)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  INITIALIZATION_ERROR = 'INITIALIZATION_ERROR',
  TOOL_HANDLER_ERROR = 'TOOL_HANDLER_ERROR',
  
  // Network/Transport errors (503)
  TRANSPORT_ERROR = 'TRANSPORT_ERROR',
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  
  // Rate limiting (429)
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED'
}

// HTTP status code mapping
export const ERROR_STATUS_CODES: Record<ErrorCode, number> = {
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.INVALID_INPUT]: 400,
  [ErrorCode.MISSING_REQUIRED_FIELD]: 400,
  
  [ErrorCode.TODO_NOT_FOUND]: 404,
  [ErrorCode.RESOURCE_NOT_FOUND]: 404,
  
  [ErrorCode.STORAGE_ERROR]: 500,
  [ErrorCode.FILE_READ_ERROR]: 500,
  [ErrorCode.FILE_WRITE_ERROR]: 500,
  [ErrorCode.BACKUP_ERROR]: 500,
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.INITIALIZATION_ERROR]: 500,
  [ErrorCode.TOOL_HANDLER_ERROR]: 500,
  
  [ErrorCode.TRANSPORT_ERROR]: 503,
  [ErrorCode.CONNECTION_ERROR]: 503,
  
  [ErrorCode.RATE_LIMIT_EXCEEDED]: 429
};

// Structured error response interface
export interface ErrorResponse {
  error: true;
  message: string;
  code: ErrorCode;
  statusCode: number;
  details?: Record<string, any>;
  timestamp: string;
  requestId?: string;
}

// Custom error classes
export class TodoError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, any>;
  public readonly timestamp: string;
  public readonly requestId?: string;

  constructor(
    message: string,
    code: ErrorCode,
    details?: Record<string, any>,
    requestId?: string
  ) {
    super(message);
    this.name = 'TodoError';
    this.code = code;
    this.statusCode = ERROR_STATUS_CODES[code];
    this.details = details;
    this.timestamp = new Date().toISOString();
    this.requestId = requestId;
  }

  toResponse(): ErrorResponse {
    return {
      error: true,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp,
      requestId: this.requestId
    };
  }
}

// Validation error handling
export class ValidationError extends TodoError {
  constructor(message: string, details?: Record<string, any>, requestId?: string) {
    super(message, ErrorCode.VALIDATION_ERROR, details, requestId);
    this.name = 'ValidationError';
  }

  static fromZodError(error: z.ZodError, requestId?: string): ValidationError {
    const details = {
      validationErrors: error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
        code: err.code,
        received: 'received' in err ? err.received : undefined
      }))
    };

    const message = `Validation failed: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`;
    
    return new ValidationError(message, details, requestId);
  }
}

// Storage error handling
export class StorageError extends TodoError {
  constructor(message: string, originalError?: Error, requestId?: string) {
    const details = originalError ? {
      originalError: {
        name: originalError.name,
        message: originalError.message,
        stack: originalError.stack
      }
    } : undefined;

    super(message, ErrorCode.STORAGE_ERROR, details, requestId);
    this.name = 'StorageError';
  }
}

// File operation errors
export class FileError extends TodoError {
  constructor(
    message: string,
    operation: 'read' | 'write' | 'backup',
    filePath: string,
    originalError?: Error,
    requestId?: string
  ) {
    const code = operation === 'read' ? ErrorCode.FILE_READ_ERROR : 
                 operation === 'write' ? ErrorCode.FILE_WRITE_ERROR : 
                 ErrorCode.BACKUP_ERROR;

    const details = {
      operation,
      filePath,
      originalError: originalError ? {
        name: originalError.name,
        message: originalError.message,
        code: (originalError as NodeJS.ErrnoException).code
      } : undefined
    };

    super(message, code, details, requestId);
    this.name = 'FileError';
  }
}

// Resource not found errors
export class NotFoundError extends TodoError {
  constructor(resource: string, identifier: string, requestId?: string) {
    const code = resource === 'todo' ? ErrorCode.TODO_NOT_FOUND : ErrorCode.RESOURCE_NOT_FOUND;
    const message = `${resource} not found: ${identifier}`;
    const details = { resource, identifier };

    super(message, code, details, requestId);
    this.name = 'NotFoundError';
  }
}

// Logger interface
export interface Logger {
  error(message: string, error?: Error, context?: Record<string, any>): void;
  warn(message: string, context?: Record<string, any>): void;
  info(message: string, context?: Record<string, any>): void;
  debug(message: string, context?: Record<string, any>): void;
}

// Simple console logger implementation
export class ConsoleLogger implements Logger {
  private formatMessage(level: string, message: string, context?: Record<string, any>): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${contextStr}`;
  }

  error(message: string, error?: Error, context?: Record<string, any>): void {
    const fullContext = {
      ...context,
      ...(error && {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        }
      })
    };
    console.error(this.formatMessage('error', message, fullContext));
  }

  warn(message: string, context?: Record<string, any>): void {
    console.warn(this.formatMessage('warn', message, context));
  }

  info(message: string, context?: Record<string, any>): void {
    console.log(this.formatMessage('info', message, context));
  }

  debug(message: string, context?: Record<string, any>): void {
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG) {
      console.log(this.formatMessage('debug', message, context));
    }
  }
}

// Global logger instance
export const logger = new ConsoleLogger();

// Error handler utility functions
export class ErrorHandler {
  private static requestCounter = 0;

  static generateRequestId(): string {
    return `req_${Date.now()}_${++this.requestCounter}`;
  }

  static handleError(error: unknown, requestId?: string): ErrorResponse {
    // Log the error
    logger.error('Error occurred', error instanceof Error ? error : new Error(String(error)), { requestId });

    // Handle known error types
    if (error instanceof TodoError) {
      return error.toResponse();
    }

    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return ValidationError.fromZodError(error, requestId).toResponse();
    }

    // Handle Node.js file system errors
    if (error instanceof Error && 'code' in error) {
      const nodeError = error as NodeJS.ErrnoException;
      
      switch (nodeError.code) {
        case 'ENOENT':
          return new FileError(
            'File not found',
            'read',
            nodeError.path || 'unknown',
            nodeError,
            requestId
          ).toResponse();
        
        case 'EACCES':
          return new FileError(
            'Permission denied',
            'read',
            nodeError.path || 'unknown',
            nodeError,
            requestId
          ).toResponse();
        
        case 'ENOSPC':
          return new FileError(
            'No space left on device',
            'write',
            nodeError.path || 'unknown',
            nodeError,
            requestId
          ).toResponse();
        
        case 'EMFILE':
        case 'ENFILE':
          return new StorageError(
            'Too many open files',
            nodeError,
            requestId
          ).toResponse();
      }
    }

    // Handle generic errors
    if (error instanceof Error) {
      return new TodoError(
        error.message || 'An unexpected error occurred',
        ErrorCode.INTERNAL_ERROR,
        { originalError: error.name },
        requestId
      ).toResponse();
    }

    // Handle unknown errors
    return new TodoError(
      'An unknown error occurred',
      ErrorCode.INTERNAL_ERROR,
      { originalError: String(error) },
      requestId
    ).toResponse();
  }

  static createToolErrorResponse(error: unknown, toolName: string, requestId?: string) {
    const errorResponse = this.handleError(error, requestId);
    
    return {
      content: [
        {
          type: "text" as const,
          text: `Error in ${toolName}: ${errorResponse.message}`,
        },
      ],
      isError: true,
      _meta: {
        error: errorResponse,
        toolName,
        requestId
      }
    };
  }

  static createResourceErrorResponse(error: unknown, resourceUri: string, requestId?: string) {
    const errorResponse = this.handleError(error, requestId);
    
    throw new Error(`Failed to read resource ${resourceUri}: ${errorResponse.message}`);
  }
}

// Retry utility for transient errors
export class RetryHandler {
  static async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000,
    requestId?: string
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        logger.warn(`Operation failed, attempt ${attempt}/${maxRetries}`, {
          requestId,
          error: lastError.message,
          attempt
        });
        
        // Don't retry on validation errors or not found errors
        if (error instanceof ValidationError || error instanceof NotFoundError) {
          throw error;
        }
        
        // Don't retry on the last attempt
        if (attempt === maxRetries) {
          break;
        }
        
        // Exponential backoff
        const delay = delayMs * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw new StorageError(
      `Operation failed after ${maxRetries} attempts: ${lastError!.message}`,
      lastError!,
      requestId
    );
  }
}

// Health check utilities
export class HealthChecker {
  static async checkStorageHealth(storagePath: string): Promise<{ healthy: boolean; error?: string }> {
    try {
      const fs = await import('fs/promises');
      
      // Check if we can read the storage directory
      await fs.access(storagePath);
      
      // Check if we can write to the storage directory
      const testFile = `${storagePath}/.health_check_${Date.now()}`;
      await fs.writeFile(testFile, 'health check');
      await fs.unlink(testFile);
      
      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  static async checkMemoryUsage(): Promise<{ healthy: boolean; usage?: NodeJS.MemoryUsage; error?: string }> {
    try {
      const usage = process.memoryUsage();
      const maxHeapSize = 1024 * 1024 * 1024; // 1GB threshold
      
      return {
        healthy: usage.heapUsed < maxHeapSize,
        usage
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}