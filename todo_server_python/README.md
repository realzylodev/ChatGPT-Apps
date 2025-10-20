# Todo MCP Server (Python)

A Model Context Protocol server for todo management with ChatGPT integration using FastMCP.

## Features

- Complete todo CRUD operations (Create, Read, Update, Delete)
- JSON file-based persistence with automatic migration
- Widget integration for rich UI in ChatGPT
- Filtering and sorting capabilities
- Priority and due date management
- Tag-based organization

## Installation

1. Install dependencies:
```bash
pip install -r requirements.txt
```

## Usage

### Running the Server

```bash
python -m todo_server_python.main
```

The server will start and be available for MCP connections.

### Available Tools

- `list-todos` - List all todos with optional filtering by completion, priority, overdue status, or tags
- `create-todo` - Create a new todo item with title, description, due date, priority, and tags
- `update-todo` - Update an existing todo by ID with new values for any field
- `complete-todo` - Mark a todo as completed or incomplete by ID
- `delete-todo` - Delete a todo item by ID

### Widget Resources

The server provides widget resources for ChatGPT integration:

- `ui://widget/todo.html` - Widget HTML template
- `ui://data/todos.json` - Current todo data for widget hydration
- `ui://assets/todo.js` - Widget JavaScript bundle
- `ui://assets/todo.css` - Widget CSS styles
- `ui://assets/{filename}` - Dynamic asset serving

## Configuration

The server uses `./todos.json` as the default storage file. This can be configured by modifying the `TodoStorage` initialization in `main.py`.

## Development

The server is built with:
- FastMCP for MCP protocol handling
- Pydantic for data validation and type safety
- JSON file storage with migration support
- Async/await for non-blocking operations

## Data Model

Todos have the following structure:
- `id` - Unique identifier (UUID)
- `title` - Todo title (required)
- `description` - Optional description
- `completed` - Completion status (boolean)
- `created_at` - Creation timestamp (ISO format)
- `updated_at` - Last update timestamp (ISO format)
- `due_date` - Optional due date (ISO date format)
- `priority` - Priority level (low, medium, high)
- `tags` - List of tags for organization