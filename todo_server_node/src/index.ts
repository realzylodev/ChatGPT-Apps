/**
 * Todo MCP Server - Main Entry Point
 * Provides MCP server for todo management with ChatGPT integration
 */

import {
    createServer,
    type IncomingMessage,
    type ServerResponse,
} from "node:http";
import fs from "node:fs";
import path from "node:path";
import { URL, fileURLToPath } from "node:url";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
    CallToolRequestSchema,
    ListResourceTemplatesRequestSchema,
    ListResourcesRequestSchema,
    ListToolsRequestSchema,
    ReadResourceRequestSchema,
    type CallToolRequest,
    type ListResourceTemplatesRequest,
    type ListResourcesRequest,
    type ListToolsRequest,
    type ReadResourceRequest,
    type Resource,
    type ResourceTemplate,
    type Tool,
} from "@modelcontextprotocol/sdk/types.js";

import { TodoStorage, defaultTodoStorage } from './storage.js';
import {
    TodoUtils,
    CreateTodoInputSchema,
    UpdateTodoInputSchema,
    TodoFilterSchema,
    type Todo,
    type CreateTodoInput,
    type UpdateTodoInput,
    type TodoFilter
} from './types.js';
import {
    ErrorHandler,
    logger,
    TodoError,
    ValidationError,
    NotFoundError,
    ErrorCode
} from './errors.js';

// Server configuration
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..");
const ASSETS_DIR = path.resolve(ROOT_DIR, "assets");

// Widget configuration
type TodoWidget = {
    id: string;
    title: string;
    templateUri: string;
    invoking: string;
    invoked: string;
    html: string;
    responseText: string;
};

// Widget metadata type for OpenAI integration
type WidgetMetadata = {
    "openai/outputTemplate": string;
    "openai/toolInvocation/invoking": string;
    "openai/toolInvocation/invoked": string;
    "openai/widgetAccessible": boolean;
    "openai/resultCanProduceWidget": boolean;
};

/**
 * Read widget HTML from assets directory
 */
function readWidgetHtml(componentName: string): string {
    if (!fs.existsSync(ASSETS_DIR)) {
        console.warn(`Widget assets not found at ${ASSETS_DIR}. Widget functionality will be limited.`);
        return `<div>Todo widget not available - assets not built</div>`;
    }

    const directPath = path.join(ASSETS_DIR, `${componentName}.html`);
    let htmlContents: string | null = null;

    if (fs.existsSync(directPath)) {
        htmlContents = fs.readFileSync(directPath, "utf8");
    } else {
        // Look for versioned files (e.g., todo-abc123.html)
        const candidates = fs
            .readdirSync(ASSETS_DIR)
            .filter(
                (file) => file.startsWith(`${componentName}-`) && file.endsWith(".html")
            )
            .sort();
        const fallback = candidates[candidates.length - 1];
        if (fallback) {
            htmlContents = fs.readFileSync(path.join(ASSETS_DIR, fallback), "utf8");
        }
    }

    if (!htmlContents) {
        console.warn(`Widget HTML for "${componentName}" not found in ${ASSETS_DIR}. Using fallback.`);
        return `<div>Todo widget loading...</div>`;
    }

    return htmlContents;
}

/**
 * Read static asset file from assets directory
 */
function readStaticAsset(filename: string): { content: string; mimeType: string } | null {
    if (!fs.existsSync(ASSETS_DIR)) {
        console.warn(`Widget assets not found at ${ASSETS_DIR}. Static assets not available.`);
        return null;
    }

    // Try direct path first
    let assetPath = path.join(ASSETS_DIR, filename);
    
    if (!fs.existsSync(assetPath)) {
        // Look for versioned files (e.g., todo-abc123.js, todo-abc123.css)
        const baseName = path.parse(filename).name;
        const extension = path.parse(filename).ext;
        
        const candidates = fs
            .readdirSync(ASSETS_DIR)
            .filter(file => {
                const candidateParsed = path.parse(file);
                return candidateParsed.name.startsWith(`${baseName}-`) && candidateParsed.ext === extension;
            })
            .sort();
            
        if (candidates.length > 0) {
            assetPath = path.join(ASSETS_DIR, candidates[candidates.length - 1]);
        } else {
            console.warn(`Static asset "${filename}" not found in ${ASSETS_DIR}`);
            return null;
        }
    }

    try {
        const content = fs.readFileSync(assetPath, "utf8");
        
        // Determine MIME type based on file extension
        const extension = path.extname(filename).toLowerCase();
        let mimeType: string;
        
        switch (extension) {
            case '.js':
                mimeType = 'application/javascript';
                break;
            case '.css':
                mimeType = 'text/css';
                break;
            case '.json':
                mimeType = 'application/json';
                break;
            case '.html':
                mimeType = 'text/html';
                break;
            case '.png':
                mimeType = 'image/png';
                break;
            case '.jpg':
            case '.jpeg':
                mimeType = 'image/jpeg';
                break;
            case '.svg':
                mimeType = 'image/svg+xml';
                break;
            case '.ico':
                mimeType = 'image/x-icon';
                break;
            default:
                mimeType = 'application/octet-stream';
        }
        
        return { content, mimeType };
    } catch (error) {
        console.error(`Error reading static asset "${filename}":`, error);
        return null;
    }
}

/**
 * Generate widget metadata for OpenAI integration
 * Provides consistent metadata for all tool responses and resources
 * to enable proper widget rendering in ChatGPT
 */
function widgetMeta(widget: TodoWidget): WidgetMetadata {
    // Validate widget configuration
    if (!widget.templateUri || !widget.invoking || !widget.invoked) {
        console.warn('Widget configuration incomplete, some metadata may be missing');
    }
    
    return {
        "openai/outputTemplate": widget.templateUri,
        "openai/toolInvocation/invoking": widget.invoking,
        "openai/toolInvocation/invoked": widget.invoked,
        "openai/widgetAccessible": true,
        "openai/resultCanProduceWidget": true,
    };
}

/**
 * Create structured content for widget with consistent formatting
 * Ensures all tool responses have properly formatted data for widget consumption
 */
function createStructuredContent(todos: Todo[], stats: any, additionalData: any = {}) {
    return {
        todos: todos.map(todo => ({
            ...todo,
            isOverdue: TodoUtils.isOverdue(todo),
        })),
        stats: {
            ...stats,
            timestamp: new Date().toISOString(),
        },
        metadata: {
            version: "1.0.0",
            widgetType: "todo-management",
            lastUpdated: new Date().toISOString(),
            serverType: "node",
        },
        ...additionalData,
    };
}

/**
 * Create a standardized tool response with widget metadata
 * Ensures consistent response format across all todo tools
 */
function createToolResponse(textContent: string, todos: Todo[], stats: any, additionalData: any = {}) {
    return {
        content: [
            {
                type: "text" as const,
                text: textContent,
            },
        ],
        structuredContent: createStructuredContent(todos, stats, additionalData),
        _meta: widgetMeta(todoWidget),
    };
}

// Widget definitions
const todoWidget: TodoWidget = {
    id: "todo-widget",
    title: "Todo Management Widget",
    templateUri: "ui://widget/todo.html",
    invoking: "Managing your todos...",
    invoked: "Todo list updated successfully!",
    html: readWidgetHtml("todo"),
    responseText: "Todo list updated successfully!",
};

/**
 * Handle list-todos tool call
 */
async function handleListTodos(args: any, requestId: string) {
    try {
        logger.debug('Handling list-todos request', { args, requestId });

        // Validate and parse filter arguments
        const filter = TodoFilterSchema.parse(args || {});

        // Get all todos from storage
        const allTodos = await defaultTodoStorage.getAllTodos();

        // Apply filters
        const filteredTodos = TodoUtils.filterTodos(allTodos, filter);

        // Sort todos by priority and due date
        const sortedTodos = TodoUtils.sortTodos(filteredTodos);

        // Get statistics
        const stats = TodoUtils.getStats(sortedTodos);

        // Format response text
        let responseText = `Found ${sortedTodos.length} todo(s)`;
        if (stats.completed > 0) {
            responseText += ` (${stats.completed} completed)`;
        }
        if (stats.overdue > 0) {
            responseText += ` (${stats.overdue} overdue)`;
        }

        logger.info('Successfully listed todos', { 
            count: sortedTodos.length, 
            filter, 
            requestId 
        });

        return createToolResponse(responseText, sortedTodos, stats, { filter });
    } catch (error) {
        logger.error('Error in handleListTodos', error instanceof Error ? error : new Error(String(error)), { requestId });
        throw error;
    }
}

/**
 * Handle create-todo tool call
 */
async function handleCreateTodo(args: any, requestId: string) {
    try {
        logger.debug('Handling create-todo request', { args, requestId });

        // Validate input
        const input = CreateTodoInputSchema.parse(args);

        // Additional business logic validation
        if (input.title.trim().length === 0) {
            throw new ValidationError('Title cannot be empty', { field: 'title' }, requestId);
        }

        // Create new todo
        const newTodo = TodoUtils.createTodo(input);

        // Save to storage
        await defaultTodoStorage.addTodo(newTodo);

        // Get updated list for widget
        const allTodos = await defaultTodoStorage.getAllTodos();
        const sortedTodos = TodoUtils.sortTodos(allTodos);
        const stats = TodoUtils.getStats(sortedTodos);

        logger.info('Successfully created todo', { 
            todoId: newTodo.id, 
            title: newTodo.title, 
            requestId 
        });

        return createToolResponse(
            `Created todo: "${newTodo.title}"`,
            sortedTodos,
            stats,
            {
                action: "create",
                createdTodo: newTodo
            }
        );
    } catch (error) {
        logger.error('Error in handleCreateTodo', error instanceof Error ? error : new Error(String(error)), { requestId });
        throw error;
    }
}

/**
 * Handle update-todo tool call
 */
async function handleUpdateTodo(args: any, requestId: string) {
    try {
        logger.debug('Handling update-todo request', { args, requestId });

        // Validate input
        const input = UpdateTodoInputSchema.parse(args);

        // Extract ID and updates
        const { id, ...updates } = input;

        // Check if todo exists before updating
        const existingTodo = await defaultTodoStorage.getTodoById(id);
        if (!existingTodo) {
            throw new NotFoundError('todo', id, requestId);
        }

        // Additional validation for updates
        if (updates.title !== undefined && updates.title.trim().length === 0) {
            throw new ValidationError('Title cannot be empty', { field: 'title' }, requestId);
        }

        // Update todo in storage
        const updatedTodo = await defaultTodoStorage.updateTodo(id, updates);

        // Get updated list for widget
        const allTodos = await defaultTodoStorage.getAllTodos();
        const sortedTodos = TodoUtils.sortTodos(allTodos);
        const stats = TodoUtils.getStats(sortedTodos);

        logger.info('Successfully updated todo', { 
            todoId: id, 
            updates: Object.keys(updates), 
            requestId 
        });

        return createToolResponse(
            `Updated todo: "${updatedTodo.title}"`,
            sortedTodos,
            stats,
            {
                action: "update",
                updatedTodo
            }
        );
    } catch (error) {
        logger.error('Error in handleUpdateTodo', error instanceof Error ? error : new Error(String(error)), { requestId });
        throw error;
    }
}

/**
 * Handle complete-todo tool call
 */
async function handleCompleteTodo(args: any, requestId: string) {
    try {
        logger.debug('Handling complete-todo request', { args, requestId });

        // Validate input
        const { id, completed = true } = args;

        if (!id || typeof id !== 'string') {
            throw new ValidationError('Todo ID is required and must be a string', { field: 'id' }, requestId);
        }

        // Check if todo exists
        const existingTodo = await defaultTodoStorage.getTodoById(id);
        if (!existingTodo) {
            throw new NotFoundError('todo', id, requestId);
        }

        // Update completion status
        const updatedTodo = await defaultTodoStorage.updateTodo(id, { completed });

        // Get updated list for widget
        const allTodos = await defaultTodoStorage.getAllTodos();
        const sortedTodos = TodoUtils.sortTodos(allTodos);
        const stats = TodoUtils.getStats(sortedTodos);

        const action = completed ? 'completed' : 'marked as incomplete';

        logger.info('Successfully updated todo completion status', { 
            todoId: id, 
            completed, 
            requestId 
        });

        return createToolResponse(
            `Todo "${updatedTodo.title}" ${action}`,
            sortedTodos,
            stats,
            {
                action: "complete",
                updatedTodo,
                completed
            }
        );
    } catch (error) {
        logger.error('Error in handleCompleteTodo', error instanceof Error ? error : new Error(String(error)), { requestId });
        throw error;
    }
}

/**
 * Handle delete-todo tool call
 */
async function handleDeleteTodo(args: any, requestId: string) {
    try {
        logger.debug('Handling delete-todo request', { args, requestId });

        // Validate input
        const { id } = args;

        if (!id || typeof id !== 'string') {
            throw new ValidationError('Todo ID is required and must be a string', { field: 'id' }, requestId);
        }

        // Get todo before deletion for response
        const todoToDelete = await defaultTodoStorage.getTodoById(id);
        if (!todoToDelete) {
            throw new NotFoundError('todo', id, requestId);
        }

        // Delete todo
        const deleted = await defaultTodoStorage.deleteTodo(id);
        if (!deleted) {
            throw new TodoError(
                `Failed to delete todo with ID ${id}`,
                ErrorCode.STORAGE_ERROR,
                { todoId: id },
                requestId
            );
        }

        // Get updated list for widget
        const allTodos = await defaultTodoStorage.getAllTodos();
        const sortedTodos = TodoUtils.sortTodos(allTodos);
        const stats = TodoUtils.getStats(sortedTodos);

        logger.info('Successfully deleted todo', { 
            todoId: id, 
            title: todoToDelete.title, 
            requestId 
        });

        return createToolResponse(
            `Deleted todo: "${todoToDelete.title}"`,
            sortedTodos,
            stats,
            {
                action: "delete",
                deletedTodo: todoToDelete
            }
        );
    } catch (error) {
        logger.error('Error in handleDeleteTodo', error instanceof Error ? error : new Error(String(error)), { requestId });
        throw error;
    }
}

/**
 * Create and configure the MCP server
 */
export function createTodoServer(): Server {
    const server = new Server(
        {
            name: "todo-mcp-server",
            version: "1.0.0",
        },
        {
            capabilities: {
                resources: {},
                tools: {},
            },
        }
    );

    // Initialize storage
    defaultTodoStorage.initialize().catch(error => {
        console.error('Failed to initialize todo storage:', error);
    });

    // Tool definitions with widget metadata integration
    // Each tool includes widget metadata to enable ChatGPT widget rendering
    const tools: Tool[] = [
        {
            name: "list-todos",
            description: "List all todos with optional filtering by completion status, priority, or overdue status",
            inputSchema: {
                type: "object",
                properties: {
                    completed: {
                        type: "boolean",
                        description: "Filter by completion status (true for completed, false for pending)"
                    },
                    priority: {
                        type: "string",
                        enum: ["low", "medium", "high"],
                        description: "Filter by priority level"
                    },
                    overdue: {
                        type: "boolean",
                        description: "Filter by overdue status (true for overdue todos only)"
                    },
                    tags: {
                        type: "array",
                        items: { type: "string" },
                        description: "Filter by tags (todos matching any of the provided tags)"
                    }
                },
                additionalProperties: false,
            },
            _meta: widgetMeta(todoWidget),
            annotations: {
                destructiveHint: false,
                openWorldHint: false,
                readOnlyHint: true,
            },
        },
        {
            name: "create-todo",
            description: "Create a new todo item with title, optional description, due date, priority, and tags",
            inputSchema: {
                type: "object",
                properties: {
                    title: {
                        type: "string",
                        description: "The title of the todo (required, max 200 characters)"
                    },
                    description: {
                        type: "string",
                        description: "Optional description of the todo (max 1000 characters)"
                    },
                    dueDate: {
                        type: "string",
                        format: "date",
                        description: "Optional due date in YYYY-MM-DD format"
                    },
                    priority: {
                        type: "string",
                        enum: ["low", "medium", "high"],
                        description: "Priority level (defaults to medium)"
                    },
                    tags: {
                        type: "array",
                        items: { type: "string" },
                        maxItems: 10,
                        description: "Optional tags for categorization (max 10 tags)"
                    }
                },
                required: ["title"],
                additionalProperties: false,
            },
            _meta: widgetMeta(todoWidget),
        },
        {
            name: "update-todo",
            description: "Update an existing todo item by ID with new values for any field",
            inputSchema: {
                type: "object",
                properties: {
                    id: {
                        type: "string",
                        description: "The UUID of the todo to update"
                    },
                    title: {
                        type: "string",
                        description: "New title for the todo (max 200 characters)"
                    },
                    description: {
                        type: "string",
                        description: "New description for the todo (max 1000 characters)"
                    },
                    dueDate: {
                        type: "string",
                        format: "date",
                        description: "New due date in YYYY-MM-DD format"
                    },
                    priority: {
                        type: "string",
                        enum: ["low", "medium", "high"],
                        description: "New priority level"
                    },
                    completed: {
                        type: "boolean",
                        description: "New completion status"
                    },
                    tags: {
                        type: "array",
                        items: { type: "string" },
                        maxItems: 10,
                        description: "New tags for the todo (max 10 tags)"
                    }
                },
                required: ["id"],
                additionalProperties: false,
            },
            _meta: widgetMeta(todoWidget),
        },
        {
            name: "complete-todo",
            description: "Mark a todo as completed or incomplete by ID",
            inputSchema: {
                type: "object",
                properties: {
                    id: {
                        type: "string",
                        description: "The UUID of the todo to mark as completed/incomplete"
                    },
                    completed: {
                        type: "boolean",
                        description: "Completion status (true to mark as completed, false to mark as incomplete)",
                        default: true
                    }
                },
                required: ["id"],
                additionalProperties: false,
            },
            _meta: widgetMeta(todoWidget),
        },
        {
            name: "delete-todo",
            description: "Delete a todo item by ID",
            inputSchema: {
                type: "object",
                properties: {
                    id: {
                        type: "string",
                        description: "The UUID of the todo to delete"
                    }
                },
                required: ["id"],
                additionalProperties: false,
            },
            _meta: widgetMeta(todoWidget),
            annotations: {
                destructiveHint: true,
                openWorldHint: false,
                readOnlyHint: false,
            },
        },
    ];

    // Resource definitions with widget metadata
    // Resources provide widget assets and data for ChatGPT rendering
    const resources: Resource[] = [
        {
            uri: todoWidget.templateUri,
            name: todoWidget.title,
            description: "Todo management widget HTML template",
            mimeType: "text/html+skybridge",
            _meta: widgetMeta(todoWidget),
        },
        {
            uri: "ui://data/todos.json",
            name: "Todo Data",
            description: "Current todo list data for widget hydration",
            mimeType: "application/json",
            _meta: widgetMeta(todoWidget),
        },
        {
            uri: "ui://assets/todo.js",
            name: "Todo Widget JavaScript",
            description: "Todo widget JavaScript bundle",
            mimeType: "application/javascript",
            _meta: widgetMeta(todoWidget),
        },
        {
            uri: "ui://assets/todo.css",
            name: "Todo Widget CSS",
            description: "Todo widget CSS styles",
            mimeType: "text/css",
            _meta: widgetMeta(todoWidget),
        },
    ];

    // Resource templates with widget metadata for dynamic asset serving
    const resourceTemplates: ResourceTemplate[] = [
        {
            uriTemplate: todoWidget.templateUri,
            name: todoWidget.title,
            description: "Todo management widget HTML template",
            mimeType: "text/html+skybridge",
            _meta: widgetMeta(todoWidget),
        },
        {
            uriTemplate: "ui://data/todos.json",
            name: "Todo Data",
            description: "Current todo list data for widget hydration",
            mimeType: "application/json",
            _meta: widgetMeta(todoWidget),
        },
        {
            uriTemplate: "ui://assets/{filename}",
            name: "Widget Static Assets",
            description: "Static assets for todo widget (CSS, JS, images)",
            mimeType: "application/octet-stream",
            _meta: widgetMeta(todoWidget),
        },
    ];

    // Set up request handlers
    server.setRequestHandler(
        ListToolsRequestSchema,
        async (_request: ListToolsRequest) => ({
            tools,
        })
    );

    server.setRequestHandler(
        CallToolRequestSchema,
        async (request: CallToolRequest) => {
            const requestId = ErrorHandler.generateRequestId();
            const { name, arguments: args } = request.params;

            logger.info('Received tool call', { toolName: name, requestId });

            try {
                switch (name) {
                    case "list-todos":
                        return await handleListTodos(args, requestId);

                    case "create-todo":
                        return await handleCreateTodo(args, requestId);

                    case "update-todo":
                        return await handleUpdateTodo(args, requestId);

                    case "complete-todo":
                        return await handleCompleteTodo(args, requestId);

                    case "delete-todo":
                        return await handleDeleteTodo(args, requestId);

                    default:
                        throw new TodoError(
                            `Unknown tool: ${name}`,
                            ErrorCode.INVALID_INPUT,
                            { toolName: name },
                            requestId
                        );
                }
            } catch (error) {
                return ErrorHandler.createToolErrorResponse(error, name, requestId);
            }
        }
    );

    server.setRequestHandler(
        ListResourcesRequestSchema,
        async (_request: ListResourcesRequest) => ({
            resources,
        })
    );

    server.setRequestHandler(
        ListResourceTemplatesRequestSchema,
        async (_request: ListResourceTemplatesRequest) => ({
            resourceTemplates,
        })
    );

    server.setRequestHandler(
        ReadResourceRequestSchema,
        async (request: ReadResourceRequest) => {
            const requestId = ErrorHandler.generateRequestId();
            const { uri } = request.params;

            logger.debug('Reading resource', { uri, requestId });

            try {
                switch (uri) {
                    case todoWidget.templateUri:
                        return {
                            contents: [
                                {
                                    uri: todoWidget.templateUri,
                                    mimeType: "text/html+skybridge",
                                    text: todoWidget.html,
                                    _meta: widgetMeta(todoWidget),
                                },
                            ],
                        };

                    case "ui://data/todos.json":
                        // Get current todo data for widget hydration
                        const allTodos = await defaultTodoStorage.getAllTodos();
                        const sortedTodos = TodoUtils.sortTodos(allTodos);
                        const stats = TodoUtils.getStats(sortedTodos);

                        const todoData = {
                            todos: sortedTodos,
                            stats,
                            timestamp: new Date().toISOString(),
                        };

                        return {
                            contents: [
                                {
                                    uri: "ui://data/todos.json",
                                    mimeType: "application/json",
                                    text: JSON.stringify(todoData, null, 2),
                                    _meta: widgetMeta(todoWidget),
                                },
                            ],
                        };

                    case "ui://assets/todo.js":
                        // Serve todo widget JavaScript bundle
                        const jsAsset = readStaticAsset("todo.js");
                        if (!jsAsset) {
                            throw new NotFoundError('resource', 'todo.js', requestId);
                        }

                        return {
                            contents: [
                                {
                                    uri: "ui://assets/todo.js",
                                    mimeType: jsAsset.mimeType,
                                    text: jsAsset.content,
                                    _meta: widgetMeta(todoWidget),
                                },
                            ],
                        };

                    case "ui://assets/todo.css":
                        // Serve todo widget CSS styles
                        const cssAsset = readStaticAsset("todo.css");
                        if (!cssAsset) {
                            throw new NotFoundError('resource', 'todo.css', requestId);
                        }

                        return {
                            contents: [
                                {
                                    uri: "ui://assets/todo.css",
                                    mimeType: cssAsset.mimeType,
                                    text: cssAsset.content,
                                    _meta: widgetMeta(todoWidget),
                                },
                            ],
                        };

                    default:
                        // Handle dynamic asset requests using template pattern
                        if (uri.startsWith("ui://assets/")) {
                            const filename = uri.replace("ui://assets/", "");
                            const asset = readStaticAsset(filename);
                            
                            if (!asset) {
                                throw new NotFoundError('resource', filename, requestId);
                            }

                            return {
                                contents: [
                                    {
                                        uri,
                                        mimeType: asset.mimeType,
                                        text: asset.content,
                                        _meta: widgetMeta(todoWidget),
                                    },
                                ],
                            };
                        }

                        throw new NotFoundError('resource', uri, requestId);
                }
            } catch (error) {
                throw ErrorHandler.createResourceErrorResponse(error, uri, requestId);
            }
        }
    );

    return server;
}

// Session management
type SessionRecord = {
    server: Server;
    transport: SSEServerTransport;
};

const sessions = new Map<string, SessionRecord>();

// HTTP endpoints
const ssePath = "/mcp";
const postPath = "/mcp/messages";

/**
 * Handle SSE connection requests
 */
async function handleSseRequest(res: ServerResponse) {
    // Set CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type");

    const server = createTodoServer();
    const transport = new SSEServerTransport(postPath, res);
    const sessionId = transport.sessionId;

    sessions.set(sessionId, { server, transport });

    transport.onclose = async () => {
        sessions.delete(sessionId);
        await server.close();
    };

    transport.onerror = (error) => {
        console.error("SSE transport error:", error);
    };

    try {
        await server.connect(transport);
        console.log(`New SSE session established: ${sessionId}`);
    } catch (error) {
        sessions.delete(sessionId);
        console.error("Failed to start SSE session:", error);
        if (!res.headersSent) {
            res.writeHead(500).end("Failed to establish SSE connection");
        }
    }
}

/**
 * Handle POST message requests
 */
async function handlePostMessage(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL
) {
    // Set CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type");

    const sessionId = url.searchParams.get("sessionId");

    if (!sessionId) {
        res.writeHead(400).end("Missing sessionId query parameter");
        return;
    }

    const session = sessions.get(sessionId);

    if (!session) {
        res.writeHead(404).end("Unknown session");
        return;
    }

    try {
        await session.transport.handlePostMessage(req, res);
    } catch (error) {
        console.error("Failed to process message:", error);
        if (!res.headersSent) {
            res.writeHead(500).end("Failed to process message");
        }
    }
}

/**
 * Handle CORS preflight requests
 */
function handleCorsPreflightRequest(res: ServerResponse) {
    res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
        "Access-Control-Max-Age": "86400", // 24 hours
    });
    res.end();
}

// Server configuration
const portEnv = Number(process.env.PORT ?? 8001);
const port = Number.isFinite(portEnv) ? portEnv : 8001;

/**
 * Create and start the HTTP server
 */
const httpServer = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
        if (!req.url) {
            res.writeHead(400).end("Missing URL");
            return;
        }

        const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

        // Handle CORS preflight requests
        if (
            req.method === "OPTIONS" &&
            (url.pathname === ssePath || url.pathname === postPath)
        ) {
            handleCorsPreflightRequest(res);
            return;
        }

        // Handle SSE connection
        if (req.method === "GET" && url.pathname === ssePath) {
            await handleSseRequest(res);
            return;
        }

        // Handle POST messages
        if (req.method === "POST" && url.pathname === postPath) {
            await handlePostMessage(req, res, url);
            return;
        }

        // Handle health check
        if (req.method === "GET" && url.pathname === "/health") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                status: "healthy",
                server: "todo-mcp-server",
                version: "1.0.0",
                timestamp: new Date().toISOString()
            }));
            return;
        }

        // 404 for all other requests
        res.writeHead(404).end("Not Found");
    }
);

// Error handling
httpServer.on("clientError", (err: Error, socket) => {
    console.error("HTTP client error:", err);
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

httpServer.on("error", (err: Error) => {
    console.error("HTTP server error:", err);
});

// Graceful shutdown
process.on("SIGINT", () => {
    console.log("\nShutting down server...");
    httpServer.close(() => {
        console.log("Server closed");
        process.exit(0);
    });
});

process.on("SIGTERM", () => {
    console.log("Received SIGTERM, shutting down gracefully");
    httpServer.close(() => {
        process.exit(0);
    });
});

// Start the server
httpServer.listen(port, () => {
    console.log(`Todo MCP server listening on http://localhost:${port}`);
    console.log(`  Health check: GET http://localhost:${port}/health`);
    console.log(`  SSE stream: GET http://localhost:${port}${ssePath}`);
    console.log(`  Message endpoint: POST http://localhost:${port}${postPath}?sessionId=...`);
    console.log(`  Storage: ${defaultTodoStorage.getFilePath()}`);
});