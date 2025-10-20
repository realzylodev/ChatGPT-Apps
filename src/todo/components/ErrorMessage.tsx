/**
 * Error Message Component
 * Displays user-friendly error messages with retry options
 */

import React from 'react';
import type { NetworkError } from '../hooks/useNetworkError';

interface ErrorMessageProps {
  error: NetworkError | string | null;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
  variant?: 'inline' | 'banner' | 'modal';
  showDetails?: boolean;
}

export function ErrorMessage({
  error,
  onRetry,
  onDismiss,
  className = '',
  variant = 'inline',
  showDetails = false
}: ErrorMessageProps): React.JSX.Element | null {
  if (!error) return null;

  const errorObj: NetworkError = typeof error === 'string' 
    ? { message: error, retryable: false, timestamp: Date.now() }
    : error;

  const getErrorIcon = () => {
    switch (errorObj.code) {
      case 'NETWORK_OFFLINE':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M18.364 5.636l-12.728 12.728m0 0L5.636 18.364m12.728-12.728L18.364 18.364M12 2.25c5.385 0 9.75 4.365 9.75 9.75s-4.365 9.75-9.75 9.75S2.25 17.635 2.25 12 6.615 2.25 12 2.25z" />
          </svg>
        );
      case 'SERVER_ERROR':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
          </svg>
        );
      case 'TIMEOUT':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'RATE_LIMITED':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  const getErrorColor = () => {
    switch (errorObj.code) {
      case 'NETWORK_OFFLINE':
        return 'orange';
      case 'RATE_LIMITED':
        return 'yellow';
      default:
        return 'red';
    }
  };

  const color = getErrorColor();
  
  const baseClasses = {
    inline: `p-3 rounded-md border`,
    banner: `p-4 border-l-4`,
    modal: `p-6 rounded-lg border shadow-lg bg-white dark:bg-gray-800`
  };

  const colorClasses = {
    red: {
      bg: 'bg-red-50 dark:bg-red-900/20',
      border: 'border-red-200 dark:border-red-800',
      text: 'text-red-800 dark:text-red-200',
      icon: 'text-red-500 dark:text-red-400',
      button: 'bg-red-600 hover:bg-red-700 text-white',
      buttonSecondary: 'text-red-600 dark:text-red-400 border-red-300 dark:border-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'
    },
    orange: {
      bg: 'bg-orange-50 dark:bg-orange-900/20',
      border: 'border-orange-200 dark:border-orange-800',
      text: 'text-orange-800 dark:text-orange-200',
      icon: 'text-orange-500 dark:text-orange-400',
      button: 'bg-orange-600 hover:bg-orange-700 text-white',
      buttonSecondary: 'text-orange-600 dark:text-orange-400 border-orange-300 dark:border-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20'
    },
    yellow: {
      bg: 'bg-yellow-50 dark:bg-yellow-900/20',
      border: 'border-yellow-200 dark:border-yellow-800',
      text: 'text-yellow-800 dark:text-yellow-200',
      icon: 'text-yellow-500 dark:text-yellow-400',
      button: 'bg-yellow-600 hover:bg-yellow-700 text-white',
      buttonSecondary: 'text-yellow-600 dark:text-yellow-400 border-yellow-300 dark:border-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20'
    }
  };

  const colors = colorClasses[color];

  return (
    <div className={`${baseClasses[variant]} ${colors.bg} ${colors.border} ${className}`}>
      <div className="flex items-start">
        <div className={`flex-shrink-0 ${colors.icon}`}>
          {getErrorIcon()}
        </div>
        
        <div className="ml-3 flex-1">
          <div className={`text-sm font-medium ${colors.text}`}>
            {errorObj.message}
          </div>
          
          {showDetails && (errorObj.code || errorObj.statusCode) && (
            <div className={`mt-1 text-xs ${colors.text} opacity-75`}>
              {errorObj.code && `Code: ${errorObj.code}`}
              {errorObj.statusCode && ` • Status: ${errorObj.statusCode}`}
              {errorObj.timestamp && ` • ${new Date(errorObj.timestamp).toLocaleTimeString()}`}
            </div>
          )}
          
          {(onRetry || onDismiss) && (
            <div className="mt-3 flex gap-2">
              {onRetry && errorObj.retryable && (
                <button
                  onClick={onRetry}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md 
                             focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-${color}-500
                             ${colors.button}`}
                >
                  Try Again
                </button>
              )}
              
              {onDismiss && (
                <button
                  onClick={onDismiss}
                  className={`px-3 py-1.5 text-xs font-medium border rounded-md
                             focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-${color}-500
                             ${colors.buttonSecondary}`}
                >
                  Dismiss
                </button>
              )}
            </div>
          )}
        </div>
        
        {onDismiss && variant !== 'modal' && (
          <div className="ml-auto pl-3">
            <button
              onClick={onDismiss}
              className={`inline-flex rounded-md p-1.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-${color}-500
                         ${colors.icon} hover:${colors.bg}`}
            >
              <span className="sr-only">Dismiss</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Specialized error message components
export function NetworkOfflineMessage({ onRetry, onDismiss }: { onRetry?: () => void; onDismiss?: () => void }) {
  return (
    <ErrorMessage
      error={{
        message: "You're currently offline. Some features may not work properly.",
        code: 'NETWORK_OFFLINE',
        retryable: true,
        timestamp: Date.now()
      }}
      onRetry={onRetry}
      onDismiss={onDismiss}
      variant="banner"
    />
  );
}

export function LoadingErrorMessage({ 
  onRetry, 
  onDismiss,
  message = "Failed to load data. Please try again."
}: { 
  onRetry?: () => void; 
  onDismiss?: () => void;
  message?: string;
}) {
  return (
    <ErrorMessage
      error={{
        message,
        code: 'LOADING_ERROR',
        retryable: true,
        timestamp: Date.now()
      }}
      onRetry={onRetry}
      onDismiss={onDismiss}
      variant="inline"
    />
  );
}

export function ValidationErrorMessage({ 
  message,
  onDismiss 
}: { 
  message: string;
  onDismiss?: () => void;
}) {
  return (
    <ErrorMessage
      error={{
        message,
        code: 'VALIDATION_ERROR',
        retryable: false,
        timestamp: Date.now()
      }}
      onDismiss={onDismiss}
      variant="inline"
    />
  );
}