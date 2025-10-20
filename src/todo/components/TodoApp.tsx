/**
 * Main Todo App Component
 * Handles widget state, routing, and overall layout
 */

import React, { useState, useEffect, useCallback } from 'react';
import { TodoList } from './TodoList';
import { AddTodoForm } from './AddTodoForm';
import { EditTodoForm } from './EditTodoForm';
import { ErrorBoundary, useErrorHandler } from './ErrorBoundary';
import { ErrorMessage, NetworkOfflineMessage } from './ErrorMessage';
import { LoadingState } from './LoadingState';
import { useNetworkError } from '../hooks/useNetworkError';
import { useWidgetProps } from '../../use-widget-props';
import { useWidgetState } from '../../use-widget-state';
import { useOpenAiGlobal } from '../../use-openai-global';
import type { Todo, WidgetProps, WidgetState, TodoFilter, CreateTodoInput, UpdateTodoInput } from '../types';
import { TodoUtils } from '../types';

function TodoAppInner(): React.JSX.Element {
  // Error handling hooks
  const { handleError } = useErrorHandler();
  const { isOnline, networkError, clearError } = useNetworkError();

  // Get widget props from ChatGPT (initial data from tool response)
  const widgetProps = useWidgetProps<WidgetProps>({
    todos: [],
    displayMode: 'inline',
    theme: 'light'
  });

  // Get display mode and theme from OpenAI globals
  const displayMode = useOpenAiGlobal('displayMode') || widgetProps?.displayMode || 'inline';
  const theme = useOpenAiGlobal('theme') || widgetProps?.theme || 'light';

  // Widget state management
  const [widgetState, setWidgetState] = useWidgetState<WidgetState>({
    todos: widgetProps?.todos || [],
    filter: {},
    isLoading: false,
    error: undefined
  });

  // Local state for UI
  const [searchQuery, setSearchQuery] = useState('');
  const [currentView, setCurrentView] = useState<'list' | 'add' | 'edit'>('list');
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  // Widget communication utilities
  const updateWidgetState = useCallback((updates: Partial<WidgetState>, metadata?: Record<string, any>) => {
    try {
      if (typeof window !== 'undefined' && window.oai?.widget?.setState) {
        const newState = {
          ...widgetState,
          ...updates,
          _metadata: {
            version: '1.0.0',
            lastModified: new Date().toISOString(),
            displayMode,
            ...metadata
          }
        };

        window.oai.widget.setState(newState).catch((error) => {
          console.warn('Failed to update widget state:', error);
          handleError(error);
          setLocalError('Failed to sync with ChatGPT. Your changes may not be saved.');
        });
      }
    } catch (error) {
      handleError(error instanceof Error ? error : new Error(String(error)));
      setLocalError('Failed to update widget state');
    }
  }, [widgetState, displayMode, handleError]);

  const sendChatMessage = useCallback((message: string) => {
    try {
      if (typeof window !== 'undefined' && window.oai?.sendFollowUpMessage) {
        window.oai.sendFollowUpMessage({ prompt: message }).catch((error) => {
          console.warn('Failed to send follow-up message:', error);
          // Don't show error for follow-up messages as they're not critical
        });
      }
    } catch (error) {
      console.warn('Failed to send follow-up message:', error);
      // Don't show error for follow-up messages as they're not critical
    }
  }, []);

  // Initialize todos from widget props when they change
  useEffect(() => {
    if (widgetProps?.todos && widgetProps.todos.length > 0) {
      setWidgetState(prev => ({
        ...prev!,
        todos: widgetProps.todos || [],
        isLoading: false
      }));
    }
  }, [widgetProps?.todos, setWidgetState]);

  // Initialize widget state on mount
  useEffect(() => {
    if (widgetState) {
      // Initial widget state setup
      updateWidgetState(
        widgetState,
        {
          initialized: true,
          version: '1.0.0',
          capabilities: ['create', 'read', 'update', 'delete', 'filter', 'search', 'reorder'],
          displayModes: ['inline', 'fullscreen'],
          'openai/widgetAccessible': true,
          'openai/resultCanProduceWidget': true
        }
      );
    }
  }, []); // Only run on mount

  // Handle widget metadata updates
  useEffect(() => {
    if (widgetState?.todos) {
      const stats = TodoUtils.getStats(widgetState.todos);
      updateWidgetState(
        {},
        {
          'openai/widgetAccessible': true,
          'openai/resultCanProduceWidget': true,
          'openai/outputTemplate': 'todo-widget',
          todoStats: stats,
          lastUpdated: new Date().toISOString()
        }
      );
    }
  }, [widgetState?.todos?.length, widgetState?.todos?.filter(t => t.completed).length, updateWidgetState]);



  // Handle display mode changes
  useEffect(() => {
    if (widgetState) {
      updateWidgetState(
        { displayMode },
        { 
          displayMode,
          optimizedForFullscreen: displayMode === 'fullscreen',
          viewportOptimized: true
        }
      );
    }
  }, [displayMode, widgetState, updateWidgetState]);

  // Filter and sort todos based on current filter and search
  const filteredTodos = React.useMemo(() => {
    if (!widgetState?.todos) return [];
    
    let todos = TodoUtils.filterTodos(widgetState.todos, widgetState.filter);
    
    // Apply enhanced search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      const searchTerms = query.split(/\s+/); // Split by whitespace for multi-term search
      
      todos = todos.filter(todo => {
        const searchableText = [
          todo.title,
          todo.description,
          ...todo.tags,
          todo.priority,
          todo.completed ? 'completed' : 'pending',
          todo.dueDate ? TodoUtils.formatDueDate(todo.dueDate) : ''
        ].join(' ').toLowerCase();
        
        // All search terms must match (AND logic)
        return searchTerms.every(term => searchableText.includes(term));
      });
    }
    
    return TodoUtils.sortTodos(todos);
  }, [widgetState?.todos, widgetState?.filter, searchQuery]);

  // Update filter
  const updateFilter = useCallback((newFilter: Partial<TodoFilter>) => {
    setWidgetState(prev => ({
      ...prev,
      filter: { ...prev.filter, ...newFilter }
    }));
  }, [setWidgetState]);

  // Clear filter
  const clearFilter = useCallback(() => {
    setWidgetState(prev => ({
      ...prev,
      filter: {}
    }));
    setSearchQuery('');
  }, [setWidgetState]);

  // Handle todo operations
  const handleCreateTodo = useCallback((todoData: CreateTodoInput) => {
    try {
      // Clear any previous errors
      setLocalError(null);
      
      // Validate input
      if (!todoData.title?.trim()) {
        setLocalError('Todo title is required');
        return;
      }

      const now = new Date().toISOString();
      const newTodo: Todo = {
        id: crypto.randomUUID(),
        title: todoData.title.trim(),
        description: todoData.description?.trim() || '',
        completed: false,
        createdAt: now,
        updatedAt: now,
        dueDate: todoData.dueDate,
        priority: todoData.priority || 'medium',
        tags: todoData.tags || []
      };

      const updatedTodos = [newTodo, ...widgetState!.todos];
      
      setWidgetState(prev => ({
        ...prev!,
        todos: updatedTodos
      }));

      // Update widget state with metadata
      updateWidgetState(
        { todos: updatedTodos },
        { 
          action: 'todo_created',
          todoId: newTodo.id,
          totalCount: updatedTodos.length,
          completedCount: updatedTodos.filter(t => t.completed).length
        }
      );

      // Return to list view
      setCurrentView('list');

      // Notify ChatGPT of the new todo
      sendChatMessage(
        `I just added a new todo: "${newTodo.title}" with ${newTodo.priority} priority${newTodo.dueDate ? ` due ${TodoUtils.formatDueDate(newTodo.dueDate)}` : ''}.`
      );
    } catch (error) {
      handleError(error instanceof Error ? error : new Error(String(error)));
      setLocalError('Failed to create todo. Please try again.');
    }
  }, [setWidgetState, widgetState, updateWidgetState, sendChatMessage, handleError]);

  const handleUpdateTodo = useCallback((id: string, updates: Partial<Todo>) => {
    try {
      // Clear any previous errors
      setLocalError(null);
      
      // Validate updates
      if (updates.title !== undefined && !updates.title?.trim()) {
        setLocalError('Todo title cannot be empty');
        return;
      }

      const updatedTodos = widgetState!.todos.map(todo => 
        todo.id === id 
          ? { 
              ...todo, 
              ...updates, 
              title: updates.title?.trim() || todo.title,
              description: updates.description?.trim() ?? todo.description,
              updatedAt: new Date().toISOString() 
            }
          : todo
      );

      setWidgetState(prev => ({
        ...prev!,
        todos: updatedTodos
      }));

      // Update widget state with metadata
      updateWidgetState(
        { todos: updatedTodos },
        { 
          action: 'todo_updated',
          todoId: id,
          updates: Object.keys(updates),
          totalCount: updatedTodos.length,
          completedCount: updatedTodos.filter(t => t.completed).length
        }
      );
    } catch (error) {
      handleError(error instanceof Error ? error : new Error(String(error)));
      setLocalError('Failed to update todo. Please try again.');
    }
  }, [setWidgetState, widgetState, updateWidgetState, handleError]);

  const handleUpdateTodoFromForm = useCallback((id: string, updates: UpdateTodoInput) => {
    handleUpdateTodo(id, updates);
    setCurrentView('list');
  }, [handleUpdateTodo]);

  const handleDeleteTodo = useCallback((id: string) => {
    try {
      // Clear any previous errors
      setLocalError(null);
      
      const todoToDelete = widgetState?.todos.find(t => t.id === id);
      if (!todoToDelete) {
        setLocalError('Todo not found');
        return;
      }

      const updatedTodos = widgetState!.todos.filter(todo => todo.id !== id);
      
      setWidgetState(prev => ({
        ...prev!,
        todos: updatedTodos
      }));

      // Update widget state with metadata
      updateWidgetState(
        { todos: updatedTodos },
        { 
          action: 'todo_deleted',
          todoId: id,
          totalCount: updatedTodos.length,
          completedCount: updatedTodos.filter(t => t.completed).length
        }
      );

      // Notify ChatGPT of deletion
      sendChatMessage(`I deleted the todo: "${todoToDelete.title}".`);
    } catch (error) {
      handleError(error instanceof Error ? error : new Error(String(error)));
      setLocalError('Failed to delete todo. Please try again.');
    }
  }, [setWidgetState, widgetState, updateWidgetState, sendChatMessage, handleError]);

  const handleToggleComplete = useCallback((id: string) => {
    const todo = widgetState!.todos.find(t => t.id === id);
    const newCompletedState = !todo?.completed;
    
    const updatedTodos = widgetState!.todos.map(todo => 
      todo.id === id 
        ? { ...todo, completed: newCompletedState, updatedAt: new Date().toISOString() }
        : todo
    );

    setWidgetState(prev => ({
      ...prev!,
      todos: updatedTodos
    }));

    // Update widget state with metadata
    updateWidgetState(
      { todos: updatedTodos },
      { 
        action: 'todo_toggled',
        todoId: id,
        completed: newCompletedState,
        totalCount: updatedTodos.length,
        completedCount: updatedTodos.filter(t => t.completed).length
      }
    );

    // Optional: Notify ChatGPT of completion status change
    if (todo && newCompletedState) {
      sendChatMessage(`I completed the todo: "${todo.title}".`);
    }
  }, [setWidgetState, widgetState, updateWidgetState, sendChatMessage]);

  const handleReorderTodos = useCallback((reorderedTodos: Todo[]) => {
    setWidgetState(prev => ({
      ...prev!,
      todos: reorderedTodos
    }));

    // Update widget state with metadata
    updateWidgetState(
      { todos: reorderedTodos },
      { 
        action: 'todos_reordered',
        totalCount: reorderedTodos.length,
        completedCount: reorderedTodos.filter(t => t.completed).length
      }
    );
  }, [setWidgetState, updateWidgetState]);

  // Handle display mode requests
  const requestDisplayMode = useCallback((mode: 'inline' | 'fullscreen' | 'pip') => {
    if (typeof window !== 'undefined' && window.oai?.requestDisplayMode) {
      window.oai.requestDisplayMode({ mode }).catch(() => {
        // Silently handle errors
      });
    }
  }, []);

  // Handle external link opening (currently unused but available for future use)
  // const openExternal = useCallback((href: string) => {
  //   if (typeof window !== 'undefined' && window.oai?.openExternal) {
  //     window.oai.openExternal({ href });
  //   } else {
  //     window.open(href, '_blank');
  //   }
  // }, []);

  // Handle view navigation
  const handleAddTodo = useCallback(() => {
    setCurrentView('add');
    setEditingTodo(null);
  }, []);

  const handleEditTodo = useCallback((todo: Todo) => {
    setCurrentView('edit');
    setEditingTodo(todo);
  }, []);

  const handleBackToList = useCallback(() => {
    setCurrentView('list');
    setEditingTodo(null);
  }, []);

  // Responsive container classes based on display mode
  const containerClasses = React.useMemo(() => {
    const baseClasses = 'todo-app w-full h-full flex flex-col';
    const themeClasses = theme === 'dark' ? 'dark' : '';
    const modeClasses = {
      'inline': 'max-h-96 min-h-64',
      'fullscreen': 'min-h-screen',
      'pip': 'max-h-80 min-h-48'
    }[displayMode] || 'max-h-96 min-h-64';
    
    return `${baseClasses} ${themeClasses} ${modeClasses}`;
  }, [theme, displayMode]);

  // Loading state
  if (widgetState?.isLoading) {
    return (
      <div className={containerClasses}>
        <LoadingState 
          variant="spinner" 
          size="md" 
          message="Loading todos..." 
          className="h-full"
        />
      </div>
    );
  }

  // Error state
  if (widgetState?.error) {
    return (
      <div className={containerClasses}>
        <div className="p-4">
          <ErrorMessage
            error={widgetState.error}
            onRetry={() => {
              setWidgetState(prev => ({ ...prev!, error: undefined }));
              setLocalError(null);
            }}
            onDismiss={() => {
              setWidgetState(prev => ({ ...prev!, error: undefined }));
            }}
            variant="inline"
            showDetails={(globalThis as any).process?.env?.NODE_ENV === 'development'}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={containerClasses}>
      {/* Network status banner */}
      {!isOnline && (
        <NetworkOfflineMessage 
          onDismiss={clearError}
        />
      )}
      
      {/* Local error message */}
      {localError && (
        <div className="p-2">
          <ErrorMessage
            error={localError}
            onDismiss={() => setLocalError(null)}
            variant="banner"
          />
        </div>
      )}
      
      {/* Network error message */}
      {networkError && (
        <div className="p-2">
          <ErrorMessage
            error={networkError}
            onRetry={() => {
              clearError();
              // Optionally retry the last failed operation
            }}
            onDismiss={clearError}
            variant="banner"
          />
        </div>
      )}

      {/* Header with navigation and controls */}
      <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {currentView === 'add' ? 'Add Todo' : 
               currentView === 'edit' ? 'Edit Todo' : 'Todos'}
            </h1>
            
            {currentView === 'list' && (
              <div className="flex items-center gap-2">
                {/* Display Mode Toggle (only show in inline mode) */}
                {displayMode === 'inline' && (
                  <button
                    onClick={() => requestDisplayMode('fullscreen')}
                    className="px-2 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 
                               border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                    title="Expand to fullscreen"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                            d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                  </button>
                )}
                
                {/* Add Todo Button */}
                <button
                  onClick={handleAddTodo}
                  className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Add Todo
                </button>
              </div>
            )}
            
            {(currentView === 'add' || currentView === 'edit') && (
              <button
                onClick={handleBackToList}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              >
                Back
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-hidden">
        {currentView === 'list' && (
          <TodoList
            todos={filteredTodos}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            filter={widgetState?.filter || {}}
            onFilterChange={updateFilter}
            onClearFilter={clearFilter}
            onToggleComplete={handleToggleComplete}
            onEditTodo={handleEditTodo}
            onDeleteTodo={handleDeleteTodo}
            onUpdateTodo={handleUpdateTodo}
            onReorderTodos={handleReorderTodos}
            displayMode={displayMode}
          />
        )}
        
        {currentView === 'add' && (
          <AddTodoForm
            onSubmit={handleCreateTodo}
            onCancel={handleBackToList}
            displayMode={displayMode}
          />
        )}
        
        {currentView === 'edit' && editingTodo && (
          <EditTodoForm
            todo={editingTodo}
            onSubmit={handleUpdateTodoFromForm}
            onCancel={handleBackToList}
            displayMode={displayMode}
          />
        )}
      </div>

      {/* Footer with stats and controls (only in fullscreen mode) */}
      {displayMode === 'fullscreen' && widgetState?.todos && (
        <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="px-4 py-2 flex items-center justify-between">
            <div className="text-xs text-gray-600 dark:text-gray-400">
              {(() => {
                const stats = TodoUtils.getStats(widgetState.todos);
                return `${stats.total} total • ${stats.completed} completed • ${stats.overdue} overdue`;
              })()}
            </div>
            
            <div className="flex items-center gap-2">
              {/* Collapse to inline mode */}
              <button
                onClick={() => requestDisplayMode('inline')}
                className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 
                           border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-600"
                title="Collapse to inline view"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                        d="M20 12H4m16 0l-4 4m4-4l-4-4" />
                </svg>
              </button>
              
              {/* Widget version info */}
              <span className="text-xs text-gray-400 dark:text-gray-500">
                v1.0.0
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Main TodoApp component wrapped with ErrorBoundary
export function TodoApp(): React.JSX.Element {
  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        // Log error for debugging
        console.error('TodoApp Error:', error, errorInfo);
        
        // Report to error tracking if available
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
            context: 'todo-app-main',
            timestamp: new Date().toISOString()
          }).catch(() => {
            // Silently handle reporting errors
          });
        }
      }}
      fallback={
        <div className="todo-app w-full h-full flex flex-col max-h-96 min-h-64">
          <div className="p-6 text-center bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg m-4">
            <div className="mb-4">
              <svg className="w-12 h-12 mx-auto text-red-500 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            
            <h3 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">
              Todo Widget Error
            </h3>
            
            <p className="text-sm text-red-600 dark:text-red-300 mb-4">
              The todo widget encountered an error and needs to be reloaded.
            </p>

            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 
                         focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2
                         text-sm font-medium"
            >
              Reload Widget
            </button>
          </div>
        </div>
      }
    >
      <TodoAppInner />
    </ErrorBoundary>
  );
}