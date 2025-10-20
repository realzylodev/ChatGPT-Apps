/**
 * Unit tests for TodoStorage class
 * Tests file operations, data persistence, error handling, and migration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { TodoStorage } from '../../src/storage.js';
import { Todo, TodoList, TodoUtils } from '../../src/types.js';
import { 
  StorageError, 
  FileError, 
  NotFoundError, 
  ValidationError 
} from '../../src/errors.js';

// Mock fs module
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  }
}));

// Mock path.dirname
vi.mock('path', async () => {
  const actual = await vi.importActual('path');
  return {
    ...actual,
    dirname: vi.fn(() => '/test/dir')
  };
});

describe('TodoStorage', () => {
  let storage: TodoStorage;
  let mockFs: any;
  const testFilePath = '/test/todos.json';

  beforeEach(() => {
    mockFs = vi.mocked(fs);
    storage = new TodoStorage(testFilePath);
    
    // Reset all mocks
    vi.clearAllMocks();
    
    // Default successful mkdir mock
    mockFs.mkdir.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create storage with default file path', () => {
      const defaultStorage = new TodoStorage();
      expect(defaultStorage.getFilePath()).toBe('./todos.json');
    });

    it('should create storage with custom file path', () => {
      const customStorage = new TodoStorage('/custom/path.json');
      expect(customStorage.getFilePath()).toBe('/custom/path.json');
    });

    it('should initialize with empty data structure', async () => {
      // Mock file not found to trigger creation
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });
      mockFs.writeFile.mockResolvedValue(undefined);

      await storage.initialize();
      const todos = await storage.getAllTodos();
      
      expect(todos).toEqual([]);
    });
  });

  describe('initialize', () => {
    it('should create directory if it does not exist', async () => {
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });
      mockFs.writeFile.mockResolvedValue(undefined);

      await storage.initialize();

      expect(mockFs.mkdir).toHaveBeenCalledWith('/test/dir', { recursive: true });
    });

    it('should load existing file successfully', async () => {
      const existingData: TodoList = {
        todos: [
          TodoUtils.createTodo({ title: 'Existing Todo' })
        ],
        metadata: {
          version: '1.0.0',
          lastModified: '2024-01-01T00:00:00.000Z',
          totalCount: 1,
          completedCount: 0
        }
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(existingData));

      await storage.initialize();
      const todos = await storage.getAllTodos();

      expect(todos).toHaveLength(1);
      expect(todos[0].title).toBe('Existing Todo');
    });

    it('should create new file if none exists', async () => {
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });
      mockFs.writeFile.mockResolvedValue(undefined);

      await storage.initialize();

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        testFilePath,
        expect.stringContaining('"todos": []'),
        'utf-8'
      );
    });

    it('should throw StorageError if directory creation fails', async () => {
      mockFs.mkdir.mockRejectedValue(new Error('Permission denied'));

      await expect(storage.initialize()).rejects.toThrow(StorageError);
    });

    it('should throw FileError if file creation fails', async () => {
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });
      mockFs.writeFile.mockRejectedValue(new Error('Disk full'));

      await expect(storage.initialize()).rejects.toThrow(FileError);
    });

    it('should handle invalid JSON in existing file', async () => {
      mockFs.readFile.mockResolvedValue('invalid json');

      await expect(storage.initialize()).rejects.toThrow(FileError);
    });
  });

  describe('data migration', () => {
    beforeEach(async () => {
      mockFs.writeFile.mockResolvedValue(undefined);
    });

    it('should migrate from array format (version 0.x)', async () => {
      const oldFormatData = [
        {
          id: 'old-id-1',
          title: 'Old Todo 1',
          completed: false
        },
        {
          id: 'old-id-2',
          title: 'Old Todo 2',
          completed: true,
          description: 'Old description'
        }
      ];

      mockFs.readFile.mockResolvedValue(JSON.stringify(oldFormatData));

      await storage.initialize();
      const todos = await storage.getAllTodos();

      expect(todos).toHaveLength(2);
      expect(todos[0].title).toBe('Old Todo 1');
      expect(todos[0].description).toBe(''); // Default value
      expect(todos[0].priority).toBe('medium'); // Default value
      expect(todos[1].title).toBe('Old Todo 2');
      expect(todos[1].description).toBe('Old description');
      
      // Should have saved migrated data
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should migrate from format without metadata', async () => {
      const oldFormatData = {
        todos: [
          TodoUtils.createTodo({ title: 'Todo without metadata' })
        ]
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(oldFormatData));

      await storage.initialize();
      const todoList = await storage.getTodoList();

      expect(todoList.metadata).toBeDefined();
      expect(todoList.metadata.version).toBe('1.0.0');
      expect(todoList.metadata.totalCount).toBe(1);
      expect(todoList.metadata.completedCount).toBe(0);
    });

    it('should throw ValidationError for unsupported format', async () => {
      const unsupportedData = {
        someOtherFormat: 'not supported'
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(unsupportedData));

      await expect(storage.initialize()).rejects.toThrow(ValidationError);
    });
  });

  describe('CRUD operations', () => {
    beforeEach(async () => {
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });
      mockFs.writeFile.mockResolvedValue(undefined);
      await storage.initialize();
    });

    describe('addTodo', () => {
      it('should add a new todo successfully', async () => {
        const newTodo = TodoUtils.createTodo({ title: 'New Todo' });

        const addedTodo = await storage.addTodo(newTodo);

        expect(addedTodo).toEqual(newTodo);
        expect(mockFs.writeFile).toHaveBeenCalled();
        
        const todos = await storage.getAllTodos();
        expect(todos).toContain(newTodo);
      });

      it('should throw ValidationError for duplicate ID', async () => {
        const todo1 = TodoUtils.createTodo({ title: 'Todo 1' });
        const todo2 = { ...TodoUtils.createTodo({ title: 'Todo 2' }), id: todo1.id };

        await storage.addTodo(todo1);

        await expect(storage.addTodo(todo2)).rejects.toThrow(ValidationError);
      });

      it('should throw ValidationError for invalid todo data', async () => {
        const invalidTodo = {
          id: 'invalid-uuid',
          title: '',
          completed: false,
          createdAt: 'invalid-date',
          updatedAt: 'invalid-date',
          priority: 'invalid',
          tags: []
        } as any;

        await expect(storage.addTodo(invalidTodo)).rejects.toThrow(ValidationError);
      });

      it('should throw error if not initialized', async () => {
        const uninitializedStorage = new TodoStorage();
        const todo = TodoUtils.createTodo({ title: 'Test' });

        await expect(uninitializedStorage.addTodo(todo)).rejects.toThrow(StorageError);
      });
    });

    describe('getTodoById', () => {
      it('should return todo by ID', async () => {
        const todo = TodoUtils.createTodo({ title: 'Find Me' });
        await storage.addTodo(todo);

        const foundTodo = await storage.getTodoById(todo.id);

        expect(foundTodo).toEqual(todo);
      });

      it('should return null for non-existent ID', async () => {
        const foundTodo = await storage.getTodoById('non-existent-id');

        expect(foundTodo).toBeNull();
      });
    });

    describe('updateTodo', () => {
      let existingTodo: Todo;

      beforeEach(async () => {
        existingTodo = TodoUtils.createTodo({ 
          title: 'Original Title',
          description: 'Original description',
          priority: 'low'
        });
        await storage.addTodo(existingTodo);
      });

      it('should update existing todo successfully', async () => {
        const updates = {
          title: 'Updated Title',
          priority: 'high' as const,
          completed: true
        };

        const updatedTodo = await storage.updateTodo(existingTodo.id, updates);

        expect(updatedTodo.title).toBe('Updated Title');
        expect(updatedTodo.priority).toBe('high');
        expect(updatedTodo.completed).toBe(true);
        expect(updatedTodo.description).toBe('Original description'); // Unchanged
        expect(updatedTodo.id).toBe(existingTodo.id); // Unchanged
        expect(mockFs.writeFile).toHaveBeenCalled();
      });

      it('should update the updatedAt timestamp', async () => {
        const originalUpdatedAt = existingTodo.updatedAt;

        const updatedTodo = await storage.updateTodo(existingTodo.id, { title: 'New Title' });

        expect(updatedTodo.updatedAt).not.toBe(originalUpdatedAt);
      });

      it('should throw NotFoundError for non-existent todo', async () => {
        await expect(
          storage.updateTodo('non-existent-id', { title: 'Updated' })
        ).rejects.toThrow(NotFoundError);
      });

      it('should throw ValidationError for invalid updates', async () => {
        const invalidUpdates = {
          title: '', // Empty title
          priority: 'invalid' as any
        };

        await expect(
          storage.updateTodo(existingTodo.id, invalidUpdates)
        ).rejects.toThrow(ValidationError);
      });
    });

    describe('deleteTodo', () => {
      let existingTodo: Todo;

      beforeEach(async () => {
        existingTodo = TodoUtils.createTodo({ title: 'To Delete' });
        await storage.addTodo(existingTodo);
      });

      it('should delete existing todo successfully', async () => {
        const result = await storage.deleteTodo(existingTodo.id);

        expect(result).toBe(true);
        expect(mockFs.writeFile).toHaveBeenCalled();
        
        const todos = await storage.getAllTodos();
        expect(todos).not.toContain(existingTodo);
      });

      it('should return false for non-existent todo', async () => {
        const result = await storage.deleteTodo('non-existent-id');

        expect(result).toBe(false);
      });
    });

    describe('clearAllTodos', () => {
      beforeEach(async () => {
        const todo1 = TodoUtils.createTodo({ title: 'Todo 1' });
        const todo2 = TodoUtils.createTodo({ title: 'Todo 2' });
        await storage.addTodo(todo1);
        await storage.addTodo(todo2);
      });

      it('should clear all todos', async () => {
        await storage.clearAllTodos();

        const todos = await storage.getAllTodos();
        expect(todos).toHaveLength(0);
        expect(mockFs.writeFile).toHaveBeenCalled();
      });
    });
  });

  describe('statistics and metadata', () => {
    beforeEach(async () => {
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });
      mockFs.writeFile.mockResolvedValue(undefined);
      await storage.initialize();

      // Add test data
      const todos = [
        TodoUtils.createTodo({ title: 'High Priority', priority: 'high' }),
        TodoUtils.createTodo({ title: 'Medium Priority', priority: 'medium' }),
        TodoUtils.updateTodo(
          TodoUtils.createTodo({ title: 'Completed', priority: 'low' }),
          { completed: true }
        ),
        TodoUtils.createTodo({ 
          title: 'Overdue', 
          priority: 'high',
          dueDate: '2020-01-01'
        })
      ];

      for (const todo of todos) {
        await storage.addTodo(todo);
      }
    });

    describe('getStats', () => {
      it('should return correct statistics', async () => {
        const stats = await storage.getStats();

        expect(stats.total).toBe(4);
        expect(stats.completed).toBe(1);
        expect(stats.overdue).toBe(1);
        expect(stats.byPriority.high).toBe(2);
        expect(stats.byPriority.medium).toBe(1);
        expect(stats.byPriority.low).toBe(1);
      });
    });

    describe('getTodoList', () => {
      it('should return todo list with updated metadata', async () => {
        const todoList = await storage.getTodoList();

        expect(todoList.todos).toHaveLength(4);
        expect(todoList.metadata.version).toBe('1.0.0');
        expect(todoList.metadata.totalCount).toBe(4);
        expect(todoList.metadata.completedCount).toBe(1);
        expect(todoList.metadata.lastModified).toBeDefined();
      });
    });
  });

  describe('backup and restore', () => {
    beforeEach(async () => {
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });
      mockFs.writeFile.mockResolvedValue(undefined);
      await storage.initialize();

      const todo = TodoUtils.createTodo({ title: 'Backup Test' });
      await storage.addTodo(todo);
    });

    describe('createBackup', () => {
      it('should create backup file successfully', async () => {
        const backupPath = await storage.createBackup();

        expect(backupPath).toContain('_backup_');
        expect(backupPath).toContain('.json');
        expect(mockFs.writeFile).toHaveBeenCalledWith(
          backupPath,
          expect.stringContaining('"title": "Backup Test"'),
          'utf-8'
        );
      });

      it('should throw error if backup creation fails', async () => {
        mockFs.writeFile.mockRejectedValueOnce(new Error('Backup failed'));

        await expect(storage.createBackup()).rejects.toThrow('Failed to create backup');
      });
    });

    describe('restoreFromBackup', () => {
      it('should restore from backup successfully', async () => {
        const backupData: TodoList = {
          todos: [
            TodoUtils.createTodo({ title: 'Restored Todo' })
          ],
          metadata: {
            version: '1.0.0',
            lastModified: '2024-01-01T00:00:00.000Z',
            totalCount: 1,
            completedCount: 0
          }
        };

        mockFs.readFile.mockResolvedValueOnce(JSON.stringify(backupData));

        await storage.restoreFromBackup('/backup/path.json');

        const todos = await storage.getAllTodos();
        expect(todos).toHaveLength(1);
        expect(todos[0].title).toBe('Restored Todo');
      });

      it('should throw error if backup file is invalid', async () => {
        mockFs.readFile.mockResolvedValueOnce('invalid json');

        await expect(
          storage.restoreFromBackup('/invalid/backup.json')
        ).rejects.toThrow('Failed to restore from backup');
      });

      it('should throw error if backup file does not exist', async () => {
        mockFs.readFile.mockRejectedValueOnce({ code: 'ENOENT' });

        await expect(
          storage.restoreFromBackup('/nonexistent/backup.json')
        ).rejects.toThrow('Failed to restore from backup');
      });
    });
  });

  describe('error handling', () => {
    it('should handle file write errors gracefully', async () => {
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });
      mockFs.writeFile.mockResolvedValueOnce(undefined); // For initialization
      await storage.initialize();

      // Make subsequent writes fail
      mockFs.writeFile.mockRejectedValue(new Error('Disk full'));

      const todo = TodoUtils.createTodo({ title: 'Test' });

      await expect(storage.addTodo(todo)).rejects.toThrow(FileError);
    });

    it('should handle file read errors during initialization', async () => {
      mockFs.readFile.mockRejectedValue(new Error('Permission denied'));

      await expect(storage.initialize()).rejects.toThrow(FileError);
    });

    it('should ensure initialization before operations', async () => {
      const uninitializedStorage = new TodoStorage();

      await expect(uninitializedStorage.getAllTodos()).rejects.toThrow(StorageError);
      await expect(uninitializedStorage.getTodoById('id')).rejects.toThrow(StorageError);
      await expect(uninitializedStorage.getStats()).rejects.toThrow(StorageError);
    });
  });

  describe('file path utilities', () => {
    it('should return correct file path', () => {
      const customPath = '/custom/todos.json';
      const customStorage = new TodoStorage(customPath);

      expect(customStorage.getFilePath()).toBe(customPath);
    });
  });
});