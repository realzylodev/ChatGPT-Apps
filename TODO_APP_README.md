# Todo ChatGPT App

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A comprehensive todo management application built for ChatGPT using the Model Context Protocol (MCP) and Apps SDK. This app demonstrates how to create rich, interactive widgets that integrate seamlessly with ChatGPT conversations.

## Overview

The Todo ChatGPT App is a fully-featured task management system that follows the same architectural patterns as the official Pizzaz and Solar System examples in this repository. It provides both Node.js and Python MCP server implementations, along with a React-based widget for rich UI interactions within ChatGPT.

## Similarity to Official Examples

This Todo app follows the exact same patterns and architecture as the official examples:

### **Pizzaz App Similarities:**
- ✅ Dual server implementation (Node.js + Python)
- ✅ MCP tool definitions with proper schemas
- ✅ Widget metadata integration (`_meta` fields)
- ✅ Structured content responses for widget hydration
- ✅ Static asset serving (HTML, CSS, JS bundles)
- ✅ Resource templates for dynamic content
- ✅ Error handling and validation
- ✅ Build system integration with Vite

### **Solar System App Similarities:**
- ✅ Python FastMCP implementation
- ✅ Resource handlers for widget assets
- ✅ Dynamic asset serving with versioning support
- ✅ Proper widget template structure
- ✅ OpenAI integration metadata

### **Key Architectural Alignments:**
- **MCP Protocol Compliance**: Full implementation of list tools, call tools, and return widgets
- **Widget Integration**: Uses `_meta.openai/outputTemplate` for ChatGPT rendering
- **Asset Management**: Serves versioned bundles from `/assets` directory
- **Error Handling**: Comprehensive error responses with proper codes
- **Data Validation**: Zod/Pydantic schemas for input validation
- **Storage Layer**: JSON file-based persistence with migration support

## Repository Structure

```
todo_server_node/           # Node.js MCP server implementation
├── src/
│   ├── index.ts           # Main server entry point with MCP handlers
│   ├── types.ts           # TypeScript type definitions and Zod schemas
│   ├── storage.ts         # JSON file storage implementation
│   └── errors.ts          # Error handling and logging utilities
├── tests/                 # Comprehensive test suite
│   ├── unit/              # Unit tests for core functionality
│   ├── integration/       # MCP server integration tests
│   └── e2e-tests.js       # End-to-end ChatGPT integration tests
├── package.json           # Node.js dependencies and scripts
├── tsconfig.json          # TypeScript configuration
└── README.md              # Node.js server documentation

todo_server_python/         # Python MCP server implementation
├── main.py                # FastMCP server with tool and resource handlers
├── todo_types.py          # Pydantic models and type definitions
├── storage.py             # JSON file storage with async operations
├── errors.py              # Error handling and logging
├── tests/
│   └── test_e2e.py        # Python end-to-end tests
├── requirements.txt       # Python dependencies
└── README.md              # Python server documentation

src/todo/                   # React widget implementation
├── components/
│   ├── TodoApp.tsx        # Main app component with state management
│   ├── TodoList.tsx       # Todo list with filtering and search
│   ├── TodoItem.tsx       # Individual todo item component
│   ├── AddTodoForm.tsx    # Form for creating new todos
│   ├── EditTodoForm.tsx   # Form for editing existing todos
│   ├── ErrorBoundary.tsx  # Error boundary with recovery
│   ├── ErrorMessage.tsx   # Error display components
│   └── LoadingState.tsx   # Loading state indicators
├── hooks/
│   └── useNetworkError.ts # Network error handling hook
├── types.ts               # Client-side type definitions
├── storage.ts             # Client-side storage utilities
├── styles.css             # Widget-specific CSS styles
└── WIDGET_SYNC_IMPLEMENTATION.md  # Widget synchronization docs

assets/                     # Generated widget bundles (after build)
├── todo.html              # Widget HTML template
├── todo.js                # Widget JavaScript bundle
├── todo.css               # Widget CSS styles
└── todo-{hash}.{ext}      # Versioned asset files

.kiro/specs/todo-chatgpt-app/  # Feature specification documents
├── requirements.md        # Feature requirements in EARS format
├── design.md              # Technical design document
└── tasks.md               # Implementation task list
```

## Features

### Core Todo Management
- **CRUD Operations**: Create, read, update, and delete todos
- **Priority Levels**: High, medium, and low priority classification
- **Due Dates**: Optional due date tracking with overdue detection
- **Tags**: Flexible tagging system for organization
- **Completion Tracking**: Mark todos as completed/incomplete
- **Rich Descriptions**: Detailed descriptions for complex tasks

### Advanced Functionality
- **Smart Filtering**: Filter by completion status, priority, overdue status, or tags
- **Multi-term Search**: Search across titles, descriptions, tags, and metadata
- **Intelligent Sorting**: Automatic sorting by priority, due date, and creation time
- **Statistics**: Real-time stats on total, completed, and overdue todos
- **Drag & Drop Reordering**: Manual todo reordering (in widget)

### Widget Integration
- **Responsive Design**: Adapts to inline and fullscreen display modes
- **Real-time Sync**: Bidirectional synchronization with ChatGPT
- **Dark Mode Support**: Automatic theme detection and switching
- **Error Recovery**: Comprehensive error handling with user-friendly messages
- **Offline Awareness**: Network status detection and offline indicators
- **Accessibility**: Full keyboard navigation and screen reader support

### ChatGPT Integration
- **Natural Language**: Create and manage todos through conversation
- **Context Awareness**: Widget updates reflect in conversation context
- **Follow-up Messages**: Automatic notifications for important actions
- **Display Mode Control**: Switch between inline and fullscreen views
- **State Persistence**: Widget state survives conversation navigation

## MCP Tools

Both server implementations provide identical MCP tools:

### `list-todos`
List all todos with optional filtering capabilities.

**Parameters:**
- `completed` (boolean, optional): Filter by completion status
- `priority` (string, optional): Filter by priority level (low/medium/high)
- `overdue` (boolean, optional): Filter by overdue status
- `tags` (array, optional): Filter by tags (matches any provided tag)

### `create-todo`
Create a new todo item with comprehensive metadata.

**Parameters:**
- `title` (string, required): Todo title (max 200 characters)
- `description` (string, optional): Detailed description (max 1000 characters)
- `dueDate` (string, optional): Due date in YYYY-MM-DD format
- `priority` (string, optional): Priority level (defaults to "medium")
- `tags` (array, optional): Tags for categorization (max 10 tags)

### `update-todo`
Update an existing todo by ID with partial updates.

**Parameters:**
- `id` (string, required): UUID of the todo to update
- `title` (string, optional): New title
- `description` (string, optional): New description
- `dueDate` (string, optional): New due date
- `priority` (string, optional): New priority level
- `completed` (boolean, optional): New completion status
- `tags` (array, optional): New tags list

### `complete-todo`
Toggle completion status of a todo.

**Parameters:**
- `id` (string, required): UUID of the todo
- `completed` (boolean, optional): Completion status (defaults to true)

### `delete-todo`
Delete a todo item permanently.

**Parameters:**
- `id` (string, required): UUID of the todo to delete

## Widget Resources

The servers provide widget resources following the same pattern as official examples:

- `ui://widget/todo.html` - Widget HTML template with embedded CSS and JS
- `ui://data/todos.json` - Current todo data for widget hydration
- `ui://assets/todo.js` - Widget JavaScript bundle
- `ui://assets/todo.css` - Widget CSS styles
- `ui://assets/{filename}` - Dynamic asset serving with version support

## Installation & Setup

### Prerequisites
- Node.js 18+ (for Node.js server)
- Python 3.10+ (for Python server)
- pnpm/npm/yarn (for dependency management)

### Build Widget Assets
```bash
# Install dependencies
pnpm install

# Build all widget assets (including todo)
pnpm run build

# Start static asset server (optional)
pnpm run serve
```

### Node.js Server
```bash
cd todo_server_node
pnpm install
pnpm run build
pnpm start
```

### Python Server
```bash
# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r todo_server_python/requirements.txt

# Run server
uvicorn todo_server_python.main:app --port 8000
```

## Testing

### Node.js Tests
```bash
cd todo_server_node

# Run all tests
pnpm test

# Run unit tests only
pnpm run test:unit

# Run with coverage
pnpm run test:coverage

# Watch mode for development
pnpm run test:watch
```

### Python Tests
```bash
cd todo_server_python
python -m pytest tests/ -v
```

### End-to-End Tests
```bash
# Test todo functionality
node test-todo-functionality.js

# Run comprehensive E2E tests
node run-e2e-tests.js
```

## ChatGPT Integration

### Adding to ChatGPT
1. Enable [developer mode](https://platform.openai.com/docs/guides/developer-mode)
2. Go to Settings > Connectors in ChatGPT
3. Add your server URL (use ngrok for local development)

### Local Development with ngrok
```bash
# Start your MCP server first
cd todo_server_node && pnpm start
# OR
uvicorn todo_server_python.main:app --port 8000

# In another terminal, expose with ngrok
ngrok http 8000

# Use the ngrok URL in ChatGPT: https://your-id.ngrok-free.app/mcp
```

### Usage Examples
Once connected, you can interact naturally:

- "Show me my todos"
- "Create a todo to buy groceries with high priority due tomorrow"
- "Mark the grocery shopping todo as completed"
- "Show me all overdue todos"
- "Update my project todo to have a due date of next Friday"
- "Delete the completed todos"

## Data Storage

Both implementations use JSON file-based storage:

- **Node.js**: `todo_server_node/todos.json`
- **Python**: `todo_server_python/todos.json`

The storage layer includes:
- Automatic file creation and migration
- Atomic write operations
- Data validation and sanitization
- Backup and recovery capabilities
- Concurrent access handling

## Error Handling

Comprehensive error handling includes:

- **Validation Errors**: Input validation with detailed field-level errors
- **Not Found Errors**: Proper 404 handling for missing todos
- **Storage Errors**: File system and data persistence error recovery
- **Network Errors**: Connection and timeout handling
- **Widget Errors**: UI error boundaries with graceful degradation

## Development

### Widget Development
```bash
# Start development server
pnpm run dev

# Widget will be available at http://localhost:5173/src/todo/
```

### Server Development
```bash
# Node.js development with hot reload
cd todo_server_node
pnpm run dev

# Python development
cd todo_server_python
uvicorn main:app --reload --port 8000
```

## Architecture Compliance

This Todo app demonstrates full compliance with the MCP + Apps SDK architecture:

1. **MCP Protocol**: Complete implementation of all required capabilities
2. **Widget Integration**: Proper metadata and resource serving
3. **Error Handling**: Comprehensive error responses and recovery
4. **Asset Management**: Versioned bundle serving with fallbacks
5. **State Management**: Bidirectional sync between widget and ChatGPT
6. **Testing**: Full test coverage including integration and E2E tests
7. **Documentation**: Complete API documentation and usage examples

## Contributing

This app serves as a reference implementation for MCP + Apps SDK development. When contributing:

1. Follow the established patterns from Pizzaz and Solar System examples
2. Maintain compatibility with both Node.js and Python implementations
3. Ensure comprehensive test coverage
4. Update documentation for any API changes
5. Test widget functionality in ChatGPT before submitting

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.