/**
 * Core Todo data models and interfaces
 * Based on the design document specifications
 */

import { z } from 'zod';

export type TodoPriority = 'low' | 'medium' | 'high';

export interface Todo {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  dueDate?: string; // ISO date string
  priority: TodoPriority;
  tags: string[];
}

export interface TodoList {
  todos: Todo[];
  metadata: {
    version: string;
    lastModified: string;
    totalCount: number;
    completedCount: number;
  };
}

// Input interfaces for MCP tool calls
export interface CreateTodoInput {
  title: string;
  description?: string;
  dueDate?: string; // ISO date string
  priority?: TodoPriority;
  tags?: string[];
}

export interface UpdateTodoInput {
  id: string;
  title?: string;
  description?: string;
  dueDate?: string;
  priority?: TodoPriority;
  completed?: boolean;
  tags?: string[];
}

export interface TodoFilter {
  completed?: boolean;
  priority?: TodoPriority;
  overdue?: boolean;
  tags?: string[];
}

// MCP Tool response interfaces
export interface ToolResult {
  content: Array<{
    type: 'text' | 'resource';
    text?: string;
    resource?: string;
  }>;
  isError?: boolean;
  _meta?: Record<string, any>;
}

export interface ErrorResponse {
  error: true;
  message: string;
  code: string;
  details?: Record<string, any>;
}

// Widget-specific interfaces
export interface WidgetProps extends Record<string, unknown> {
  todos?: Todo[];
  displayMode?: 'inline' | 'fullscreen';
  theme?: 'light' | 'dark';
}

export interface WidgetState extends Record<string, unknown> {
  todos: Todo[];
  filter: TodoFilter;
  isLoading: boolean;
  error?: string;
  displayMode?: 'inline' | 'fullscreen' | 'pip';
  _metadata?: Record<string, any>;
}

// Zod validation schemas (client-side)
export const TodoPrioritySchema = z.enum(['low', 'medium', 'high']);

export const TodoSchema = z.object({
  id: z.string(),
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  description: z.string().max(1000, 'Description too long').default(''),
  completed: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
  dueDate: z.string().optional(),
  priority: TodoPrioritySchema.default('medium'),
  tags: z.array(z.string().max(50)).max(10, 'Too many tags').default([])
});

export const CreateTodoInputSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  description: z.string().max(1000, 'Description too long').optional(),
  dueDate: z.string().optional(),
  priority: TodoPrioritySchema.optional(),
  tags: z.array(z.string().max(50)).max(10, 'Too many tags').optional()
});

export const UpdateTodoInputSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  title: z.string().min(1, 'Title is required').max(200, 'Title too long').optional(),
  description: z.string().max(1000, 'Description too long').optional(),
  dueDate: z.string().optional(),
  priority: TodoPrioritySchema.optional(),
  completed: z.boolean().optional(),
  tags: z.array(z.string().max(50)).max(10, 'Too many tags').optional()
});

export const TodoFilterSchema = z.object({
  completed: z.boolean().optional(),
  priority: TodoPrioritySchema.optional(),
  overdue: z.boolean().optional(),
  tags: z.array(z.string()).optional()
});

// Client-side utility functions for todo operations
export class TodoUtils {
  /**
   * Filter todos based on criteria
   */
  static filterTodos(todos: Todo[], filter: TodoFilter): Todo[] {
    return todos.filter(todo => {
      // Filter by completion status
      if (filter.completed !== undefined && todo.completed !== filter.completed) {
        return false;
      }

      // Filter by priority
      if (filter.priority && todo.priority !== filter.priority) {
        return false;
      }

      // Filter by overdue status
      if (filter.overdue !== undefined) {
        const isOverdue = todo.dueDate && new Date(todo.dueDate) < new Date() && !todo.completed;
        if (filter.overdue !== !!isOverdue) {
          return false;
        }
      }

      // Filter by tags
      if (filter.tags && filter.tags.length > 0) {
        const hasMatchingTag = filter.tags.some(tag => todo.tags.includes(tag));
        if (!hasMatchingTag) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Sort todos by priority and due date
   */
  static sortTodos(todos: Todo[]): Todo[] {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    
    return [...todos].sort((a, b) => {
      // Completed todos go to bottom
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1;
      }

      // Sort by priority (high to low)
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      // Sort by due date (earliest first)
      if (a.dueDate && b.dueDate) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;

      // Sort by creation date (newest first)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  /**
   * Check if a todo is overdue
   */
  static isOverdue(todo: Todo): boolean {
    return !!(todo.dueDate && new Date(todo.dueDate) < new Date() && !todo.completed);
  }

  /**
   * Get todo statistics
   */
  static getStats(todos: Todo[]): { total: number; completed: number; overdue: number; byPriority: Record<TodoPriority, number> } {
    const stats = {
      total: todos.length,
      completed: 0,
      overdue: 0,
      byPriority: { low: 0, medium: 0, high: 0 } as Record<TodoPriority, number>
    };

    todos.forEach(todo => {
      if (todo.completed) stats.completed++;
      if (this.isOverdue(todo)) stats.overdue++;
      stats.byPriority[todo.priority]++;
    });

    return stats;
  }

  /**
   * Format due date for display
   */
  static formatDueDate(dueDate: string): string {
    const date = new Date(dueDate);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString();
    }
  }

  /**
   * Get priority color class
   */
  static getPriorityColor(priority: TodoPriority): string {
    switch (priority) {
      case 'high': return 'text-red-600 dark:text-red-400';
      case 'medium': return 'text-orange-600 dark:text-orange-400';
      case 'low': return 'text-green-600 dark:text-green-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  }

  /**
   * Validate todo input using Zod schemas
   */
  static validateCreateInput(input: unknown): CreateTodoInput {
    return CreateTodoInputSchema.parse(input);
  }

  static validateUpdateInput(input: unknown): UpdateTodoInput {
    return UpdateTodoInputSchema.parse(input);
  }

  static validateFilter(input: unknown): TodoFilter {
    return TodoFilterSchema.parse(input);
  }

  static validateTodo(input: unknown): Todo {
    return TodoSchema.parse(input);
  }
}