#!/usr/bin/env python3
"""
Todo MCP Server (Python)
A Model Context Protocol server for todo management with ChatGPT integration.
"""

import asyncio
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4
from datetime import datetime

from fastmcp import FastMCP
from pydantic import BaseModel, ValidationError

import sys
import os
sys.path.append(os.path.dirname(__file__))

from todo_types import (
    Todo, TodoList, CreateTodoInput, UpdateTodoInput, TodoFilter,
    TodoPriority, ErrorResponse
)
from storage import default_todo_storage
from errors import (
    ErrorHandler, logger, TodoError, ValidationError, NotFoundError,
    ErrorCode, RetryHandler
)

# Server configuration
ROOT_DIR = Path(__file__).parent.parent
ASSETS_DIR = ROOT_DIR / "assets"

# Widget configuration
class TodoWidget:
    def __init__(self):
        self.id = "todo-widget"
        self.title = "Todo Management Widget"
        self.template_uri = "ui://widget/todo.html"
        self.invoking = "Managing your todos..."
        self.invoked = "Todo list updated successfully!"
        self.html = self._read_widget_html("todo")
        self.response_text = "Todo list updated successfully!"

    def _read_widget_html(self, component_name: str) -> str:
        """Read widget HTML from assets directory"""
        if not ASSETS_DIR.exists():
            print(f"Widget assets not found at {ASSETS_DIR}. Widget functionality will be limited.")
            return "<div>Todo widget not available - assets not built</div>"

        direct_path = ASSETS_DIR / f"{component_name}.html"
        
        if direct_path.exists():
            return direct_path.read_text(encoding='utf-8')
        
        # Look for versioned files (e.g., todo-abc123.html)
        candidates = [
            f for f in ASSETS_DIR.glob(f"{component_name}-*.html")
        ]
        
        if candidates:
            # Sort and take the latest
            candidates.sort()
            return candidates[-1].read_text(encoding='utf-8')
        
        print(f'Widget HTML for "{component_name}" not found in {ASSETS_DIR}. Using fallback.')
        return "<div>Todo widget loading...</div>"

# Widget metadata type for OpenAI integration
class WidgetMetadata(BaseModel):
    openai_outputTemplate: str = ""
    openai_toolInvocation_invoking: str = ""
    openai_toolInvocation_invoked: str = ""
    openai_widgetAccessible: bool = True
    openai_resultCanProduceWidget: bool = True

    class Config:
        # Allow field names with special characters
        populate_by_name = True
        alias_generator = lambda field_name: field_name.replace('_', '/')

# Initialize widget and MCP server
todo_widget = TodoWidget()
mcp = FastMCP("todo-mcp-server")

def widget_meta(widget: TodoWidget) -> Dict[str, Any]:
    """Generate widget metadata for OpenAI integration"""
    if not widget.template_uri or not widget.invoking or not widget.invoked:
        print('Widget configuration incomplete, some metadata may be missing')
    
    return {
        "openai/outputTemplate": widget.template_uri,
        "openai/toolInvocation/invoking": widget.invoking,
        "openai/toolInvocation/invoked": widget.invoked,
        "openai/widgetAccessible": True,
        "openai/resultCanProduceWidget": True,
    }

def create_structured_content(todos: List[Todo], stats: Dict[str, Any], additional_data: Dict[str, Any] = None) -> Dict[str, Any]:
    """Create structured content for widget with consistent formatting"""
    if additional_data is None:
        additional_data = {}
    
    return {
        "todos": [
            {
                **todo.model_dump(),
                "isOverdue": is_overdue(todo),
            }
            for todo in todos
        ],
        "stats": {
            **stats,
            "timestamp": datetime.now().isoformat(),
        },
        "metadata": {
            "version": "1.0.0",
            "widgetType": "todo-management",
            "lastUpdated": datetime.now().isoformat(),
            "serverType": "python",
        },
        **additional_data,
    }

def create_tool_response(text_content: str, todos: List[Todo], stats: Dict[str, Any], additional_data: Dict[str, Any] = None) -> Dict[str, Any]:
    """Create a standardized tool response with widget metadata"""
    if additional_data is None:
        additional_data = {}
    
    return {
        "content": [
            {
                "type": "text",
                "text": text_content,
            }
        ],
        "structuredContent": create_structured_content(todos, stats, additional_data),
        "_meta": widget_meta(todo_widget),
    }

def is_overdue(todo: Todo) -> bool:
    """Check if a todo is overdue"""
    if not todo.due_date or todo.completed:
        return False
    
    try:
        due_date = datetime.fromisoformat(todo.due_date.replace('Z', '+00:00')).date()
        return due_date < datetime.now().date()
    except (ValueError, AttributeError):
        return False

def filter_todos(todos: List[Todo], filter_params: TodoFilter) -> List[Todo]:
    """Filter todos based on criteria"""
    filtered = []
    
    for todo in todos:
        # Filter by completion status
        if filter_params.completed is not None and todo.completed != filter_params.completed:
            continue
        
        # Filter by priority
        if filter_params.priority and todo.priority != filter_params.priority:
            continue
        
        # Filter by overdue status
        if filter_params.overdue is not None:
            todo_is_overdue = is_overdue(todo)
            if filter_params.overdue != todo_is_overdue:
                continue
        
        # Filter by tags
        if filter_params.tags:
            has_matching_tag = any(tag in todo.tags for tag in filter_params.tags)
            if not has_matching_tag:
                continue
        
        filtered.append(todo)
    
    return filtered

def sort_todos(todos: List[Todo]) -> List[Todo]:
    """Sort todos by priority and due date"""
    priority_order = {'high': 3, 'medium': 2, 'low': 1}
    
    def sort_key(todo: Todo):
        # Completed todos go to bottom
        completed_priority = 1 if todo.completed else 0
        
        # Priority (high to low)
        priority_value = priority_order.get(todo.priority, 2)
        
        # Due date (earliest first, None goes to end)
        due_date_value = 0
        if todo.due_date:
            try:
                due_date_value = datetime.fromisoformat(todo.due_date.replace('Z', '+00:00')).timestamp()
            except (ValueError, AttributeError):
                due_date_value = float('inf')
        else:
            due_date_value = float('inf')
        
        # Creation date (newest first)
        try:
            created_value = -datetime.fromisoformat(todo.created_at.replace('Z', '+00:00')).timestamp()
        except (ValueError, AttributeError):
            created_value = 0
        
        return (completed_priority, -priority_value, due_date_value, created_value)
    
    return sorted(todos, key=sort_key)

def get_stats(todos: List[Todo]) -> Dict[str, Any]:
    """Get todo statistics"""
    stats = {
        'total': len(todos),
        'completed': 0,
        'overdue': 0,
        'by_priority': {'low': 0, 'medium': 0, 'high': 0}
    }
    
    for todo in todos:
        if todo.completed:
            stats['completed'] += 1
        if is_overdue(todo):
            stats['overdue'] += 1
        stats['by_priority'][todo.priority] += 1
    
    return stats

# Initialize storage on startup
async def startup():
    """Initialize the todo storage on server startup"""
    try:
        await default_todo_storage.initialize()
        print("Todo storage initialized successfully")
    except Exception as e:
        print(f"Failed to initialize todo storage: {e}")
        raise

# Tool handlers
@mcp.tool()
async def list_todos(
    completed: Optional[bool] = None,
    priority: Optional[TodoPriority] = None,
    overdue: Optional[bool] = None,
    tags: Optional[List[str]] = None
) -> Dict[str, Any]:
    """List all todos with optional filtering by completion status, priority, or overdue status"""
    request_id = ErrorHandler.generate_request_id()
    
    try:
        logger.debug(f"Handling list-todos request", extra={
            "request_id": request_id,
            "filters": {"completed": completed, "priority": priority, "overdue": overdue, "tags": tags}
        })
        
        # Create filter object
        filter_params = TodoFilter(
            completed=completed,
            priority=priority,
            overdue=overdue,
            tags=tags
        )
        
        # Get all todos from storage
        all_todos = await default_todo_storage.get_all_todos()
        
        # Apply filters
        filtered_todos = filter_todos(all_todos, filter_params)
        
        # Sort todos by priority and due date
        sorted_todos = sort_todos(filtered_todos)
        
        # Get statistics
        stats = get_stats(sorted_todos)
        
        # Format response text
        response_text = f"Found {len(sorted_todos)} todo(s)"
        if stats['completed'] > 0:
            response_text += f" ({stats['completed']} completed)"
        if stats['overdue'] > 0:
            response_text += f" ({stats['overdue']} overdue)"
        
        logger.info(f"Successfully listed todos", extra={
            "request_id": request_id,
            "count": len(sorted_todos),
            "filter": filter_params.model_dump()
        })
        
        return create_tool_response(response_text, sorted_todos, stats, {"filter": filter_params.model_dump()})
    
    except Exception as e:
        return ErrorHandler.create_tool_error_response(e, "list_todos", request_id)

@mcp.tool()
async def create_todo(
    title: str,
    description: Optional[str] = "",
    due_date: Optional[str] = None,
    priority: Optional[TodoPriority] = "medium",
    tags: Optional[List[str]] = None
) -> Dict[str, Any]:
    """Create a new todo item with title, optional description, due date, priority, and tags"""
    request_id = ErrorHandler.generate_request_id()
    
    try:
        logger.debug(f"Handling create-todo request", extra={
            "request_id": request_id,
            "title": title,
            "priority": priority
        })
        
        # Validate input
        input_data = CreateTodoInput(
            title=title,
            description=description or "",
            due_date=due_date,
            priority=priority or "medium",
            tags=tags or []
        )
        
        # Additional business logic validation
        if not input_data.title.strip():
            raise ValidationError("Title cannot be empty", {"field": "title"}, request_id)
        
        # Create new todo
        now = datetime.now().isoformat()
        new_todo = Todo(
            id=str(uuid4()),
            title=input_data.title,
            description=input_data.description,
            completed=False,
            created_at=now,
            updated_at=now,
            due_date=input_data.due_date,
            priority=input_data.priority,
            tags=input_data.tags
        )
        
        # Save to storage
        await default_todo_storage.add_todo(new_todo)
        
        # Get updated list for widget
        all_todos = await default_todo_storage.get_all_todos()
        sorted_todos = sort_todos(all_todos)
        stats = get_stats(sorted_todos)
        
        logger.info(f"Successfully created todo", extra={
            "request_id": request_id,
            "todo_id": new_todo.id,
            "title": new_todo.title
        })
        
        return create_tool_response(
            f'Created todo: "{new_todo.title}"',
            sorted_todos,
            stats,
            {
                "action": "create",
                "createdTodo": new_todo.model_dump()
            }
        )
    
    except Exception as e:
        return ErrorHandler.create_tool_error_response(e, "create_todo", request_id)

@mcp.tool()
async def update_todo(
    id: str,
    title: Optional[str] = None,
    description: Optional[str] = None,
    due_date: Optional[str] = None,
    priority: Optional[TodoPriority] = None,
    completed: Optional[bool] = None,
    tags: Optional[List[str]] = None
) -> Dict[str, Any]:
    """Update an existing todo item by ID with new values for any field"""
    request_id = ErrorHandler.generate_request_id()
    
    try:
        logger.debug(f"Handling update-todo request", extra={
            "request_id": request_id,
            "todo_id": id,
            "updates": {k: v for k, v in locals().items() if k not in ['id', 'request_id'] and v is not None}
        })
        
        # Validate input
        input_data = UpdateTodoInput(
            id=id,
            title=title,
            description=description,
            due_date=due_date,
            priority=priority,
            completed=completed,
            tags=tags
        )
        
        # Check if todo exists before updating
        existing_todo = await default_todo_storage.get_todo_by_id(id)
        if not existing_todo:
            raise NotFoundError("todo", id, request_id)
        
        # Prepare updates (exclude None values and id)
        updates = {k: v for k, v in input_data.model_dump().items() if v is not None and k != 'id'}
        
        # Additional validation for updates
        if 'title' in updates and not updates['title'].strip():
            raise ValidationError("Title cannot be empty", {"field": "title"}, request_id)
        
        # Update todo in storage
        updated_todo = await default_todo_storage.update_todo(id, updates)
        
        # Get updated list for widget
        all_todos = await default_todo_storage.get_all_todos()
        sorted_todos = sort_todos(all_todos)
        stats = get_stats(sorted_todos)
        
        logger.info(f"Successfully updated todo", extra={
            "request_id": request_id,
            "todo_id": id,
            "updates": list(updates.keys())
        })
        
        return create_tool_response(
            f'Updated todo: "{updated_todo.title}"',
            sorted_todos,
            stats,
            {
                "action": "update",
                "updatedTodo": updated_todo.model_dump()
            }
        )
    
    except Exception as e:
        return ErrorHandler.create_tool_error_response(e, "update_todo", request_id)

@mcp.tool()
async def complete_todo(
    id: str,
    completed: bool = True
) -> Dict[str, Any]:
    """Mark a todo as completed or incomplete by ID"""
    request_id = ErrorHandler.generate_request_id()
    
    try:
        logger.debug(f"Handling complete-todo request", extra={
            "request_id": request_id,
            "todo_id": id,
            "completed": completed
        })
        
        if not id:
            raise ValidationError('Todo ID is required and must be a string', {"field": "id"}, request_id)
        
        # Check if todo exists
        existing_todo = await default_todo_storage.get_todo_by_id(id)
        if not existing_todo:
            raise NotFoundError("todo", id, request_id)
        
        # Update completion status
        updated_todo = await default_todo_storage.update_todo(id, {"completed": completed})
        
        # Get updated list for widget
        all_todos = await default_todo_storage.get_all_todos()
        sorted_todos = sort_todos(all_todos)
        stats = get_stats(sorted_todos)
        
        action = 'completed' if completed else 'marked as incomplete'
        
        logger.info(f"Successfully updated todo completion status", extra={
            "request_id": request_id,
            "todo_id": id,
            "completed": completed
        })
        
        return create_tool_response(
            f'Todo "{updated_todo.title}" {action}',
            sorted_todos,
            stats,
            {
                "action": "complete",
                "updatedTodo": updated_todo.model_dump(),
                "completed": completed
            }
        )
    
    except Exception as e:
        return ErrorHandler.create_tool_error_response(e, "complete_todo", request_id)

@mcp.tool()
async def delete_todo(id: str) -> Dict[str, Any]:
    """Delete a todo item by ID"""
    request_id = ErrorHandler.generate_request_id()
    
    try:
        logger.debug(f"Handling delete-todo request", extra={
            "request_id": request_id,
            "todo_id": id
        })
        
        if not id:
            raise ValidationError('Todo ID is required and must be a string', {"field": "id"}, request_id)
        
        # Get todo before deletion for response
        todo_to_delete = await default_todo_storage.get_todo_by_id(id)
        if not todo_to_delete:
            raise NotFoundError("todo", id, request_id)
        
        # Delete todo
        deleted = await default_todo_storage.delete_todo(id)
        if not deleted:
            raise TodoError(
                f'Failed to delete todo with ID {id}',
                ErrorCode.STORAGE_ERROR,
                {"todo_id": id},
                request_id
            )
        
        # Get updated list for widget
        all_todos = await default_todo_storage.get_all_todos()
        sorted_todos = sort_todos(all_todos)
        stats = get_stats(sorted_todos)
        
        logger.info(f"Successfully deleted todo", extra={
            "request_id": request_id,
            "todo_id": id,
            "title": todo_to_delete.title
        })
        
        return create_tool_response(
            f'Deleted todo: "{todo_to_delete.title}"',
            sorted_todos,
            stats,
            {
                "action": "delete",
                "deletedTodo": todo_to_delete.model_dump()
            }
        )
    
    except Exception as e:
        return ErrorHandler.create_tool_error_response(e, "delete_todo", request_id)

# Resource handlers
def read_static_asset(filename: str) -> Optional[Dict[str, str]]:
    """Read static asset file from assets directory"""
    if not ASSETS_DIR.exists():
        print(f"Widget assets not found at {ASSETS_DIR}. Static assets not available.")
        return None

    # Try direct path first
    asset_path = ASSETS_DIR / filename
    
    if not asset_path.exists():
        # Look for versioned files (e.g., todo-abc123.js, todo-abc123.css)
        base_name = asset_path.stem
        extension = asset_path.suffix
        
        candidates = list(ASSETS_DIR.glob(f"{base_name}-*{extension}"))
        
        if candidates:
            # Sort and take the latest
            candidates.sort()
            asset_path = candidates[-1]
        else:
            print(f'Static asset "{filename}" not found in {ASSETS_DIR}')
            return None

    try:
        content = asset_path.read_text(encoding='utf-8')
        
        # Determine MIME type based on file extension
        extension = asset_path.suffix.lower()
        mime_types = {
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.html': 'text/html',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon'
        }
        
        mime_type = mime_types.get(extension, 'application/octet-stream')
        
        return {"content": content, "mimeType": mime_type}
    
    except Exception as e:
        print(f'Error reading static asset "{filename}": {e}')
        return None

@mcp.resource("ui://widget/todo.html")
async def get_todo_widget_template() -> str:
    """Serve the todo widget HTML template"""
    return todo_widget.html

@mcp.resource("ui://data/todos.json")
async def get_todo_data() -> str:
    """Serve current todo data for widget hydration"""
    try:
        # Get current todo data for widget hydration
        all_todos = await default_todo_storage.get_all_todos()
        sorted_todos = sort_todos(all_todos)
        stats = get_stats(sorted_todos)
        
        todo_data = {
            "todos": [todo.model_dump() for todo in sorted_todos],
            "stats": stats,
            "timestamp": datetime.now().isoformat(),
        }
        
        return json.dumps(todo_data, indent=2)
    
    except Exception as e:
        print(f"Error serving todo data: {e}")
        return json.dumps({"error": f"Failed to load todo data: {str(e)}"})

@mcp.resource("ui://assets/todo.js")
async def get_todo_js() -> str:
    """Serve todo widget JavaScript bundle"""
    asset = read_static_asset("todo.js")
    if not asset:
        raise ValueError("Todo JavaScript bundle not found")
    return asset["content"]

@mcp.resource("ui://assets/todo.css")
async def get_todo_css() -> str:
    """Serve todo widget CSS styles"""
    asset = read_static_asset("todo.css")
    if not asset:
        raise ValueError("Todo CSS styles not found")
    return asset["content"]

# Dynamic asset handler for other files
@mcp.resource("ui://assets/{filename}")
async def get_dynamic_asset(filename: str) -> str:
    """Serve dynamic widget assets"""
    asset = read_static_asset(filename)
    if not asset:
        raise ValueError(f'Static asset "{filename}" not found')
    return asset["content"]

if __name__ == "__main__":
    # Initialize storage before running
    import asyncio
    asyncio.run(startup())
    
    # Run the FastMCP server
    mcp.run()