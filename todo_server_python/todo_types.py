"""
Server-side Todo data models and interfaces
Shared types for the Python MCP server using Pydantic
"""

from typing import Optional, List, Literal, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime

TodoPriority = Literal['low', 'medium', 'high']

class Todo(BaseModel):
    id: str
    title: str
    description: str = ""
    completed: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    due_date: Optional[str] = None  # ISO date string
    priority: TodoPriority = 'medium'
    tags: List[str] = Field(default_factory=list)

class TodoMetadata(BaseModel):
    version: str = "1.0.0"
    last_modified: str = Field(default_factory=lambda: datetime.now().isoformat())
    total_count: int = 0
    completed_count: int = 0

class TodoList(BaseModel):
    todos: List[Todo] = Field(default_factory=list)
    metadata: TodoMetadata = Field(default_factory=TodoMetadata)

# Input models for MCP tool calls
class CreateTodoInput(BaseModel):
    title: str
    description: Optional[str] = ""
    due_date: Optional[str] = None  # ISO date string
    priority: Optional[TodoPriority] = 'medium'
    tags: Optional[List[str]] = Field(default_factory=list)

class UpdateTodoInput(BaseModel):
    id: str
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[str] = None
    priority: Optional[TodoPriority] = None
    completed: Optional[bool] = None
    tags: Optional[List[str]] = None

class TodoFilter(BaseModel):
    completed: Optional[bool] = None
    priority: Optional[TodoPriority] = None
    overdue: Optional[bool] = None
    tags: Optional[List[str]] = None

# Error response model
class ErrorResponse(BaseModel):
    error: bool = True
    message: str
    code: str
    details: Optional[Dict[str, Any]] = None