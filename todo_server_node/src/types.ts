/**
 * Server-side Todo data models and interfaces
 * Shared types for the Node.js MCP server
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

// MCP Tool interfaces
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

// Zod validation schemas
export const TodoPrioritySchema = z.enum(['low', 'medium', 'high']);

export const TodoSchema = z.object({
    id: z.string().uuid(),
    title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
    description: z.string().max(1000, 'Description too long').default(''),
    completed: z.boolean().default(false),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    dueDate: z.string().date().optional(),
    priority: TodoPrioritySchema.default('medium'),
    tags: z.array(z.string().max(50)).max(10, 'Too many tags').default([])
});

export const TodoListSchema = z.object({
    todos: z.array(TodoSchema).default([]),
    metadata: z.object({
        version: z.string().default('1.0.0'),
        lastModified: z.string().datetime(),
        totalCount: z.number().int().min(0),
        completedCount: z.number().int().min(0)
    })
});

export const CreateTodoInputSchema = z.object({
    title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
    description: z.string().max(1000, 'Description too long').optional(),
    dueDate: z.string().date().optional(),
    priority: TodoPrioritySchema.optional(),
    tags: z.array(z.string().max(50)).max(10, 'Too many tags').optional()
});

export const UpdateTodoInputSchema = z.object({
    id: z.string().uuid('Invalid todo ID'),
    title: z.string().min(1, 'Title is required').max(200, 'Title too long').optional(),
    description: z.string().max(1000, 'Description too long').optional(),
    dueDate: z.string().date().optional(),
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

// Utility functions for todo operations
export class TodoUtils {
    /**
     * Generate a new UUID for todos
     */
    static generateId(): string {
        return crypto.randomUUID();
    }

    /**
     * Get current ISO timestamp
     */
    static getCurrentTimestamp(): string {
        return new Date().toISOString();
    }

    /**
     * Create a new todo with default values
     */
    static createTodo(input: CreateTodoInput): Todo {
        const now = this.getCurrentTimestamp();
        return {
            id: this.generateId(),
            title: input.title,
            description: input.description || '',
            completed: false,
            createdAt: now,
            updatedAt: now,
            dueDate: input.dueDate,
            priority: input.priority || 'medium',
            tags: input.tags || []
        };
    }

    /**
     * Update an existing todo with new values
     */
    static updateTodo(existingTodo: Todo, updates: Omit<UpdateTodoInput, 'id'>): Todo {
        return {
            ...existingTodo,
            ...updates,
            updatedAt: this.getCurrentTimestamp()
        };
    }

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

    static validateTodoList(input: unknown): TodoList {
        return TodoListSchema.parse(input);
    }
}