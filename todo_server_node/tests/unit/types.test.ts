/**
 * Unit tests for Todo data models and utility functions
 * Tests validation, creation, filtering, and utility operations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  Todo, 
  TodoList, 
  CreateTodoInput, 
  UpdateTodoInput, 
  TodoFilter,
  TodoUtils,
  TodoSchema,
  TodoListSchema,
  CreateTodoInputSchema,
  UpdateTodoInputSchema,
  TodoFilterSchema
} from '../../src/types.js';

describe('TodoUtils', () => {
  describe('generateId', () => {
    it('should generate a valid UUID', () => {
      const id = TodoUtils.generateId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should generate unique IDs', () => {
      const id1 = TodoUtils.generateId();
      const id2 = TodoUtils.generateId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('getCurrentTimestamp', () => {
    it('should return a valid ISO timestamp', () => {
      const timestamp = TodoUtils.getCurrentTimestamp();
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(new Date(timestamp).toISOString()).toBe(timestamp);
    });
  });

  describe('createTodo', () => {
    it('should create a todo with required fields', () => {
      const input: CreateTodoInput = {
        title: 'Test Todo'
      };

      const todo = TodoUtils.createTodo(input);

      expect(todo.id).toBeDefined();
      expect(todo.title).toBe('Test Todo');
      expect(todo.description).toBe('');
      expect(todo.completed).toBe(false);
      expect(todo.createdAt).toBeDefined();
      expect(todo.updatedAt).toBeDefined();
      expect(todo.priority).toBe('medium');
      expect(todo.tags).toEqual([]);
    });

    it('should create a todo with all optional fields', () => {
      const input: CreateTodoInput = {
        title: 'Test Todo',
        description: 'Test description',
        dueDate: '2024-12-31',
        priority: 'high',
        tags: ['work', 'urgent']
      };

      const todo = TodoUtils.createTodo(input);

      expect(todo.title).toBe('Test Todo');
      expect(todo.description).toBe('Test description');
      expect(todo.dueDate).toBe('2024-12-31');
      expect(todo.priority).toBe('high');
      expect(todo.tags).toEqual(['work', 'urgent']);
    });

    it('should set timestamps correctly', () => {
      const beforeCreate = Date.now();
      const todo = TodoUtils.createTodo({ title: 'Test' });
      const afterCreate = Date.now();

      const createdTime = new Date(todo.createdAt).getTime();
      const updatedTime = new Date(todo.updatedAt).getTime();

      expect(createdTime).toBeGreaterThanOrEqual(beforeCreate);
      expect(createdTime).toBeLessThanOrEqual(afterCreate);
      expect(updatedTime).toBe(createdTime);
    });
  });

  describe('updateTodo', () => {
    let existingTodo: Todo;

    beforeEach(() => {
      existingTodo = TodoUtils.createTodo({
        title: 'Original Title',
        description: 'Original description',
        priority: 'low'
      });
    });

    it('should update specified fields only', () => {
      const updates = {
        title: 'Updated Title',
        priority: 'high' as const
      };

      const updatedTodo = TodoUtils.updateTodo(existingTodo, updates);

      expect(updatedTodo.title).toBe('Updated Title');
      expect(updatedTodo.priority).toBe('high');
      expect(updatedTodo.description).toBe('Original description'); // unchanged
      expect(updatedTodo.id).toBe(existingTodo.id); // unchanged
    });

    it('should update the updatedAt timestamp', async () => {
      const originalUpdatedAt = existingTodo.updatedAt;
      
      // Wait a small amount to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 1));
      const updatedTodo = TodoUtils.updateTodo(existingTodo, { title: 'New Title' });

      expect(updatedTodo.updatedAt).not.toBe(originalUpdatedAt);
      expect(new Date(updatedTodo.updatedAt).getTime()).toBeGreaterThan(
        new Date(originalUpdatedAt).getTime()
      );
    });

    it('should preserve createdAt timestamp', () => {
      const updatedTodo = TodoUtils.updateTodo(existingTodo, { title: 'New Title' });
      expect(updatedTodo.createdAt).toBe(existingTodo.createdAt);
    });
  });

  describe('filterTodos', () => {
    let todos: Todo[];

    beforeEach(() => {
      todos = [
        TodoUtils.createTodo({ title: 'High Priority', priority: 'high' }),
        TodoUtils.createTodo({ title: 'Medium Priority', priority: 'medium' }),
        TodoUtils.createTodo({ title: 'Low Priority', priority: 'low' }),
        TodoUtils.updateTodo(
          TodoUtils.createTodo({ title: 'Completed Task', priority: 'high' }),
          { completed: true }
        ),
        TodoUtils.createTodo({ 
          title: 'Overdue Task', 
          priority: 'medium',
          dueDate: '2020-01-01' // Past date
        }),
        TodoUtils.createTodo({ 
          title: 'Tagged Task', 
          priority: 'low',
          tags: ['work', 'urgent']
        })
      ];
    });

    it('should filter by completion status', () => {
      const completedFilter: TodoFilter = { completed: true };
      const incompleteFilter: TodoFilter = { completed: false };

      const completed = TodoUtils.filterTodos(todos, completedFilter);
      const incomplete = TodoUtils.filterTodos(todos, incompleteFilter);

      expect(completed).toHaveLength(1);
      expect(completed[0].title).toBe('Completed Task');
      expect(incomplete).toHaveLength(5);
    });

    it('should filter by priority', () => {
      const highPriorityFilter: TodoFilter = { priority: 'high' };
      const mediumPriorityFilter: TodoFilter = { priority: 'medium' };

      const highPriority = TodoUtils.filterTodos(todos, highPriorityFilter);
      const mediumPriority = TodoUtils.filterTodos(todos, mediumPriorityFilter);

      expect(highPriority).toHaveLength(2);
      expect(mediumPriority).toHaveLength(2);
    });

    it('should filter by overdue status', () => {
      const overdueFilter: TodoFilter = { overdue: true };
      const notOverdueFilter: TodoFilter = { overdue: false };

      const overdue = TodoUtils.filterTodos(todos, overdueFilter);
      const notOverdue = TodoUtils.filterTodos(todos, notOverdueFilter);

      expect(overdue).toHaveLength(1);
      expect(overdue[0].title).toBe('Overdue Task');
      expect(notOverdue).toHaveLength(5);
    });

    it('should filter by tags', () => {
      const workTagFilter: TodoFilter = { tags: ['work'] };
      const urgentTagFilter: TodoFilter = { tags: ['urgent'] };
      const multipleTagsFilter: TodoFilter = { tags: ['work', 'urgent'] };

      const workTodos = TodoUtils.filterTodos(todos, workTagFilter);
      const urgentTodos = TodoUtils.filterTodos(todos, urgentTagFilter);
      const multipleTodos = TodoUtils.filterTodos(todos, multipleTagsFilter);

      expect(workTodos).toHaveLength(1);
      expect(urgentTodos).toHaveLength(1);
      expect(multipleTodos).toHaveLength(1); // Same todo has both tags
    });

    it('should combine multiple filters', () => {
      const combinedFilter: TodoFilter = {
        completed: false,
        priority: 'high'
      };

      const filtered = TodoUtils.filterTodos(todos, combinedFilter);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe('High Priority');
    });

    it('should return all todos when no filters applied', () => {
      const noFilter: TodoFilter = {};
      const filtered = TodoUtils.filterTodos(todos, noFilter);

      expect(filtered).toHaveLength(todos.length);
    });
  });

  describe('sortTodos', () => {
    let todos: Todo[];

    beforeEach(() => {
      // Create todos with different priorities and dates
      const baseTodo1 = TodoUtils.createTodo({ 
        title: 'High Priority Future', 
        priority: 'high',
        dueDate: '2025-12-31'
      });
      
      const baseTodo2 = TodoUtils.createTodo({ 
        title: 'Medium Priority Soon', 
        priority: 'medium',
        dueDate: '2024-12-01'
      });
      
      const baseTodo3 = TodoUtils.createTodo({ 
        title: 'Low Priority No Date', 
        priority: 'low'
      });
      
      const baseTodo4 = TodoUtils.createTodo({ 
        title: 'High Priority Soon', 
        priority: 'high',
        dueDate: '2024-11-01'
      });

      const completedTodo = TodoUtils.updateTodo(
        TodoUtils.createTodo({ title: 'Completed High Priority', priority: 'high' }),
        { completed: true }
      );

      todos = [baseTodo3, completedTodo, baseTodo2, baseTodo1, baseTodo4];
    });

    it('should sort completed todos to the bottom', () => {
      const sorted = TodoUtils.sortTodos(todos);
      
      const completedTodos = sorted.filter(t => t.completed);
      const incompleteTodos = sorted.filter(t => !t.completed);
      
      expect(completedTodos).toHaveLength(1);
      expect(incompleteTodos).toHaveLength(4);
      
      // All incomplete todos should come before completed ones
      const completedIndex = sorted.findIndex(t => t.completed);
      expect(completedIndex).toBe(4); // Last position
    });

    it('should sort by priority (high > medium > low)', () => {
      const incompleteTodos = todos.filter(t => !t.completed);
      const sorted = TodoUtils.sortTodos(incompleteTodos);
      
      const priorities = sorted.map(t => t.priority);
      
      // High priority todos should come first
      expect(priorities.indexOf('high')).toBeLessThan(priorities.indexOf('medium'));
      expect(priorities.indexOf('medium')).toBeLessThan(priorities.indexOf('low'));
    });

    it('should sort by due date within same priority', () => {
      const sorted = TodoUtils.sortTodos(todos);
      
      // Find high priority todos (should be first)
      const highPriorityTodos = sorted.filter(t => t.priority === 'high' && !t.completed);
      
      expect(highPriorityTodos).toHaveLength(2);
      
      // The one with earlier due date should come first
      const firstTodo = highPriorityTodos[0];
      const secondTodo = highPriorityTodos[1];
      
      if (firstTodo.dueDate && secondTodo.dueDate) {
        expect(new Date(firstTodo.dueDate).getTime()).toBeLessThanOrEqual(
          new Date(secondTodo.dueDate).getTime()
        );
      }
    });

    it('should not mutate the original array', () => {
      const originalTodos = [...todos];
      TodoUtils.sortTodos(todos);
      
      expect(todos).toEqual(originalTodos);
    });
  });

  describe('isOverdue', () => {
    it('should return true for overdue incomplete todos', () => {
      const overdueTodo = TodoUtils.createTodo({
        title: 'Overdue',
        dueDate: '2020-01-01'
      });

      expect(TodoUtils.isOverdue(overdueTodo)).toBe(true);
    });

    it('should return false for future due dates', () => {
      const futureTodo = TodoUtils.createTodo({
        title: 'Future',
        dueDate: '2030-01-01'
      });

      expect(TodoUtils.isOverdue(futureTodo)).toBe(false);
    });

    it('should return false for completed todos even if past due date', () => {
      const completedOverdueTodo = TodoUtils.updateTodo(
        TodoUtils.createTodo({
          title: 'Completed Overdue',
          dueDate: '2020-01-01'
        }),
        { completed: true }
      );

      expect(TodoUtils.isOverdue(completedOverdueTodo)).toBe(false);
    });

    it('should return false for todos without due date', () => {
      const noDueDateTodo = TodoUtils.createTodo({
        title: 'No Due Date'
      });

      expect(TodoUtils.isOverdue(noDueDateTodo)).toBe(false);
    });
  });

  describe('getStats', () => {
    let todos: Todo[];

    beforeEach(() => {
      todos = [
        TodoUtils.createTodo({ title: 'High 1', priority: 'high' }),
        TodoUtils.createTodo({ title: 'High 2', priority: 'high' }),
        TodoUtils.createTodo({ title: 'Medium 1', priority: 'medium' }),
        TodoUtils.createTodo({ title: 'Low 1', priority: 'low' }),
        TodoUtils.updateTodo(
          TodoUtils.createTodo({ title: 'Completed', priority: 'high' }),
          { completed: true }
        ),
        TodoUtils.createTodo({ 
          title: 'Overdue', 
          priority: 'medium',
          dueDate: '2020-01-01'
        })
      ];
    });

    it('should calculate correct statistics', () => {
      const stats = TodoUtils.getStats(todos);

      expect(stats.total).toBe(6);
      expect(stats.completed).toBe(1);
      expect(stats.overdue).toBe(1);
      expect(stats.byPriority.high).toBe(3);
      expect(stats.byPriority.medium).toBe(2);
      expect(stats.byPriority.low).toBe(1);
    });

    it('should handle empty todo list', () => {
      const stats = TodoUtils.getStats([]);

      expect(stats.total).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.overdue).toBe(0);
      expect(stats.byPriority.high).toBe(0);
      expect(stats.byPriority.medium).toBe(0);
      expect(stats.byPriority.low).toBe(0);
    });
  });
});

describe('Zod Schema Validation', () => {
  describe('TodoSchema', () => {
    it('should validate a valid todo', () => {
      const validTodo = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Valid Todo',
        description: 'Valid description',
        completed: false,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        dueDate: '2024-12-31',
        priority: 'medium',
        tags: ['work']
      };

      expect(() => TodoSchema.parse(validTodo)).not.toThrow();
    });

    it('should reject todo with invalid UUID', () => {
      const invalidTodo = {
        id: 'invalid-uuid',
        title: 'Test',
        completed: false,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        priority: 'medium',
        tags: []
      };

      expect(() => TodoSchema.parse(invalidTodo)).toThrow();
    });

    it('should reject todo with empty title', () => {
      const invalidTodo = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: '',
        completed: false,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        priority: 'medium',
        tags: []
      };

      expect(() => TodoSchema.parse(invalidTodo)).toThrow();
    });

    it('should reject todo with invalid priority', () => {
      const invalidTodo = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Test',
        completed: false,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        priority: 'invalid',
        tags: []
      };

      expect(() => TodoSchema.parse(invalidTodo)).toThrow();
    });

    it('should apply default values', () => {
      const minimalTodo = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Test',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      };

      const parsed = TodoSchema.parse(minimalTodo);

      expect(parsed.description).toBe('');
      expect(parsed.completed).toBe(false);
      expect(parsed.priority).toBe('medium');
      expect(parsed.tags).toEqual([]);
    });
  });

  describe('CreateTodoInputSchema', () => {
    it('should validate valid input', () => {
      const validInput = {
        title: 'New Todo',
        description: 'Description',
        dueDate: '2024-12-31',
        priority: 'high',
        tags: ['work', 'urgent']
      };

      expect(() => CreateTodoInputSchema.parse(validInput)).not.toThrow();
    });

    it('should require title', () => {
      const invalidInput = {
        description: 'Description'
      };

      expect(() => CreateTodoInputSchema.parse(invalidInput)).toThrow();
    });

    it('should reject empty title', () => {
      const invalidInput = {
        title: ''
      };

      expect(() => CreateTodoInputSchema.parse(invalidInput)).toThrow();
    });

    it('should reject too many tags', () => {
      const invalidInput = {
        title: 'Test',
        tags: Array(15).fill('tag') // More than 10 tags
      };

      expect(() => CreateTodoInputSchema.parse(invalidInput)).toThrow();
    });
  });

  describe('UpdateTodoInputSchema', () => {
    it('should validate valid update input', () => {
      const validInput = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Updated Title',
        completed: true
      };

      expect(() => UpdateTodoInputSchema.parse(validInput)).not.toThrow();
    });

    it('should require valid UUID for id', () => {
      const invalidInput = {
        id: 'invalid-uuid',
        title: 'Updated'
      };

      expect(() => UpdateTodoInputSchema.parse(invalidInput)).toThrow();
    });

    it('should allow partial updates', () => {
      const partialInput = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        completed: true
      };

      expect(() => UpdateTodoInputSchema.parse(partialInput)).not.toThrow();
    });
  });

  describe('TodoFilterSchema', () => {
    it('should validate valid filter', () => {
      const validFilter = {
        completed: true,
        priority: 'high',
        overdue: false,
        tags: ['work']
      };

      expect(() => TodoFilterSchema.parse(validFilter)).not.toThrow();
    });

    it('should allow empty filter', () => {
      const emptyFilter = {};

      expect(() => TodoFilterSchema.parse(emptyFilter)).not.toThrow();
    });

    it('should reject invalid priority in filter', () => {
      const invalidFilter = {
        priority: 'invalid'
      };

      expect(() => TodoFilterSchema.parse(invalidFilter)).toThrow();
    });
  });

  describe('TodoListSchema', () => {
    it('should validate valid todo list', () => {
      const validList = {
        todos: [],
        metadata: {
          version: '1.0.0',
          lastModified: '2024-01-01T00:00:00.000Z',
          totalCount: 0,
          completedCount: 0
        }
      };

      expect(() => TodoListSchema.parse(validList)).not.toThrow();
    });

    it('should apply default values', () => {
      const minimalList = {
        metadata: {
          lastModified: '2024-01-01T00:00:00.000Z',
          totalCount: 0,
          completedCount: 0
        }
      };

      const parsed = TodoListSchema.parse(minimalList);

      expect(parsed.todos).toEqual([]);
      expect(parsed.metadata.version).toBe('1.0.0');
    });
  });
});