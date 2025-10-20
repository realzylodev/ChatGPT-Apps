/**
 * Edit Todo Form Component
 * Form for editing existing todos with validation
 */

import React, { useState, useEffect } from 'react';
import { TodoPriority, UpdateTodoInput, TodoUtils, Todo } from '../types';
import type { DisplayMode } from '../../types';

interface EditTodoFormProps {
  todo: Todo;
  onSubmit: (id: string, updates: UpdateTodoInput) => void;
  onCancel: () => void;
  displayMode: DisplayMode;
}

export function EditTodoForm({
  todo,
  onSubmit,
  onCancel,
  displayMode
}: EditTodoFormProps): React.JSX.Element {
  const [formData, setFormData] = useState<Omit<UpdateTodoInput, 'id'>>({
    title: todo.title,
    description: todo.description,
    priority: todo.priority,
    completed: todo.completed,
    tags: [...todo.tags],
    dueDate: todo.dueDate
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tagInput, setTagInput] = useState('');

  // Update form data when todo changes
  useEffect(() => {
    setFormData({
      title: todo.title,
      description: todo.description,
      priority: todo.priority,
      completed: todo.completed,
      tags: [...todo.tags],
      dueDate: todo.dueDate
    });
  }, [todo]);

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    try {
      const updateData: UpdateTodoInput = { id: todo.id, ...formData };
      TodoUtils.validateUpdateInput(updateData);
    } catch (error: any) {
      if (error.errors) {
        error.errors.forEach((err: any) => {
          newErrors[err.path[0]] = err.message;
        });
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSubmit(todo.id, { id: todo.id, ...formData });
    }
  };

  // Handle tag addition
  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (tag && !formData.tags?.includes(tag) && (formData.tags?.length || 0) < 10) {
      setFormData(prev => ({
        ...prev,
        tags: [...(prev.tags || []), tag]
      }));
      setTagInput('');
    }
  };

  // Handle tag removal
  const handleRemoveTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags?.filter(tag => tag !== tagToRemove) || []
    }));
  };

  // Handle tag input key press
  const handleTagKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const isCompact = displayMode !== 'fullscreen';
  const hasChanges = JSON.stringify(formData) !== JSON.stringify({
    title: todo.title,
    description: todo.description,
    priority: todo.priority,
    completed: todo.completed,
    tags: todo.tags,
    dueDate: todo.dueDate
  });

  return (
    <div className="p-4 h-full overflow-y-auto">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Completion Status */}
        <div className="flex items-center">
          <input
            id="completed"
            type="checkbox"
            checked={formData.completed || false}
            onChange={(e) => setFormData(prev => ({ ...prev, completed: e.target.checked }))}
            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded 
                       focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 
                       focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
          />
          <label htmlFor="completed" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            Mark as completed
          </label>
        </div>

        {/* Title */}
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Title *
          </label>
          <input
            id="title"
            type="text"
            value={formData.title || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            className={`w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 
                       text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                       ${errors.title ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
            placeholder="What needs to be done?"
            autoFocus
          />
          {errors.title && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.title}</p>
          )}
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Description
          </label>
          <textarea
            id="description"
            value={formData.description || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            rows={isCompact ? 2 : 3}
            className={`w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 
                       text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                       ${errors.description ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
            placeholder="Add more details..."
          />
          {errors.description && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.description}</p>
          )}
        </div>

        {/* Priority and Due Date Row */}
        <div className={`grid gap-4 ${isCompact ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {/* Priority */}
          <div>
            <label htmlFor="priority" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Priority
            </label>
            <select
              id="priority"
              value={formData.priority}
              onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value as TodoPriority }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="low">Low Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="high">High Priority</option>
            </select>
          </div>

          {/* Due Date */}
          <div>
            <label htmlFor="dueDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Due Date
            </label>
            <input
              id="dueDate"
              type="date"
              value={formData.dueDate || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value || undefined }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Tags */}
        <div>
          <label htmlFor="tagInput" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Tags
          </label>
          <div className="flex gap-2 mb-2">
            <input
              id="tagInput"
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyPress={handleTagKeyPress}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                         placeholder-gray-500 dark:placeholder-gray-400
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Add a tag..."
              disabled={(formData.tags?.length || 0) >= 10}
            />
            <button
              type="button"
              onClick={handleAddTag}
              disabled={!tagInput.trim() || (formData.tags?.length || 0) >= 10}
              className="px-3 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 
                         rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>
          
          {/* Tag List */}
          {formData.tags && formData.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {formData.tags.map((tag, index) => (
                <span
                  key={index}
                  className="inline-flex items-center px-2 py-1 bg-blue-100 dark:bg-blue-900 
                             text-blue-800 dark:text-blue-200 text-xs rounded-full"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="ml-1 text-blue-600 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-100"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          
          {errors.tags && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.tags}</p>
          )}
        </div>

        {/* Metadata (read-only) */}
        {displayMode === 'fullscreen' && (
          <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1 pt-2 border-t border-gray-200 dark:border-gray-700">
            <div>Created: {new Date(todo.createdAt).toLocaleString()}</div>
            <div>Last updated: {new Date(todo.updatedAt).toLocaleString()}</div>
            <div>ID: {todo.id}</div>
          </div>
        )}

        {/* Form Actions */}
        <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="submit"
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                       disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!formData.title?.trim() || !hasChanges}
          >
            {hasChanges ? 'Save Changes' : 'No Changes'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 
                       rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100
                       focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}