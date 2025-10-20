/**
 * Client-side storage utilities for todo widget
 * Handles local storage and communication with MCP server
 */

import { Todo, CreateTodoInput, UpdateTodoInput, TodoFilter, TodoUtils } from './types.js';

export interface StorageConfig {
  serverUrl?: string;
  enableLocalStorage?: boolean;
  localStorageKey?: string;
}

export class TodoClientStorage {
  private config: StorageConfig;
  private cache: Todo[] = [];
  private isOnline = true;

  constructor(config: StorageConfig = {}) {
    this.config = {
      serverUrl: config.serverUrl || '/api/todos',
      enableLocalStorage: config.enableLocalStorage ?? true,
      localStorageKey: config.localStorageKey || 'todo-widget-cache'
    };

    // Load from local storage on initialization
    if (this.config.enableLocalStorage) {
      this.loadFromLocalStorage();
    }

    // Listen for online/offline events
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.syncWithServer();
      });
      
      window.addEventListener('offline', () => {
        this.isOnline = false;
      });
    }
  }

  /**
   * Get all todos with optional filtering
   */
  async getAllTodos(filter?: TodoFilter): Promise<Todo[]> {
    try {
      if (this.isOnline) {
        // Try to fetch from server
        const todos = await this.fetchFromServer();
        this.cache = todos;
        this.saveToLocalStorage();
        
        return filter ? TodoUtils.filterTodos(todos, filter) : todos;
      } else {
        // Use cached data when offline
        return filter ? TodoUtils.filterTodos(this.cache, filter) : this.cache;
      }
    } catch (error) {
      console.warn('Failed to fetch from server, using cache:', error);
      return filter ? TodoUtils.filterTodos(this.cache, filter) : this.cache;
    }
  }

  /**
   * Get todo by ID
   */
  async getTodoById(id: string): Promise<Todo | null> {
    const todos = await this.getAllTodos();
    return todos.find(todo => todo.id === id) || null;
  }

  /**
   * Create a new todo
   */
  async createTodo(input: CreateTodoInput): Promise<Todo> {
    try {
      if (this.isOnline) {
        const todo = await this.createOnServer(input);
        this.addToCache(todo);
        this.saveToLocalStorage();
        return todo;
      } else {
        // Create locally when offline
        const todo = this.createLocalTodo(input);
        this.addToCache(todo);
        this.saveToLocalStorage();
        this.markForSync(todo.id, 'create');
        return todo;
      }
    } catch (error) {
      // Fallback to local creation
      const todo = this.createLocalTodo(input);
      this.addToCache(todo);
      this.saveToLocalStorage();
      this.markForSync(todo.id, 'create');
      return todo;
    }
  }

  /**
   * Update an existing todo
   */
  async updateTodo(id: string, updates: Omit<UpdateTodoInput, 'id'>): Promise<Todo> {
    try {
      if (this.isOnline) {
        const todo = await this.updateOnServer(id, updates);
        this.updateInCache(todo);
        this.saveToLocalStorage();
        return todo;
      } else {
        // Update locally when offline
        const todo = this.updateInCache({ id, ...updates } as UpdateTodoInput);
        this.saveToLocalStorage();
        this.markForSync(id, 'update');
        return todo;
      }
    } catch (error) {
      // Fallback to local update
      const todo = this.updateInCache({ id, ...updates } as UpdateTodoInput);
      this.saveToLocalStorage();
      this.markForSync(id, 'update');
      return todo;
    }
  }

  /**
   * Delete a todo
   */
  async deleteTodo(id: string): Promise<boolean> {
    try {
      if (this.isOnline) {
        const success = await this.deleteOnServer(id);
        if (success) {
          this.removeFromCache(id);
          this.saveToLocalStorage();
        }
        return success;
      } else {
        // Delete locally when offline
        const success = this.removeFromCache(id);
        this.saveToLocalStorage();
        if (success) {
          this.markForSync(id, 'delete');
        }
        return success;
      }
    } catch (error) {
      // Fallback to local deletion
      const success = this.removeFromCache(id);
      this.saveToLocalStorage();
      if (success) {
        this.markForSync(id, 'delete');
      }
      return success;
    }
  }

  /**
   * Get todo statistics
   */
  async getStats(): Promise<{ total: number; completed: number; overdue: number; byPriority: Record<string, number> }> {
    const todos = await this.getAllTodos();
    return TodoUtils.getStats(todos);
  }

  /**
   * Clear all todos
   */
  async clearAllTodos(): Promise<void> {
    this.cache = [];
    this.saveToLocalStorage();
    
    if (this.isOnline) {
      try {
        await this.clearOnServer();
      } catch (error) {
        console.warn('Failed to clear on server:', error);
      }
    }
  }

  /**
   * Sync with server when coming back online
   */
  private async syncWithServer(): Promise<void> {
    if (!this.config.enableLocalStorage) return;

    try {
      const pendingSync = this.getPendingSync();
      
      for (const { id, action } of pendingSync) {
        try {
          switch (action) {
            case 'create':
              const todo = this.cache.find(t => t.id === id);
              if (todo) {
                await this.createOnServer({
                  title: todo.title,
                  description: todo.description,
                  dueDate: todo.dueDate,
                  priority: todo.priority,
                  tags: todo.tags
                });
              }
              break;
            case 'update':
              const updateTodo = this.cache.find(t => t.id === id);
              if (updateTodo) {
                await this.updateOnServer(id, {
                  title: updateTodo.title,
                  description: updateTodo.description,
                  dueDate: updateTodo.dueDate,
                  priority: updateTodo.priority,
                  completed: updateTodo.completed,
                  tags: updateTodo.tags
                });
              }
              break;
            case 'delete':
              await this.deleteOnServer(id);
              break;
          }
        } catch (error) {
          console.warn(`Failed to sync ${action} for todo ${id}:`, error);
        }
      }

      // Clear pending sync after successful sync
      this.clearPendingSync();
      
      // Refresh cache from server
      const serverTodos = await this.fetchFromServer();
      this.cache = serverTodos;
      this.saveToLocalStorage();
    } catch (error) {
      console.warn('Failed to sync with server:', error);
    }
  }

  // Private helper methods

  private createLocalTodo(input: CreateTodoInput): Todo {
    const now = new Date().toISOString();
    return {
      id: this.generateLocalId(),
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

  private generateLocalId(): string {
    return `local_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private addToCache(todo: Todo): void {
    const existingIndex = this.cache.findIndex(t => t.id === todo.id);
    if (existingIndex >= 0) {
      this.cache[existingIndex] = todo;
    } else {
      this.cache.push(todo);
    }
  }

  private updateInCache(updates: UpdateTodoInput): Todo {
    const todoIndex = this.cache.findIndex(t => t.id === updates.id);
    if (todoIndex === -1) {
      throw new Error(`Todo with ID ${updates.id} not found in cache`);
    }

    const existingTodo = this.cache[todoIndex];
    const updatedTodo = {
      ...existingTodo,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    this.cache[todoIndex] = updatedTodo;
    return updatedTodo;
  }

  private removeFromCache(id: string): boolean {
    const todoIndex = this.cache.findIndex(t => t.id === id);
    if (todoIndex === -1) {
      return false;
    }

    this.cache.splice(todoIndex, 1);
    return true;
  }

  private loadFromLocalStorage(): void {
    if (!this.config.enableLocalStorage || typeof localStorage === 'undefined') return;

    try {
      const cached = localStorage.getItem(this.config.localStorageKey!);
      if (cached) {
        this.cache = JSON.parse(cached);
      }
    } catch (error) {
      console.warn('Failed to load from localStorage:', error);
    }
  }

  private saveToLocalStorage(): void {
    if (!this.config.enableLocalStorage || typeof localStorage === 'undefined') return;

    try {
      localStorage.setItem(this.config.localStorageKey!, JSON.stringify(this.cache));
    } catch (error) {
      console.warn('Failed to save to localStorage:', error);
    }
  }

  private markForSync(id: string, action: 'create' | 'update' | 'delete'): void {
    if (!this.config.enableLocalStorage || typeof localStorage === 'undefined') return;

    try {
      const pendingKey = `${this.config.localStorageKey}_pending`;
      const pending = JSON.parse(localStorage.getItem(pendingKey) || '[]');
      
      // Remove existing entry for this ID
      const filtered = pending.filter((item: any) => item.id !== id);
      
      // Add new entry
      filtered.push({ id, action });
      
      localStorage.setItem(pendingKey, JSON.stringify(filtered));
    } catch (error) {
      console.warn('Failed to mark for sync:', error);
    }
  }

  private getPendingSync(): Array<{ id: string; action: 'create' | 'update' | 'delete' }> {
    if (!this.config.enableLocalStorage || typeof localStorage === 'undefined') return [];

    try {
      const pendingKey = `${this.config.localStorageKey}_pending`;
      return JSON.parse(localStorage.getItem(pendingKey) || '[]');
    } catch (error) {
      console.warn('Failed to get pending sync:', error);
      return [];
    }
  }

  private clearPendingSync(): void {
    if (!this.config.enableLocalStorage || typeof localStorage === 'undefined') return;

    try {
      const pendingKey = `${this.config.localStorageKey}_pending`;
      localStorage.removeItem(pendingKey);
    } catch (error) {
      console.warn('Failed to clear pending sync:', error);
    }
  }

  // Server communication methods (to be implemented based on MCP protocol)

  private async fetchFromServer(): Promise<Todo[]> {
    // This would be implemented to communicate with the MCP server
    // For now, return empty array as placeholder
    return [];
  }

  private async createOnServer(_input: CreateTodoInput): Promise<Todo> {
    // This would be implemented to communicate with the MCP server
    throw new Error('Server communication not implemented');
  }

  private async updateOnServer(_id: string, _updates: Omit<UpdateTodoInput, 'id'>): Promise<Todo> {
    // This would be implemented to communicate with the MCP server
    throw new Error('Server communication not implemented');
  }

  private async deleteOnServer(_id: string): Promise<boolean> {
    // This would be implemented to communicate with the MCP server
    throw new Error('Server communication not implemented');
  }

  private async clearOnServer(): Promise<void> {
    // This would be implemented to communicate with the MCP server
    throw new Error('Server communication not implemented');
  }
}

// Export a default instance
export const defaultTodoClientStorage = new TodoClientStorage();