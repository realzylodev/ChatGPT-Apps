/**
 * JSON file-based storage system for todos
 * Handles reading, writing, and managing todo data persistence
 */

import { promises as fs } from 'fs';
import { dirname } from 'path';
import { Todo, TodoList, TodoUtils, TodoListSchema } from './types.js';
import {
  StorageError,
  FileError,
  NotFoundError,
  ValidationError,
  RetryHandler,
  logger
} from './errors.js';

export class TodoStorage {
  private filePath: string;
  private data: TodoList;
  private isInitialized = false;

  constructor(filePath: string = './todos.json') {
    this.filePath = filePath;
    this.data = {
      todos: [],
      metadata: {
        version: '1.0.0',
        lastModified: TodoUtils.getCurrentTimestamp(),
        totalCount: 0,
        completedCount: 0
      }
    };
  }

  /**
   * Initialize storage - create file if it doesn't exist, load existing data
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing todo storage', { filePath: this.filePath });

      // Ensure directory exists
      const dir = dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });

      // Try to load existing data first (without retry for ENOENT)
      try {
        await this.loadFromFile();
        this.isInitialized = true;
        logger.info('Todo storage initialized successfully');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          // File doesn't exist, create with default data
          await this.saveToFile();
          this.isInitialized = true;
          logger.info('Created new todo storage file');
        } else {
          // For other errors, use retry logic
          await RetryHandler.withRetry(
            () => this.loadFromFile(),
            3,
            1000
          );
          this.isInitialized = true;
          logger.info('Todo storage initialized successfully after retry');
        }
      }
    } catch (error) {
      throw new StorageError(
        `Failed to initialize storage: ${(error as Error).message}`,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Load todo data from JSON file
   */
  private async loadFromFile(): Promise<void> {
    const fileContent = await fs.readFile(this.filePath, 'utf-8');

    let rawData;
    try {
      rawData = JSON.parse(fileContent);
    } catch (parseError) {
      throw new FileError(
        'Invalid JSON in storage file',
        'read',
        this.filePath,
        parseError instanceof Error ? parseError : new Error(String(parseError))
      );
    }

    // Validate and migrate data if necessary
    const validatedData = await this.validateAndMigrate(rawData);
    this.data = validatedData;

    logger.debug('Successfully loaded todo data from file', {
      todoCount: this.data.todos.length
    });
  }

  /**
   * Save todo data to JSON file
   */
  private async saveToFile(): Promise<void> {
    try {
      // Update metadata before saving
      this.updateMetadata();

      const jsonData = JSON.stringify(this.data, null, 2);

      // Use retry logic for file writes
      await RetryHandler.withRetry(
        () => fs.writeFile(this.filePath, jsonData, 'utf-8'),
        3,
        500
      );

      logger.debug('Successfully saved todo data to file', {
        todoCount: this.data.todos.length
      });
    } catch (error) {
      throw new FileError(
        `Failed to save todos to file: ${(error as Error).message}`,
        'write',
        this.filePath,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Validate and migrate data from older versions
   */
  private async validateAndMigrate(rawData: any): Promise<TodoList> {
    try {
      // Try to validate with current schema
      return TodoListSchema.parse(rawData);
    } catch (validationError) {
      logger.warn('Data validation failed, attempting migration', {
        error: validationError instanceof Error ? validationError.message : String(validationError)
      });

      // Attempt migration from older versions
      return await this.migrateData(rawData);
    }
  }

  /**
   * Migrate data from older versions
   */
  private async migrateData(rawData: any): Promise<TodoList> {
    logger.info('Attempting data migration', { dataType: typeof rawData, isArray: Array.isArray(rawData) });

    // Handle migration from version 0.x (simple array format)
    if (Array.isArray(rawData)) {
      try {
        const migratedData: TodoList = {
          todos: rawData.map((todo: any) => ({
            id: todo.id || TodoUtils.generateId(),
            title: todo.title || 'Untitled',
            description: todo.description || '',
            completed: Boolean(todo.completed),
            createdAt: todo.createdAt || TodoUtils.getCurrentTimestamp(),
            updatedAt: todo.updatedAt || TodoUtils.getCurrentTimestamp(),
            dueDate: todo.dueDate || undefined,
            priority: todo.priority || 'medium',
            tags: Array.isArray(todo.tags) ? todo.tags : []
          })),
          metadata: {
            version: '1.0.0',
            lastModified: TodoUtils.getCurrentTimestamp(),
            totalCount: rawData.length,
            completedCount: rawData.filter((todo: any) => todo.completed).length
          }
        };

        // Save migrated data
        this.data = migratedData;
        await this.saveToFile();
        logger.info('Successfully migrated todo data from array format to version 1.0.0');

        return migratedData;
      } catch (error) {
        throw new ValidationError(
          'Failed to migrate array format data',
          { originalDataLength: rawData.length },
        );
      }
    }

    // Handle migration from version without metadata
    if (rawData.todos && !rawData.metadata) {
      try {
        const migratedData: TodoList = {
          todos: rawData.todos,
          metadata: {
            version: '1.0.0',
            lastModified: TodoUtils.getCurrentTimestamp(),
            totalCount: rawData.todos.length,
            completedCount: rawData.todos.filter((todo: any) => todo.completed).length
          }
        };

        this.data = migratedData;
        await this.saveToFile();
        logger.info('Successfully added metadata to todo data');

        return migratedData;
      } catch (error) {
        throw new ValidationError(
          'Failed to add metadata to existing todo data',
          { todoCount: rawData.todos?.length }
        );
      }
    }

    // If we can't migrate, throw error
    throw new ValidationError(
      'Unable to migrate todo data - unsupported format',
      {
        dataType: typeof rawData,
        hasKeys: typeof rawData === 'object' ? Object.keys(rawData) : undefined
      }
    );
  }

  /**
   * Update metadata with current statistics
   */
  private updateMetadata(): void {
    const stats = TodoUtils.getStats(this.data.todos);
    this.data.metadata = {
      ...this.data.metadata,
      lastModified: TodoUtils.getCurrentTimestamp(),
      totalCount: stats.total,
      completedCount: stats.completed
    };
  }

  /**
   * Get all todos
   */
  async getAllTodos(): Promise<Todo[]> {
    this.ensureInitialized();
    return [...this.data.todos];
  }

  /**
   * Get todo by ID
   */
  async getTodoById(id: string): Promise<Todo | null> {
    this.ensureInitialized();
    return this.data.todos.find(todo => todo.id === id) || null;
  }

  /**
   * Add a new todo
   */
  async addTodo(todo: Todo): Promise<Todo> {
    this.ensureInitialized();

    // Validate todo data
    try {
      TodoUtils.validateTodo(todo);
    } catch (error) {
      throw new ValidationError(
        'Invalid todo data',
        { todoId: todo.id, validationError: error instanceof Error ? error.message : String(error) }
      );
    }

    // Ensure unique ID
    if (this.data.todos.some(existing => existing.id === todo.id)) {
      throw new ValidationError(
        `Todo with ID ${todo.id} already exists`,
        { todoId: todo.id }
      );
    }

    this.data.todos.push(todo);
    await this.saveToFile();

    logger.debug('Added new todo', { todoId: todo.id, title: todo.title });
    return todo;
  }

  /**
   * Update an existing todo
   */
  async updateTodo(id: string, updates: Partial<Omit<Todo, 'id'>>): Promise<Todo> {
    this.ensureInitialized();

    const todoIndex = this.data.todos.findIndex(todo => todo.id === id);
    if (todoIndex === -1) {
      throw new NotFoundError('todo', id);
    }

    const existingTodo = this.data.todos[todoIndex];
    const updatedTodo = TodoUtils.updateTodo(existingTodo, updates);

    // Validate updated todo
    try {
      TodoUtils.validateTodo(updatedTodo);
    } catch (error) {
      throw new ValidationError(
        'Updated todo data is invalid',
        {
          todoId: id,
          updates: Object.keys(updates),
          validationError: error instanceof Error ? error.message : String(error)
        }
      );
    }

    this.data.todos[todoIndex] = updatedTodo;
    await this.saveToFile();

    logger.debug('Updated todo', { todoId: id, updates: Object.keys(updates) });
    return updatedTodo;
  }

  /**
   * Delete a todo
   */
  async deleteTodo(id: string): Promise<boolean> {
    this.ensureInitialized();

    const todoIndex = this.data.todos.findIndex(todo => todo.id === id);
    if (todoIndex === -1) {
      return false;
    }

    this.data.todos.splice(todoIndex, 1);
    await this.saveToFile();
    return true;
  }

  /**
   * Get todo list with metadata
   */
  async getTodoList(): Promise<TodoList> {
    this.ensureInitialized();
    this.updateMetadata();
    return { ...this.data };
  }

  /**
   * Clear all todos (for testing/reset)
   */
  async clearAllTodos(): Promise<void> {
    this.ensureInitialized();
    this.data.todos = [];
    await this.saveToFile();
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{ total: number; completed: number; overdue: number; byPriority: Record<string, number> }> {
    this.ensureInitialized();
    return TodoUtils.getStats(this.data.todos);
  }

  /**
   * Backup current data to a backup file
   */
  async createBackup(): Promise<string> {
    this.ensureInitialized();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = this.filePath.replace('.json', `_backup_${timestamp}.json`);

    try {
      const jsonData = JSON.stringify(this.data, null, 2);
      await fs.writeFile(backupPath, jsonData, 'utf-8');
      return backupPath;
    } catch (error) {
      throw new Error(`Failed to create backup: ${(error as Error).message}`);
    }
  }

  /**
   * Restore data from a backup file
   */
  async restoreFromBackup(backupPath: string): Promise<void> {
    try {
      const fileContent = await fs.readFile(backupPath, 'utf-8');
      const rawData = JSON.parse(fileContent);

      const validatedData = await this.validateAndMigrate(rawData);
      this.data = validatedData;
      await this.saveToFile();
    } catch (error) {
      throw new Error(`Failed to restore from backup: ${(error as Error).message}`);
    }
  }

  /**
   * Ensure storage is initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new StorageError('Storage not initialized. Call initialize() first.');
    }
  }

  /**
   * Get file path for debugging
   */
  getFilePath(): string {
    return this.filePath;
  }
}

// Export a default instance
export const defaultTodoStorage = new TodoStorage();