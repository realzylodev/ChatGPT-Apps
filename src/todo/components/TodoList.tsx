/**
 * Todo List Component
 * Displays the list of todos with filtering and search
 * Supports drag and drop reordering
 */

import React from 'react';
import { Reorder } from 'framer-motion';
import { TodoItem } from './TodoItem';
import type { Todo, TodoFilter } from '../types';
import type { DisplayMode } from '../../types';

interface TodoListProps {
  todos: Todo[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filter: TodoFilter;
  onFilterChange: (filter: Partial<TodoFilter>) => void;
  onClearFilter: () => void;
  onToggleComplete: (id: string) => void;
  onEditTodo: (todo: Todo) => void;
  onDeleteTodo: (id: string) => void;
  onUpdateTodo?: (id: string, updates: Partial<Todo>) => void;
  onReorderTodos?: (reorderedTodos: Todo[]) => void;
  displayMode: DisplayMode;
}

export function TodoList({
  todos,
  searchQuery,
  onSearchChange,
  filter,
  onFilterChange,
  onClearFilter,
  onToggleComplete,
  onEditTodo,
  onDeleteTodo,
  onUpdateTodo,
  onReorderTodos,
  displayMode
}: TodoListProps): React.JSX.Element {
  
  // Check if any filters are active
  const hasActiveFilters = React.useMemo(() => {
    return Object.keys(filter).some(key => {
      const value = filter[key as keyof TodoFilter];
      return value !== undefined && value !== null && 
             (Array.isArray(value) ? value.length > 0 : true);
    });
  }, [filter]);

  // Show search and filters in fullscreen mode or when there are many todos
  const showControls = displayMode === 'fullscreen' || todos.length > 5;

  return (
    <div className="flex flex-col h-full">
      {/* Search and Filter Controls */}
      {showControls && (
        <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          {/* Enhanced Search Input */}
          <div className="mb-3 relative">
            <div className="relative">
              <input
                type="text"
                placeholder="Search todos by title, description, tags, priority..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md 
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                           placeholder-gray-500 dark:placeholder-gray-400
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {/* Search Icon */}
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              {/* Clear Search */}
              {searchQuery && (
                <button
                  onClick={() => onSearchChange('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            {/* Search Tips */}
            {searchQuery && (
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Tip: Use multiple words to narrow results (e.g., "high priority work")
              </div>
            )}
          </div>

          {/* Filter Controls */}
          <div className="flex flex-wrap gap-2 items-center">
            {/* Completion Status Filter */}
            <select
              value={filter.completed === undefined ? 'all' : filter.completed ? 'completed' : 'pending'}
              onChange={(e) => {
                const value = e.target.value;
                onFilterChange({
                  completed: value === 'all' ? undefined : value === 'completed'
                });
              }}
              className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                         focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
            </select>

            {/* Priority Filter */}
            <select
              value={filter.priority || 'all'}
              onChange={(e) => {
                const value = e.target.value;
                onFilterChange({
                  priority: value === 'all' ? undefined : value as 'low' | 'medium' | 'high'
                });
              }}
              className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                         focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All Priorities</option>
              <option value="high">High Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="low">Low Priority</option>
            </select>

            {/* Overdue Filter */}
            <label className="flex items-center text-xs text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={filter.overdue || false}
                onChange={(e) => onFilterChange({ overdue: e.target.checked || undefined })}
                className="mr-1 rounded border-gray-300 dark:border-gray-600 
                           text-red-600 focus:ring-red-500 focus:ring-offset-0"
              />
              <span className={filter.overdue ? 'text-red-600 dark:text-red-400 font-medium' : ''}>
                Overdue Only
              </span>
            </label>

            {/* Tag Filter (if there are tags in todos) */}
            {(() => {
              const allTags = [...new Set(todos.flatMap(todo => todo.tags))].sort();
              if (allTags.length > 0) {
                return (
                  <select
                    value={filter.tags?.[0] || 'all'}
                    onChange={(e) => {
                      const value = e.target.value;
                      onFilterChange({
                        tags: value === 'all' ? undefined : [value]
                      });
                    }}
                    className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded
                               bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                               focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="all">All Tags</option>
                    {allTags.map(tag => (
                      <option key={tag} value={tag}>{tag}</option>
                    ))}
                  </select>
                );
              }
              return null;
            })()}

            {/* Clear Filters */}
            {(hasActiveFilters || searchQuery) && (
              <button
                onClick={onClearFilter}
                className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 
                           hover:text-gray-900 dark:hover:text-gray-100
                           border border-gray-300 dark:border-gray-600 rounded
                           hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
              >
                Clear All
              </button>
            )}

            {/* Filter Summary */}
            {(hasActiveFilters || searchQuery) && (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {todos.length} result{todos.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Todo List */}
      <div className="flex-1 overflow-y-auto">
        {todos.length === 0 ? (
          <div className="flex items-center justify-center h-full p-8">
            <div className="text-center">
              <div className="text-gray-400 dark:text-gray-500 mb-2">
                <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} 
                        d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {hasActiveFilters || searchQuery ? 'No todos match your filters' : 'No todos yet'}
              </div>
              {!hasActiveFilters && !searchQuery && (
                <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Add your first todo to get started
                </div>
              )}
            </div>
          </div>
        ) : onReorderTodos ? (
          <Reorder.Group
            axis="y"
            values={todos}
            onReorder={onReorderTodos}
            className="divide-y divide-gray-200 dark:divide-gray-700"
          >
            {todos.map((todo) => (
              <Reorder.Item
                key={todo.id}
                value={todo}
                dragListener={false}
                className="relative"
                whileDrag={{ 
                  scale: 1.02, 
                  boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
                  zIndex: 1000
                }}
                dragTransition={{ bounceStiffness: 600, bounceDamping: 20 }}
              >
                <TodoItem
                  todo={todo}
                  onToggleComplete={onToggleComplete}
                  onEdit={onEditTodo}
                  onDelete={onDeleteTodo}
                  onUpdate={onUpdateTodo}
                  displayMode={displayMode}
                  dragHandleProps={{
                    onPointerDown: (e: any) => {
                      const reorderItem = e.currentTarget.closest('[data-framer-name="reorder-item"]');
                      if (reorderItem) {
                        reorderItem.dispatchEvent(
                          new PointerEvent('pointerdown', {
                            pointerId: e.pointerId,
                            bubbles: true,
                            clientX: e.clientX,
                            clientY: e.clientY,
                          })
                        );
                      }
                    }
                  }}
                />
              </Reorder.Item>
            ))}
          </Reorder.Group>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {todos.map((todo) => (
              <div key={todo.id} className="relative">
                <TodoItem
                  todo={todo}
                  onToggleComplete={onToggleComplete}
                  onEdit={onEditTodo}
                  onDelete={onDeleteTodo}
                  onUpdate={onUpdateTodo}
                  displayMode={displayMode}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}