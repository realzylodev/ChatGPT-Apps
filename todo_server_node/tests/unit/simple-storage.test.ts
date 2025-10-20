/**
 * Simplified storage tests focusing on core functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TodoStorage } from '../../src/storage.js';
import { TodoUtils } from '../../src/types.js';
import { StorageError, ValidationError, NotFoundError } from '../../src/errors.js';
import fs from 'fs/promises';
import path from 'path';

describe('TodoStorage - Basic Functionality', () => {
  let storage: TodoStorage;
  let testFilePath: string;

  beforeEach(async () => {
    // Use a unique test file for each test
    testFilePath = path.join(process.cwd(), `test-todos-${Date.now()}.json`);
    storage = new TodoStorage(testFilePath);
  });

  afterEach(async () => {
    // Clean up test file
    try {
      await fs.unlink(testFilePath);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  });

  describe('Basic Operations', () => {
    it('should initialize storage successfully', async () => {
      await storage.initialize();
      
      const todos = await storage.getAllTodos();
      expect(todos).toEqual([]);
    });

    it('should add and retrieve todos', async () => {
      await storage.initialize();
      
      const newTodo = TodoUtils.createTodo({ title: 'Test Todo' });
      await storage.addTodo(newTodo);
      
      const todos = await storage.getAllTodos();
      expect(todos).toHaveLength(1);
      expect(todos[0].title).toBe('Test Todo');
    });

    it('should update existing todos', async () => {
      await storage.initialize();
      
      const newTodo = TodoUtils.createTodo({ title: 'Original Title' });
      await storage.addTodo(newTodo);
      
      const updatedTodo = await storage.updateTodo(newTodo.id, { title: 'Updated Title' });
      expect(updatedTodo.title).toBe('Updated Title');
      
      const todos = await storage.getAllTodos();
      expect(todos[0].title).toBe('Updated Title');
    });

    it('should delete todos', async () => {
      await storage.initialize();
      
      const newTodo = TodoUtils.createTodo({ title: 'To Delete' });
      await storage.addTodo(newTodo);
      
      const deleted = await storage.deleteTodo(newTodo.id);
      expect(deleted).toBe(true);
      
      const todos = await storage.getAllTodos();
      expect(todos).toHaveLength(0);
    });

    it('should return null for non-existent todo', async () => {
      await storage.initialize();
      
      const todo = await storage.getTodoById('non-existent-id');
      expect(todo).toBeNull();
    });

    it('should throw NotFoundError when updating non-existent todo', async () => {
      await storage.initialize();
      
      await expect(
        storage.updateTodo('non-existent-id', { title: 'Updated' })
      ).rejects.toThrow(NotFoundError);
    });

    it('should return false when deleting non-existent todo', async () => {
      await storage.initialize();
      
      const result = await storage.deleteTodo('non-existent-id');
      expect(result).toBe(false);
    });

    it('should get correct statistics', async () => {
      await storage.initialize();
      
      const todo1 = TodoUtils.createTodo({ title: 'High Priority', priority: 'high' });
      const todo2 = TodoUtils.createTodo({ title: 'Medium Priority', priority: 'medium' });
      const todo3 = TodoUtils.updateTodo(
        TodoUtils.createTodo({ title: 'Completed', priority: 'low' }),
        { completed: true }
      );
      
      await storage.addTodo(todo1);
      await storage.addTodo(todo2);
      await storage.addTodo(todo3);
      
      const stats = await storage.getStats();
      expect(stats.total).toBe(3);
      expect(stats.completed).toBe(1);
      expect(stats.byPriority.high).toBe(1);
      expect(stats.byPriority.medium).toBe(1);
      expect(stats.byPriority.low).toBe(1);
    });

    it('should clear all todos', async () => {
      await storage.initialize();
      
      const todo1 = TodoUtils.createTodo({ title: 'Todo 1' });
      const todo2 = TodoUtils.createTodo({ title: 'Todo 2' });
      
      await storage.addTodo(todo1);
      await storage.addTodo(todo2);
      
      await storage.clearAllTodos();
      
      const todos = await storage.getAllTodos();
      expect(todos).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should throw error when not initialized', async () => {
      const uninitializedStorage = new TodoStorage();
      
      await expect(uninitializedStorage.getAllTodos()).rejects.toThrow(StorageError);
    });

    it('should throw ValidationError for duplicate ID', async () => {
      await storage.initialize();
      
      const todo1 = TodoUtils.createTodo({ title: 'Todo 1' });
      const todo2 = { ...TodoUtils.createTodo({ title: 'Todo 2' }), id: todo1.id };
      
      await storage.addTodo(todo1);
      
      await expect(storage.addTodo(todo2)).rejects.toThrow(ValidationError);
    });
  });

  describe('File Persistence', () => {
    it('should persist data between instances', async () => {
      // First instance
      const storage1 = new TodoStorage(testFilePath);
      await storage1.initialize();
      
      const newTodo = TodoUtils.createTodo({ title: 'Persistent Todo' });
      await storage1.addTodo(newTodo);
      
      // Second instance
      const storage2 = new TodoStorage(testFilePath);
      await storage2.initialize();
      
      const todos = await storage2.getAllTodos();
      expect(todos).toHaveLength(1);
      expect(todos[0].title).toBe('Persistent Todo');
    });
  });
});