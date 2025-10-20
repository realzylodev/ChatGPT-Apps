/**
 * Network Error Handling Hook
 * Provides retry logic, network status monitoring, and error recovery
 */

import { useState, useCallback, useEffect, useRef } from 'react';

export interface NetworkError {
  message: string;
  code?: string;
  statusCode?: number;
  retryable: boolean;
  timestamp: number;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffFactor: 2
};

export function useNetworkError() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [networkError, setNetworkError] = useState<NetworkError | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const retryTimeoutRef = useRef<number | undefined>();

  // Monitor network status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (networkError) {
        setNetworkError(null);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setNetworkError({
        message: 'No internet connection. Please check your network and try again.',
        code: 'NETWORK_OFFLINE',
        retryable: true,
        timestamp: Date.now()
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (retryTimeoutRef.current) {
        window.clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [networkError]);

  const classifyError = useCallback((error: any): NetworkError => {
    const timestamp = Date.now();

    // Network/Connection errors
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return {
        message: 'No internet connection. Please check your network and try again.',
        code: 'NETWORK_OFFLINE',
        retryable: true,
        timestamp
      };
    }

    // Fetch/HTTP errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return {
        message: 'Unable to connect to the server. Please try again.',
        code: 'NETWORK_ERROR',
        retryable: true,
        timestamp
      };
    }

    // HTTP status errors
    if (error.status || error.statusCode) {
      const statusCode = error.status || error.statusCode;
      
      if (statusCode >= 500) {
        return {
          message: 'Server error. Please try again in a moment.',
          code: 'SERVER_ERROR',
          statusCode,
          retryable: true,
          timestamp
        };
      }
      
      if (statusCode === 429) {
        return {
          message: 'Too many requests. Please wait a moment before trying again.',
          code: 'RATE_LIMITED',
          statusCode,
          retryable: true,
          timestamp
        };
      }
      
      if (statusCode >= 400 && statusCode < 500) {
        return {
          message: error.message || 'Invalid request. Please check your input and try again.',
          code: 'CLIENT_ERROR',
          statusCode,
          retryable: false,
          timestamp
        };
      }
    }

    // Timeout errors
    if (error.name === 'AbortError' || error.message?.includes('timeout')) {
      return {
        message: 'Request timed out. Please try again.',
        code: 'TIMEOUT',
        retryable: true,
        timestamp
      };
    }

    // Generic errors
    return {
      message: error.message || 'An unexpected error occurred. Please try again.',
      code: 'UNKNOWN_ERROR',
      retryable: true,
      timestamp
    };
  }, []);

  const withRetry = useCallback(async <T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {}
  ): Promise<T> => {
    const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
    let lastError: any;
    
    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          setIsRetrying(true);
        }
        
        const result = await operation();
        
        // Success - clear any previous errors
        setNetworkError(null);
        setIsRetrying(false);
        
        return result;
      } catch (error) {
        lastError = error;
        const networkError = classifyError(error);
        
        // Don't retry non-retryable errors
        if (!networkError.retryable || attempt === retryConfig.maxRetries) {
          setNetworkError(networkError);
          setIsRetrying(false);
          throw error;
        }
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
          retryConfig.baseDelay * Math.pow(retryConfig.backoffFactor, attempt),
          retryConfig.maxDelay
        );
        
        // Add jitter to prevent thundering herd
        const jitteredDelay = delay + Math.random() * 1000;
        
        console.warn(`Network operation failed (attempt ${attempt + 1}/${retryConfig.maxRetries + 1}), retrying in ${Math.round(jitteredDelay)}ms:`, error);
        
        // Wait before retrying
        await new Promise(resolve => {
          retryTimeoutRef.current = window.setTimeout(resolve, jitteredDelay);
        });
      }
    }
    
    // This should never be reached, but just in case
    throw lastError;
  }, [classifyError]);

  const clearError = useCallback(() => {
    setNetworkError(null);
    setIsRetrying(false);
  }, []);

  const retryLastOperation = useCallback((operation: () => Promise<any>) => {
    if (networkError?.retryable) {
      clearError();
      return withRetry(operation);
    }
  }, [networkError, clearError, withRetry]);

  return {
    isOnline,
    networkError,
    isRetrying,
    withRetry,
    clearError,
    retryLastOperation,
    classifyError
  };
}

// Utility hook for handling specific network operations
export function useNetworkOperation<T = any>() {
  const { withRetry, networkError, isRetrying, clearError } = useNetworkError();
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<NetworkError | null>(null);

  const execute = useCallback(async (
    operation: () => Promise<T>,
    config?: Partial<RetryConfig>
  ) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await withRetry(operation, config);
      setData(result);
      return result;
    } catch (err) {
      const networkErr = networkError || {
        message: err instanceof Error ? err.message : 'Operation failed',
        code: 'OPERATION_ERROR',
        retryable: false,
        timestamp: Date.now()
      };
      setError(networkErr);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [withRetry, networkError]);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setIsLoading(false);
    clearError();
  }, [clearError]);

  return {
    execute,
    data,
    error,
    isLoading,
    isRetrying,
    reset
  };
}