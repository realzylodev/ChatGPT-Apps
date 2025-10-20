"""
JSON file-based storage system for todos
Handles reading, writing, and managing todo data persistence
"""

import json
import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict, Any
from uuid import uuid4

import sys
import os
sys.path.append(os.path.dirname(__file__))

from todo_types import Todo, TodoList, TodoMetadata, CreateTodoInput, UpdateTodoInput
from errors import (
    StorageError, FileError, NotFoundError, ValidationError,
    RetryHandler, logger
)


class TodoStorage:
    """JSON file-based storage for todo data with migration and error handling"""
    
    def __init__(self, file_path: str = "./todos.json"):
        self.file_path = Path(file_path)
        self.data: TodoList = TodoList()
        self.is_initialized = False

    async def initialize(self) -> None:
        """Initialize storage - create file if it doesn't exist, load existing data"""
        try:
            logger.info(f"Initializing todo storage at {self.file_path}")
            
            # Ensure directory exists
            self.file_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Try to load existing data with retry logic
            await RetryHandler.with_retry(
                lambda: self._load_from_file(),
                max_retries=3,
                delay_ms=1000
            )
            
            self.is_initialized = True
            logger.info("Todo storage initialized successfully")
        except FileNotFoundError:
            # File doesn't exist, create with default data
            try:
                await self._save_to_file()
                self.is_initialized = True
                logger.info("Created new todo storage file")
            except Exception as save_error:
                raise FileError(
                    "Failed to create initial storage file",
                    "write",
                    str(self.file_path),
                    save_error
                )
        except Exception as e:
            raise StorageError(f"Failed to initialize storage: {str(e)}", e)

    async def _load_from_file(self) -> None:
        """Load todo data from JSON file"""
        try:
            with open(self.file_path, 'r', encoding='utf-8') as f:
                file_content = f.read()
            
            try:
                raw_data = json.loads(file_content)
            except json.JSONDecodeError as parse_error:
                raise FileError(
                    "Invalid JSON in storage file",
                    "read",
                    str(self.file_path),
                    parse_error
                )
            
            # Validate and migrate data if necessary
            validated_data = await self._validate_and_migrate(raw_data)
            self.data = validated_data
            
            logger.debug(f"Successfully loaded todo data from file", extra={
                "todo_count": len(self.data.todos)
            })
        except FileNotFoundError:
            raise  # Re-raise to handle in initialize
        except Exception as e:
            raise FileError(
                f"Failed to load todos from file: {str(e)}",
                "read",
                str(self.file_path),
                e
            )

    async def _save_to_file(self) -> None:
        """Save todo data to JSON file"""
        try:
            # Update metadata before saving
            self._update_metadata()
            
            # Use retry logic for file writes
            await RetryHandler.with_retry(
                lambda: self._write_file_sync(),
                max_retries=3,
                delay_ms=500
            )
            
            logger.debug(f"Successfully saved todo data to file", extra={
                "todo_count": len(self.data.todos)
            })
        except Exception as e:
            raise FileError(
                f"Failed to save todos to file: {str(e)}",
                "write",
                str(self.file_path),
                e
            )
    
    def _write_file_sync(self) -> None:
        """Synchronous file write helper"""
        with open(self.file_path, 'w', encoding='utf-8') as f:
            json.dump(self.data.model_dump(), f, indent=2, ensure_ascii=False)

    async def _validate_and_migrate(self, raw_data: Any) -> TodoList:
        """Validate and migrate data from older versions"""
        try:
            # Try to validate with current schema
            return TodoList.model_validate(raw_data)
        except Exception as validation_error:
            logger.warning(f"Data validation failed, attempting migration", extra={
                "error": str(validation_error)
            })
            
            # Attempt migration from older versions
            return await self._migrate_data(raw_data)

    async def _migrate_data(self, raw_data: Any) -> TodoList:
        """Migrate data from older versions"""
        logger.info(f"Attempting data migration", extra={
            "data_type": type(raw_data).__name__,
            "is_list": isinstance(raw_data, list)
        })
        
        # Handle migration from version 0.x (simple array format)
        if isinstance(raw_data, list):
            try:
                migrated_todos = []
                for todo_data in raw_data:
                    migrated_todo = Todo(
                        id=todo_data.get('id', str(uuid4())),
                        title=todo_data.get('title', 'Untitled'),
                        description=todo_data.get('description', ''),
                        completed=bool(todo_data.get('completed', False)),
                        created_at=todo_data.get('created_at', datetime.now().isoformat()),
                        updated_at=todo_data.get('updated_at', datetime.now().isoformat()),
                        due_date=todo_data.get('due_date'),
                        priority=todo_data.get('priority', 'medium'),
                        tags=todo_data.get('tags', [])
                    )
                    migrated_todos.append(migrated_todo)

                migrated_data = TodoList(
                    todos=migrated_todos,
                    metadata=TodoMetadata(
                        total_count=len(migrated_todos),
                        completed_count=sum(1 for todo in migrated_todos if todo.completed)
                    )
                )

                # Save migrated data
                self.data = migrated_data
                await self._save_to_file()
                logger.info("Successfully migrated todo data from array format to version 1.0.0")
                
                return migrated_data
            except Exception as e:
                raise ValidationError(
                    "Failed to migrate array format data",
                    {"original_data_length": len(raw_data)}
                )

        # Handle migration from version without metadata
        if isinstance(raw_data, dict) and 'todos' in raw_data and 'metadata' not in raw_data:
            try:
                todos = [Todo.model_validate(todo) for todo in raw_data['todos']]
                migrated_data = TodoList(
                    todos=todos,
                    metadata=TodoMetadata(
                        total_count=len(todos),
                        completed_count=sum(1 for todo in todos if todo.completed)
                    )
                )

                self.data = migrated_data
                await self._save_to_file()
                logger.info("Successfully added metadata to todo data")
                
                return migrated_data
            except Exception as e:
                raise ValidationError(
                    "Failed to add metadata to existing todo data",
                    {"todo_count": len(raw_data.get('todos', []))}
                )

        # If we can't migrate, raise error
        raise ValidationError(
            "Unable to migrate todo data - unsupported format",
            {
                "data_type": type(raw_data).__name__,
                "has_keys": list(raw_data.keys()) if isinstance(raw_data, dict) else None
            }
        )

    def _update_metadata(self) -> None:
        """Update metadata with current statistics"""
        stats = self._get_stats_internal()
        self.data.metadata.last_modified = datetime.now().isoformat()
        self.data.metadata.total_count = stats['total']
        self.data.metadata.completed_count = stats['completed']

    def _get_stats_internal(self) -> Dict[str, Any]:
        """Get internal statistics"""
        todos = self.data.todos
        stats = {
            'total': len(todos),
            'completed': sum(1 for todo in todos if todo.completed),
            'overdue': 0,
            'by_priority': {'low': 0, 'medium': 0, 'high': 0}
        }

        for todo in todos:
            # Count overdue todos
            if (todo.due_date and 
                datetime.fromisoformat(todo.due_date.replace('Z', '+00:00')).date() < datetime.now().date() and 
                not todo.completed):
                stats['overdue'] += 1
            
            # Count by priority
            stats['by_priority'][todo.priority] += 1

        return stats

    async def get_all_todos(self) -> List[Todo]:
        """Get all todos"""
        self._ensure_initialized()
        return list(self.data.todos)

    async def get_todo_by_id(self, todo_id: str) -> Optional[Todo]:
        """Get todo by ID"""
        self._ensure_initialized()
        for todo in self.data.todos:
            if todo.id == todo_id:
                return todo
        return None

    async def add_todo(self, todo: Todo) -> Todo:
        """Add a new todo"""
        self._ensure_initialized()
        
        # Validate todo data
        try:
            Todo.model_validate(todo.model_dump())
        except Exception as e:
            raise ValidationError(
                "Invalid todo data",
                {"todo_id": todo.id, "validation_error": str(e)}
            )
        
        # Ensure unique ID
        if any(existing.id == todo.id for existing in self.data.todos):
            raise ValidationError(
                f"Todo with ID {todo.id} already exists",
                {"todo_id": todo.id}
            )

        self.data.todos.append(todo)
        await self._save_to_file()
        
        logger.debug(f"Added new todo", extra={"todo_id": todo.id, "title": todo.title})
        return todo

    async def update_todo(self, todo_id: str, updates: Dict[str, Any]) -> Todo:
        """Update an existing todo"""
        self._ensure_initialized()
        
        todo_index = None
        for i, todo in enumerate(self.data.todos):
            if todo.id == todo_id:
                todo_index = i
                break
        
        if todo_index is None:
            raise NotFoundError("todo", todo_id)

        existing_todo = self.data.todos[todo_index]
        
        # Create updated todo with new timestamp
        update_data = existing_todo.model_dump()
        update_data.update(updates)
        update_data['updated_at'] = datetime.now().isoformat()
        
        # Validate updated todo
        try:
            updated_todo = Todo.model_validate(update_data)
        except Exception as e:
            raise ValidationError(
                "Updated todo data is invalid",
                {
                    "todo_id": todo_id,
                    "updates": list(updates.keys()),
                    "validation_error": str(e)
                }
            )
        
        self.data.todos[todo_index] = updated_todo
        
        await self._save_to_file()
        
        logger.debug(f"Updated todo", extra={"todo_id": todo_id, "updates": list(updates.keys())})
        return updated_todo

    async def delete_todo(self, todo_id: str) -> bool:
        """Delete a todo"""
        self._ensure_initialized()
        
        for i, todo in enumerate(self.data.todos):
            if todo.id == todo_id:
                del self.data.todos[i]
                await self._save_to_file()
                return True
        
        return False

    async def get_todo_list(self) -> TodoList:
        """Get todo list with metadata"""
        self._ensure_initialized()
        self._update_metadata()
        return self.data.model_copy(deep=True)

    async def clear_all_todos(self) -> None:
        """Clear all todos (for testing/reset)"""
        self._ensure_initialized()
        self.data.todos = []
        await self._save_to_file()

    async def get_stats(self) -> Dict[str, Any]:
        """Get storage statistics"""
        self._ensure_initialized()
        return self._get_stats_internal()

    async def create_backup(self) -> str:
        """Backup current data to a backup file"""
        self._ensure_initialized()
        
        timestamp = datetime.now().isoformat().replace(':', '-').replace('.', '-')
        backup_path = self.file_path.with_name(f"{self.file_path.stem}_backup_{timestamp}.json")
        
        try:
            shutil.copy2(self.file_path, backup_path)
            return str(backup_path)
        except Exception as e:
            raise RuntimeError(f"Failed to create backup: {str(e)}")

    async def restore_from_backup(self, backup_path: str) -> None:
        """Restore data from a backup file"""
        try:
            with open(backup_path, 'r', encoding='utf-8') as f:
                raw_data = json.load(f)
            
            validated_data = await self._validate_and_migrate(raw_data)
            self.data = validated_data
            await self._save_to_file()
        except Exception as e:
            raise RuntimeError(f"Failed to restore from backup: {str(e)}")

    def _ensure_initialized(self) -> None:
        """Ensure storage is initialized"""
        if not self.is_initialized:
            raise StorageError("Storage not initialized. Call initialize() first.")

    def get_file_path(self) -> str:
        """Get file path for debugging"""
        return str(self.file_path)


# Export a default instance
default_todo_storage = TodoStorage()