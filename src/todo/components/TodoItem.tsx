/**
 * Todo Item Component
 * Individual todo item with checkbox, content, and actions
 * Supports drag and drop reordering and inline editing
 */

import React, { useState, useRef, useEffect } from 'react';
import type { Todo, TodoPriority } from '../types';
import type { DisplayMode } from '../../types';
import { TodoUtils } from '../types';

interface TodoItemProps {
  todo: Todo;
  onToggleComplete: (id: string) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (id: string) => void;
  onUpdate?: (id: string, updates: Partial<Todo>) => void;
  displayMode: DisplayMode;
  isDragging?: boolean;
  dragHandleProps?: any;
}

export function TodoItem({
  todo,
  onToggleComplete,
  onEdit,
  onDelete,
  onUpdate,
  displayMode,
  isDragging = false,
  dragHandleProps
}: TodoItemProps): React.JSX.Element {
  const [showActions, setShowActions] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [isEditingPriority, setIsEditingPriority] = useState(false);
  const [editTitle, setEditTitle] = useState(todo.title);
  const [editDescription, setEditDescription] = useState(todo.description);
  const [editPriority, setEditPriority] = useState(todo.priority);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const descriptionInputRef = useRef<HTMLTextAreaElement>(null);

  // Update local state when todo prop changes
  useEffect(() => {
    setEditTitle(todo.title);
    setEditDescription(todo.description);
    setEditPriority(todo.priority);
  }, [todo.title, todo.description, todo.priority]);

  // Check if todo is overdue
  const isOverdue = TodoUtils.isOverdue(todo);

  // Handle delete with confirmation
  const handleDelete = () => {
    if (isDeleting) {
      onDelete(todo.id);
    } else {
      setIsDeleting(true);
      // Reset after 3 seconds if not confirmed
      setTimeout(() => setIsDeleting(false), 3000);
    }
  };

  // Handle inline title editing
  const handleTitleEdit = () => {
    setIsEditingTitle(true);
    setEditTitle(todo.title);
    setTimeout(() => titleInputRef.current?.focus(), 0);
  };

  const handleTitleSave = () => {
    const trimmedTitle = editTitle.trim();
    if (trimmedTitle && trimmedTitle !== todo.title && onUpdate) {
      onUpdate(todo.id, { title: trimmedTitle });
    }
    setIsEditingTitle(false);
  };

  const handleTitleCancel = () => {
    setEditTitle(todo.title);
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTitleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleTitleCancel();
    }
  };

  // Handle inline description editing
  const handleDescriptionEdit = () => {
    setIsEditingDescription(true);
    setEditDescription(todo.description);
    setTimeout(() => descriptionInputRef.current?.focus(), 0);
  };

  const handleDescriptionSave = () => {
    const trimmedDescription = editDescription.trim();
    if (trimmedDescription !== todo.description && onUpdate) {
      onUpdate(todo.id, { description: trimmedDescription });
    }
    setIsEditingDescription(false);
  };

  const handleDescriptionCancel = () => {
    setEditDescription(todo.description);
    setIsEditingDescription(false);
  };

  const handleDescriptionKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleDescriptionSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleDescriptionCancel();
    }
  };

  // Handle inline priority editing
  const handlePriorityEdit = () => {
    setIsEditingPriority(true);
  };

  const handlePriorityChange = (newPriority: TodoPriority) => {
    if (newPriority !== todo.priority && onUpdate) {
      onUpdate(todo.id, { priority: newPriority });
    }
    setIsEditingPriority(false);
  };

  const handlePriorityCancel = () => {
    setEditPriority(todo.priority);
    setIsEditingPriority(false);
  };

  // Enhanced checkbox toggle with visual feedback
  const handleToggleComplete = () => {
    onToggleComplete(todo.id);
    // Add a small delay to show the animation
    if (!todo.completed) {
      // Completed animation could be added here
    }
  };

  // Priority color classes
  const priorityColorClass = TodoUtils.getPriorityColor(todo.priority);

  // Due date formatting
  const dueDateDisplay = todo.dueDate ? TodoUtils.formatDueDate(todo.dueDate) : null;

  return (
    <div 
      className={`group relative p-4 transition-all duration-200
                  ${isDragging ? 'opacity-50 scale-95 shadow-lg' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}
                  ${todo.completed ? 'opacity-60' : ''}
                  ${isOverdue ? 'bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 shadow-sm' : ''}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => {
        setShowActions(false);
        setIsDeleting(false);
      }}
    >
      {/* Overdue Badge */}
      {isOverdue && (
        <div className="absolute top-2 right-2 px-2 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 text-xs font-medium rounded-full">
          OVERDUE
        </div>
      )}
      <div className="flex items-start gap-3">
        {/* Drag Handle */}
        {dragHandleProps && (
          <div
            {...dragHandleProps}
            className={`flex-shrink-0 mt-1 cursor-grab active:cursor-grabbing transition-opacity
                       ${showActions ? 'opacity-100' : 'opacity-0'}`}
          >
            <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M7 2a2 2 0 1 1 .001 4.001A2 2 0 0 1 7 2zM7 8a2 2 0 1 1 .001 4.001A2 2 0 0 1 7 8zM7 14a2 2 0 1 1 .001 4.001A2 2 0 0 1 7 14zM13 2a2 2 0 1 1 .001 4.001A2 2 0 0 1 13 2zM13 8a2 2 0 1 1 .001 4.001A2 2 0 0 1 13 8zM13 14a2 2 0 1 1 .001 4.001A2 2 0 0 1 13 14z"/>
            </svg>
          </div>
        )}
        {/* Enhanced Checkbox */}
        <button
          onClick={handleToggleComplete}
          className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center
                      transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                      ${todo.completed 
                        ? 'bg-blue-600 border-blue-600 text-white transform scale-110' 
                        : 'border-gray-300 dark:border-gray-600 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20'}`}
          aria-label={todo.completed ? 'Mark as incomplete' : 'Mark as complete'}
        >
          {todo.completed && (
            <svg className="w-3 h-3 animate-in fade-in duration-200" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title with inline editing */}
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={handleTitleKeyDown}
              className="w-full font-medium text-gray-900 dark:text-gray-100 bg-transparent border-b-2 border-blue-500 
                         focus:outline-none focus:border-blue-600 px-0 py-1"
              autoFocus
            />
          ) : (
            <div 
              className={`font-medium text-gray-900 dark:text-gray-100 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400
                          ${todo.completed ? 'line-through' : ''}`}
              onClick={handleTitleEdit}
              onDoubleClick={handleTitleEdit}
            >
              {todo.title}
            </div>
          )}

          {/* Description with inline editing */}
          {isEditingDescription ? (
            <textarea
              ref={descriptionInputRef}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              onBlur={handleDescriptionSave}
              onKeyDown={handleDescriptionKeyDown}
              className="w-full mt-1 text-sm text-gray-600 dark:text-gray-400 bg-transparent border border-blue-500 rounded px-2 py-1
                         focus:outline-none focus:border-blue-600 resize-none"
              rows={2}
              placeholder="Add a description... (Ctrl+Enter to save, Esc to cancel)"
            />
          ) : (
            <div 
              className={`mt-1 text-sm text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-800 dark:hover:text-gray-200
                          ${todo.completed ? 'line-through' : ''}
                          ${!todo.description ? 'italic opacity-60' : ''}`}
              onClick={handleDescriptionEdit}
              onDoubleClick={handleDescriptionEdit}
            >
              {todo.description || 'Click to add description...'}
            </div>
          )}

          {/* Metadata row */}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            {/* Priority with inline editing */}
            {isEditingPriority ? (
              <select
                value={editPriority}
                onChange={(e) => handlePriorityChange(e.target.value as TodoPriority)}
                onBlur={handlePriorityCancel}
                className="text-xs font-medium border border-blue-500 rounded px-1 py-0.5 bg-white dark:bg-gray-700 
                           focus:outline-none focus:border-blue-600"
                autoFocus
              >
                <option value="low">LOW</option>
                <option value="medium">MEDIUM</option>
                <option value="high">HIGH</option>
              </select>
            ) : (
              <span 
                className={`font-medium cursor-pointer hover:underline ${priorityColorClass}`}
                onClick={handlePriorityEdit}
                title="Click to change priority"
              >
                {todo.priority.toUpperCase()}
              </span>
            )}

            {/* Due Date */}
            {dueDateDisplay && (
              <span className={`${isOverdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                Due: {dueDateDisplay}
                {isOverdue && ' (Overdue)'}
              </span>
            )}

            {/* Tags */}
            {todo.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {todo.tags.slice(0, displayMode === 'fullscreen' ? 10 : 3).map((tag, index) => (
                  <span
                    key={index}
                    className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs"
                  >
                    {tag}
                  </span>
                ))}
                {todo.tags.length > (displayMode === 'fullscreen' ? 10 : 3) && (
                  <span className="text-gray-400 dark:text-gray-500">
                    +{todo.tags.length - (displayMode === 'fullscreen' ? 10 : 3)} more
                  </span>
                )}
              </div>
            )}

            {/* Created/Updated info (only in fullscreen) */}
            {displayMode === 'fullscreen' && (
              <span className="text-gray-400 dark:text-gray-500">
                Created {new Date(todo.createdAt).toLocaleDateString()}
                {todo.updatedAt !== todo.createdAt && (
                  <span> • Updated {new Date(todo.updatedAt).toLocaleDateString()}</span>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className={`flex-shrink-0 flex items-center gap-1 transition-opacity
                        ${showActions ? 'opacity-100' : 'opacity-0'}`}>
          {/* Edit Button */}
          <button
            onClick={() => onEdit(todo)}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 
                       rounded hover:bg-gray-200 dark:hover:bg-gray-700
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            aria-label="Edit todo"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>

          {/* Delete Button */}
          <button
            onClick={handleDelete}
            className={`p-1.5 rounded focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2
                       ${isDeleting 
                         ? 'text-red-600 bg-red-100 dark:bg-red-900/50' 
                         : 'text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
            aria-label={isDeleting ? 'Confirm delete' : 'Delete todo'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Delete confirmation overlay */}
      {isDeleting && (
        <div className="absolute inset-0 bg-red-50 dark:bg-red-900/50 flex items-center justify-center">
          <div className="text-sm text-red-800 dark:text-red-200">
            Click delete again to confirm
          </div>
        </div>
      )}
    </div>
  );
}