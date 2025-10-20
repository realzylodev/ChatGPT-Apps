/**
 * Integration tests for Todo MCP Server Components
 * Tests storage integration, tool handlers, and widget functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TodoStorage } from '../../src/storage.js';
import { TodoUtils, CreateTodoInput, UpdateTodoInput } from '../../src/types.js';
import fs from 'fs/promises';
import path from 'path';

describe('Todo MCP Server Integration Tests', () => {
  let testStorage: TodoStorage;
  let testFilePath: string;

  beforeEach(async () => {
    // Create a unique test file for each test
    testFilePath = path.join(process.cwd(), `test-integration-${Date.now()}.json`);
    testStorage = new TodoStorage(testFilePath);
    await testStorage.initialize();
  });

  afterEach(async () => {
    // Clean up test files
    try {
      await fs.unlink(testFilePath);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Storage Integration', () => {
    it('should create and retrieve todos through storage', async () => {
      const todoInput: CreateTodoInput = {
        title: 'Integration Test Todo',
        description: 'Created during integration testing',
        priority: 'high'
      };

      const newTodo = TodoUtils.createTodo(todoInput);
      await testStorage.addTodo(newTodo);

      const retrievedTodo = await testStorage.getTodoById(newTodo.id);
      expect(retrievedTodo).toBeDefined();
      expect(retrievedTodo?.title).toBe(todoInput.title);
      expect(retrievedTodo?.description).toBe(todoInput.description);
      expect(retrievedTodo?.priority).toBe(todoInput.priority);
    });

    it('should handle CRUD operations correctly', async () => {
      // Create
      const todoInput: CreateTodoInput = {
        title: 'CRUD Test Todo',
        priority: 'medium'
      };
      const newTodo = TodoUtils.createTodo(todoInput);
      await testStorage.addTodo(newTodo);

      // Read
      let todos = await testStorage.getAllTodos();
      expect(todos).toHaveLength(1);
      expect(todos[0].title).toBe('CRUD Test Todo');

      // Update
      const updates: Partial<UpdateTodoInput> = {
        title: 'Updated CRUD Test Todo',
        priority: 'high',
        completed: true
      };
      const updatedTodo = await testStorage.updateTodo(newTodo.id, updates);
      expect(updatedTodo.title).toBe('Updated CRUD Test Todo');
      expect(updatedTodo.priority).toBe('high');
      expect(updatedTodo.completed).toBe(true);

      // Delete
      const deleted = await testStorage.deleteTodo(newTodo.id);
      expect(deleted).toBe(true);

      todos = await testStorage.getAllTodos();
      expect(todos).toHaveLength(0);
    });

    it('should handle multiple todos and statistics', async () => {
      // Create multiple todos
      const todos = [
        TodoUtils.createTodo({ title: 'High Priority', priority: 'high' }),
        TodoUtils.createTodo({ title: 'Medium Priority', priority: 'medium' }),
        TodoUtils.updateTodo(
          TodoUtils.createTodo({ title: 'Completed Low', priority: 'low' }),
          { completed: true }
        )
      ];

      for (const todo of todos) {
        await testStorage.addTodo(todo);
      }

      const stats = await testStorage.getStats();
      expect(stats.total).toBe(3);
      expect(stats.completed).toBe(1);
      expect(stats.byPriority.high).toBe(1);
      expect(stats.byPriority.medium).toBe(1);
      expect(stats.byPriority.low).toBe(1);
    });
  });

  describe('Data Validation Integration', () => {
    it('should validate todo creation input', () => {
      const validInput: CreateTodoInput = {
        title: 'Valid Todo',
        description: 'Valid description',
        priority: 'medium',
        tags: ['test']
      };

      expect(() => TodoUtils.validateCreateInput(validInput)).not.toThrow();

      const invalidInput = {
        title: '', // Empty title should fail
        priority: 'invalid' // Invalid priority
      };

      expect(() => TodoUtils.validateCreateInput(invalidInput)).toThrow();
    });

    it('should validate todo update input', () => {
      const validUpdate: UpdateTodoInput = {
        id: TodoUtils.generateId(),
        title: 'Updated Title',
        completed: true
      };

      expect(() => TodoUtils.validateUpdateInput(validUpdate)).not.toThrow();

      const invalidUpdate = {
        id: 'invalid-uuid', // Invalid UUID
        title: 'Updated'
      };

      expect(() => TodoUtils.validateUpdateInput(invalidUpdate)).toThrow();
    });

    it('should validate todo filter input', () => {
      const validFilter = {
        completed: true,
        priority: 'high' as const,
        overdue: false
      };

      expect(() => TodoUtils.validateFilter(validFilter)).not.toThrow();

      const invalidFilter = {
        priority: 'invalid'
      };

      expect(() => TodoUtils.validateFilter(invalidFilter)).toThrow();
    });
  });

  describe('Todo Utilities Integration', () => {
    it('should filter todos correctly', async () => {
      // Create test data
      const todos = [
        TodoUtils.createTodo({ title: 'High Priority', priority: 'high' }),
        TodoUtils.createTodo({ title: 'Medium Priority', priority: 'medium' }),
        TodoUtils.updateTodo(
          TodoUtils.createTodo({ title: 'Completed', priority: 'low' }),
          { completed: true }
        ),
        TodoUtils.createTodo({ 
          title: 'Overdue', 
          priority: 'medium',
          dueDate: '2020-01-01' // Past date
        })
      ];

      // Test priority filter
      const highPriorityTodos = TodoUtils.filterTodos(todos, { priority: 'high' });
      expect(highPriorityTodos).toHaveLength(1);
      expect(highPriorityTodos[0].title).toBe('High Priority');

      // Test completion filter
      const completedTodos = TodoUtils.filterTodos(todos, { completed: true });
      expect(completedTodos).toHaveLength(1);
      expect(completedTodos[0].title).toBe('Completed');

      // Test overdue filter
      const overdueTodos = TodoUtils.filterTodos(todos, { overdue: true });
      expect(overdueTodos).toHaveLength(1);
      expect(overdueTodos[0].title).toBe('Overdue');
    });

    it('should sort todos correctly', () => {
      const todos = [
        TodoUtils.createTodo({ title: 'Low Priority', priority: 'low' }),
        TodoUtils.updateTodo(
          TodoUtils.createTodo({ title: 'Completed High', priority: 'high' }),
          { completed: true }
        ),
        TodoUtils.createTodo({ title: 'High Priority', priority: 'high' }),
        TodoUtils.createTodo({ title: 'Medium Priority', priority: 'medium' })
      ];

      const sorted = TodoUtils.sortTodos(todos);

      // Completed todos should be at the end
      expect(sorted[sorted.length - 1].completed).toBe(true);

      // Among incomplete todos, high priority should come first
      const incompleteTodos = sorted.filter(t => !t.completed);
      expect(incompleteTodos[0].priority).toBe('high');
      expect(incompleteTodos[1].priority).toBe('medium');
      expect(incompleteTodos[2].priority).toBe('low');
    });

    it('should detect overdue todos correctly', () => {
      const overdueTodo = TodoUtils.createTodo({
        title: 'Overdue Todo',
        dueDate: '2020-01-01' // Past date
      });

      const futureTodo = TodoUtils.createTodo({
        title: 'Future Todo',
        dueDate: '2030-01-01' // Future date
      });

      const completedOverdueTodo = TodoUtils.updateTodo(
        TodoUtils.createTodo({
          title: 'Completed Overdue',
          dueDate: '2020-01-01'
        }),
        { completed: true }
      );

      expect(TodoUtils.isOverdue(overdueTodo)).toBe(true);
      expect(TodoUtils.isOverdue(futureTodo)).toBe(false);
      expect(TodoUtils.isOverdue(completedOverdueTodo)).toBe(false);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle storage errors gracefully', async () => {
      // Test duplicate ID error
      const todo = TodoUtils.createTodo({ title: 'Test Todo' });
      await testStorage.addTodo(todo);

      await expect(testStorage.addTodo(todo)).rejects.toThrow('already exists');
    });

    it('should handle not found errors', async () => {
      const nonExistentId = TodoUtils.generateId();

      await expect(
        testStorage.updateTodo(nonExistentId, { title: 'Updated' })
      ).rejects.toThrow('not found');

      const result = await testStorage.deleteTodo(nonExistentId);
      expect(result).toBe(false);
    });

    it('should handle validation errors', async () => {
      const invalidTodo = {
        id: 'invalid-uuid',
        title: '',
        completed: false,
        createdAt: 'invalid-date',
        updatedAt: 'invalid-date',
        priority: 'invalid',
        tags: []
      } as any;

      await expect(testStorage.addTodo(invalidTodo)).rejects.toThrow();
    });
  });

  describe('File Persistence Integration', () => {
    it('should persist data across storage instances', async () => {
      // Create todo in first instance
      const todo = TodoUtils.createTodo({ title: 'Persistent Todo' });
      await testStorage.addTodo(todo);

      // Create new storage instance with same file
      const newStorage = new TodoStorage(testFilePath);
      await newStorage.initialize();

      // Verify data persisted
      const todos = await newStorage.getAllTodos();
      expect(todos).toHaveLength(1);
      expect(todos[0].title).toBe('Persistent Todo');
    });

    it('should handle backup and restore operations', async () => {
      // Create test data
      const todo = TodoUtils.createTodo({ title: 'Backup Test Todo' });
      await testStorage.addTodo(todo);

      // Create backup
      const backupPath = await testStorage.createBackup();
      expect(backupPath).toContain('_backup_');

      // Clear data
      await testStorage.clearAllTodos();
      let todos = await testStorage.getAllTodos();
      expect(todos).toHaveLength(0);

      // Restore from backup
      await testStorage.restoreFromBackup(backupPath);
      todos = await testStorage.getAllTodos();
      expect(todos).toHaveLength(1);
      expect(todos[0].title).toBe('Backup Test Todo');

      // Clean up backup file
      try {
        await fs.unlink(backupPath);
      } catch (error) {
        // Ignore cleanup errors
      }
    });
  });

  describe('Complete Workflow Integration', () => {
    it('should handle a complete todo management workflow', async () => {
      // 1. Start with empty list
      let todos = await testStorage.getAllTodos();
      expect(todos).toHaveLength(0);

      // 2. Create multiple todos
      const todo1 = TodoUtils.createTodo({
        title: 'Workflow Test 1',
        priority: 'high',
        dueDate: '2024-12-31'
      });
      const todo2 = TodoUtils.createTodo({
        title: 'Workflow Test 2',
        priority: 'medium'
      });

      await testStorage.addTodo(todo1);
      await testStorage.addTodo(todo2);

      todos = await testStorage.getAllTodos();
      expect(todos).toHaveLength(2);

      // 3. Update a todo
      const updatedTodo1 = await testStorage.updateTodo(todo1.id, {
        title: 'Updated Workflow Test 1',
        description: 'Added description',
        priority: 'low'
      });

      expect(updatedTodo1.title).toBe('Updated Workflow Test 1');
      expect(updatedTodo1.description).toBe('Added description');
      expect(updatedTodo1.priority).toBe('low');

      // 4. Complete a todo
      const completedTodo2 = await testStorage.updateTodo(todo2.id, {
        completed: true
      });

      expect(completedTodo2.completed).toBe(true);

      // 5. Check statistics
      const stats = await testStorage.getStats();
      expect(stats.total).toBe(2);
      expect(stats.completed).toBe(1);
      expect(stats.byPriority.low).toBe(1);
      expect(stats.byPriority.medium).toBe(1);

      // 6. Filter todos
      const incompleteTodos = TodoUtils.filterTodos(todos, { completed: false });
      expect(incompleteTodos).toHaveLength(1);

      // 7. Sort todos
      const sortedTodos = TodoUtils.sortTodos(await testStorage.getAllTodos());
      expect(sortedTodos[0].completed).toBe(false); // Incomplete first
      expect(sortedTodos[1].completed).toBe(true); // Completed last

      // 8. Delete a todo
      const deleted = await testStorage.deleteTodo(todo1.id);
      expect(deleted).toBe(true);

      todos = await testStorage.getAllTodos();
      expect(todos).toHaveLength(1);
      expect(todos[0].id).toBe(todo2.id);
    });
  });
});