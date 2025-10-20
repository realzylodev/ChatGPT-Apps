# Todo ChatGPT App - MCP Integration

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A comprehensive todo management application built for ChatGPT using the Model Context Protocol (MCP) and Apps SDK. This app demonstrates how to create rich, interactive widgets that integrate seamlessly with ChatGPT conversations.

**🎯 Features:**
- Complete CRUD operations for todos
- Smart filtering and search capabilities  
- Priority levels and due date tracking
- Rich React widget with real-time sync
- Dual server implementation (Node.js + Python)
- Comprehensive test suite
- Full MCP protocol compliance

## MCP + Apps SDK overview

The Model Context Protocol (MCP) is an open specification for connecting large language model clients to external tools, data, and user interfaces. An MCP server exposes tools that a model can call during a conversation and returns results according to the tool contracts. Those results can include extra metadata—such as inline HTML—that the Apps SDK uses to render rich UI components (widgets) alongside assistant messages.

Within the Apps SDK, MCP keeps the server, model, and UI in sync. By standardizing the wire format, authentication, and metadata, it lets ChatGPT reason about your connector the same way it reasons about built-in tools. A minimal MCP integration for Apps SDK implements three capabilities:

1. **List tools** – Your server advertises the tools it supports, including their JSON Schema input/output contracts and optional annotations (for example, `readOnlyHint`).
2. **Call tools** – When a model selects a tool, it issues a `call_tool` request with arguments that match the user intent. Your server executes the action and returns structured content the model can parse.
3. **Return widgets** – Alongside structured content, return embedded resources in the response metadata so the Apps SDK can render the interface inline in the Apps SDK client (ChatGPT).

Because the protocol is transport agnostic, you can host the server over Server-Sent Events or streaming HTTP—Apps SDK supports both.

The MCP servers in this demo highlight how each tool can light up widgets by combining structured payloads with `_meta.openai/outputTemplate` metadata returned from the MCP servers.

## Repository structure

- `src/todo/` – React widget components and TypeScript implementation
- `assets/` – Generated HTML, JS, and CSS bundles for the todo widget
- `todo_server_node/` – Node.js MCP server with comprehensive todo management
- `todo_server_python/` – Python MCP server using FastMCP framework
- `build-all.mts` – Vite build orchestrator for widget assets
- `.kiro/specs/` – Feature specifications and design documents

## Quick Start

```bash
# Install dependencies
pnpm install

# Build widget assets
pnpm run build

# Run Node.js server
cd todo_server_node && pnpm start

# OR run Python server
pip install -r todo_server_python/requirements.txt
uvicorn todo_server_python.main:app --port 8000
```

## Prerequisites

- Node.js 18+
- pnpm (recommended) or npm/yarn
- Python 3.10+ (for the Python MCP server)

## Install dependencies

Clone the repository and install the workspace dependencies:

```bash
pnpm install
```

> Using npm or yarn? Install the root dependencies with your preferred client and adjust the commands below accordingly.

## Build the components gallery

The components are bundled into standalone assets that the MCP servers serve as reusable UI resources.

```bash
pnpm run build
```

This command runs `build-all.mts`, producing versioned `.html`, `.js`, and `.css` files inside `assets/`. Each widget is wrapped with the CSS it needs so you can host the bundles directly or ship them with your own server.

To iterate on your components locally, you can also launch the Vite dev server:

```bash
pnpm run dev
```

## Serve the static assets

If you want to preview the generated bundles without the MCP servers, start the static file server after running a build:

```bash
pnpm run serve
```

The assets are exposed at [`http://localhost:4444`](http://localhost:4444) with CORS enabled so that local tooling (including MCP inspectors) can fetch them.

## MCP Tools Available

The Todo app provides these MCP tools for ChatGPT integration:

- **`list-todos`** – List all todos with filtering (completion, priority, overdue, tags)
- **`create-todo`** – Create new todos with title, description, due date, priority, tags
- **`update-todo`** – Update existing todos by ID with partial updates
- **`complete-todo`** – Toggle completion status of todos
- **`delete-todo`** – Delete todos permanently

### Node.js Server

```bash
cd todo_server_node
pnpm install
pnpm run build
pnpm start
```

### Python Server

```bash
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r todo_server_python/requirements.txt
uvicorn todo_server_python.main:app --port 8000
```

## Testing

```bash
# Node.js tests
cd todo_server_node && pnpm test

# Python tests  
cd todo_server_python && python -m pytest tests/ -v

# End-to-end tests
node test-todo-functionality.js
```

## Testing in ChatGPT

To add these apps to ChatGPT, enable [developer mode](https://platform.openai.com/docs/guides/developer-mode), and add your apps in Settings > Connectors.

To add your local server without deploying it, you can use a tool like [ngrok](https://ngrok.com/) to expose your local server to the internet.

For example, once your mcp servers are running, you can run:

```bash
ngrok http 8000
```

You will get a public URL that you can use to add your local server to ChatGPT in Settings > Connectors.

For example: `https://<custom_endpoint>.ngrok-free.app/mcp`

Once you add a connector, you can use it in ChatGPT conversations.

You can add your app to the conversation context by selecting it in the "More" options.

![more-chatgpt](https://github.com/user-attachments/assets/26852b36-7f9e-4f48-a515-aebd87173399)

You can then invoke tools by asking something related. For example:
- "Show me my todos"
- "Create a todo to buy groceries with high priority due tomorrow"
- "Mark the grocery shopping todo as completed"
- "Show me all overdue todos"

## Architecture

This Todo app demonstrates best practices for MCP + Apps SDK development:

- **MCP Protocol Compliance**: Full implementation of list tools, call tools, and widget resources
- **Widget Integration**: Proper use of `_meta.openai/outputTemplate` for ChatGPT rendering
- **Error Handling**: Comprehensive error responses with proper codes and recovery
- **State Management**: Bidirectional sync between widget and ChatGPT
- **Testing**: Unit, integration, and end-to-end test coverage
- **Documentation**: Complete API docs and usage examples

## Detailed Documentation

See [TODO_APP_README.md](./TODO_APP_README.md) for comprehensive documentation including:
- Complete file structure breakdown
- API reference for all MCP tools
- Widget development guide
- Testing strategies
- Deployment instructions

### Deploy your MCP server

You can use the cloud environment of your choice to deploy your MCP server.

Include this in the environment variables:

```
BASE_URL=https://your-server.com
```

This will be used to generate the HTML for the widgets so that they can serve static assets from this hosted url.

## Contributing

You are welcome to open issues or submit PRs to improve this app, however, please note that we may not review all suggestions.

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE) for details.
