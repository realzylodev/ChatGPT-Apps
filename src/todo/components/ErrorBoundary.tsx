/**
 * Error Boundary Component
 * Catches JavaScript errors anywhere in the child component tree and displays fallback UI
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Update state with error info
    this.setState({
      error,
      errorInfo
    });

    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Report to error tracking service if available
    if (typeof window !== 'undefined' && (window as any).oai?.reportError) {
      (window as any).oai.reportError({
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        },
        errorInfo: {
          componentStack: errorInfo.componentStack
        },
        context: 'todo-widget'
      }).catch(() => {
        // Silently handle reporting errors
      });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="error-boundary p-6 text-center bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="mb-4">
            <svg className="w-12 h-12 mx-auto text-red-500 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          
          <h3 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">
            Something went wrong
          </h3>
          
          <p className="text-sm text-red-600 dark:text-red-300 mb-4">
            The todo widget encountered an unexpected error. This has been reported automatically.
          </p>

          {(globalThis as any).process?.env?.NODE_ENV === 'development' && this.state.error && (
            <details className="mb-4 text-left">
              <summary className="cursor-pointer text-sm font-medium text-red-700 dark:text-red-300 mb-2">
                Error Details (Development)
              </summary>
              <div className="bg-red-100 dark:bg-red-900/40 p-3 rounded text-xs font-mono text-red-800 dark:text-red-200 overflow-auto">
                <div className="mb-2">
                  <strong>Error:</strong> {this.state.error.message}
                </div>
                {this.state.error.stack && (
                  <div className="mb-2">
                    <strong>Stack:</strong>
                    <pre className="whitespace-pre-wrap mt-1">{this.state.error.stack}</pre>
                  </div>
                )}
                {this.state.errorInfo?.componentStack && (
                  <div>
                    <strong>Component Stack:</strong>
                    <pre className="whitespace-pre-wrap mt-1">{this.state.errorInfo.componentStack}</pre>
                  </div>
                )}
              </div>
            </details>
          )}

          <div className="flex gap-3 justify-center">
            <button
              onClick={this.handleRetry}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 
                         focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2
                         text-sm font-medium"
            >
              Try Again
            </button>
            
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-600 
                         rounded-md hover:bg-red-50 dark:hover:bg-red-900/20
                         focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2
                         text-sm font-medium"
            >
              Reload Widget
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Hook version for functional components
export function useErrorHandler() {
  const handleError = React.useCallback((error: Error, errorInfo?: any) => {
    console.error('Error caught by error handler:', error, errorInfo);
    
    // Report to error tracking service if available
    if (typeof window !== 'undefined' && (window as any).oai?.reportError) {
      (window as any).oai.reportError({
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        },
        errorInfo,
        context: 'todo-widget'
      }).catch(() => {
        // Silently handle reporting errors
      });
    }
  }, []);

  return { handleError };
}