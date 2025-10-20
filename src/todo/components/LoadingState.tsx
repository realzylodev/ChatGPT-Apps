/**
 * Loading State Component
 * Provides consistent loading indicators and skeleton states
 */

import React from 'react';

interface LoadingStateProps {
  variant?: 'spinner' | 'skeleton' | 'pulse' | 'dots';
  size?: 'sm' | 'md' | 'lg';
  message?: string;
  className?: string;
}

export function LoadingState({
  variant = 'spinner',
  size = 'md',
  message,
  className = ''
}: LoadingStateProps): React.JSX.Element {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  };

  const renderSpinner = () => (
    <div className={`animate-spin rounded-full border-2 border-gray-300 dark:border-gray-600 border-t-blue-600 dark:border-t-blue-400 ${sizeClasses[size]}`} />
  );

  const renderDots = () => (
    <div className="flex space-x-1">
      <div className="w-2 h-2 bg-blue-600 dark:bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
      <div className="w-2 h-2 bg-blue-600 dark:bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
      <div className="w-2 h-2 bg-blue-600 dark:bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
  );

  const renderPulse = () => (
    <div className={`bg-gray-300 dark:bg-gray-600 rounded animate-pulse ${sizeClasses[size]}`} />
  );

  const renderSkeleton = () => (
    <div className="animate-pulse space-y-3">
      <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-3/4" />
      <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/2" />
      <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-5/6" />
    </div>
  );

  const renderLoader = () => {
    switch (variant) {
      case 'dots':
        return renderDots();
      case 'pulse':
        return renderPulse();
      case 'skeleton':
        return renderSkeleton();
      default:
        return renderSpinner();
    }
  };

  return (
    <div className={`flex flex-col items-center justify-center p-4 ${className}`}>
      {renderLoader()}
      {message && (
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-400 text-center">
          {message}
        </p>
      )}
    </div>
  );
}

// Specialized loading components
export function TodoListSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="animate-pulse">
          <div className="flex items-center space-x-3">
            <div className="w-4 h-4 bg-gray-300 dark:bg-gray-600 rounded" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-3/4" />
              <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-1/2" />
            </div>
            <div className="w-8 h-8 bg-gray-300 dark:bg-gray-600 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function FormSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-4">
      <div className="space-y-2">
        <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/4" />
        <div className="h-10 bg-gray-300 dark:bg-gray-600 rounded" />
      </div>
      <div className="space-y-2">
        <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/3" />
        <div className="h-20 bg-gray-300 dark:bg-gray-600 rounded" />
      </div>
      <div className="flex space-x-3">
        <div className="h-10 bg-gray-300 dark:bg-gray-600 rounded flex-1" />
        <div className="h-10 bg-gray-300 dark:bg-gray-600 rounded w-20" />
      </div>
    </div>
  );
}

export function InlineLoader({ message }: { message?: string }) {
  return (
    <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
      <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 dark:border-gray-600 border-t-blue-600 dark:border-t-blue-400" />
      <span>{message || 'Loading...'}</span>
    </div>
  );
}