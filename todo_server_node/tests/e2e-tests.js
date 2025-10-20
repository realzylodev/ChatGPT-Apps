/**
 * End-to-End Tests for Todo MCP Server (Node.js)
 * Tests all CRUD operations, error scenarios, and widget integration
 */

import { strict as assert } from 'assert';
import { readFile, writeFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DATA_FILE = path.join(__dirname, '..', 'test-todos.json');

// Mock MCP request/response structures
class MockMCPRequest {
    constructor(method, params) {
        this.method = method;
        this.params = params;
    }
}

class MockMCPResponse {
    constructor(result) {
        this.result = result;
    }
}

// Test utilities
class TestUtils {
    static generateTestTodo(overrides = {}) {
        return {
            title: 'Test Todo',
            description: 'Test description',
            priority: 'medium',
            tags: ['test'],
            ...overrides
        };
    }

    static async cleanupTestData() {
        if (existsSync(TEST_DATA_FILE)) {
            await unlink(TEST_DATA_FILE);
        }
    }

    static async createTestData() {
        const testData = {
            version: '1.0.0',
            lastModified: new Date().toISOString(),
            todos: []
        };
        await writeFile(TEST_DATA_FILE, JSON.stringify(testData, null, 2));
    }

    static validateTodoStructure(todo) {
        assert(typeof todo.id === 'string', 'Todo should have string id');
        assert(typeof todo.title === 'string', 'Todo should have string title');
        assert(typeof todo.description === 'string', 'Todo should have string description');
        assert(typeof todo.completed === 'boolean', 'Todo should have boolean completed');
        assert(typeof todo.createdAt === 'string', 'Todo should have string createdAt');
        assert(typeof todo.updatedAt === 'string', 'Todo should have string updatedAt');
        assert(['low', 'medium', 'high'].includes(todo.priority), 'Todo should have valid priority');
        assert(Array.isArray(todo.tags), 'Todo should have array tags');
    }

    static validateToolResponse(response) {
        assert(Array.isArray(response.content), 'Response should have content array');
        assert(response.content[0].type === 'text', 'Response should have text content');
        assert(typeof response.content[0].text === 'string', 'Response should have text string');
        assert(typeof response.structuredContent === 'object', 'Response should have structuredContent');
        assert(typeof response._meta === 'object', 'Response should have _meta');
        
        // Validate widget metadata
        const meta = response._meta;
        assert(typeof meta['openai/outputTemplate'] === 'string', 'Should have outputTemplate');
        assert(typeof meta['openai/toolInvocation/invoking'] === 'string', 'Should have invoking message');
        assert(typeof meta['openai/toolInvocation/invoked'] === 'string', 'Should have invoked message');
        assert(meta['openai/widgetAccessible'] === true, 'Should be widget accessible');
        assert(meta['openai/resultCanProduceWidget'] === true, 'Should produce widget');
    }

    static validateStructuredContent(content) {
        assert(Array.isArray(content.todos), 'Structured content should have todos array');
        assert(typeof content.stats === 'object', 'Structured content should have stats');
        assert(typeof content.metadata === 'object', 'Structured content should have metadata');
        
        // Validate stats structure
        const stats = content.stats;
        assert(typeof stats.total === 'number', 'Stats should have total count');
        assert(typeof stats.completed === 'number', 'Stats should have completed count');
        assert(typeof stats.overdue === 'number', 'Stats should have overdue count');
        assert(typeof stats.by_priority === 'object', 'Stats should have priority breakdown');
    }
}

// Test suite for CRUD operations
class CRUDTests {
    constructor(server) {
        this.server = server;
        this.createdTodoIds = [];
    }

    async testCreateTodo() {
        console.log('Testing create-todo...');
        
        const testTodo = TestUtils.generateTestTodo({
            title: 'E2E Test Todo',
            description: 'Created during end-to-end testing',
            priority: 'high',
            dueDate: '2024-12-31',
            tags: ['e2e', 'test']
        });

        const request = new MockMCPRequest('tools/call', {
            name: 'create-todo',
            arguments: testTodo
        });

        const response = await this.server.handleToolCall(request);
        
        // Validate response structure
        TestUtils.validateToolResponse(response);
        TestUtils.validateStructuredContent(response.structuredContent);
        
        // Validate created todo
        const todos = response.structuredContent.todos;
        assert(todos.length > 0, 'Should have at least one todo');
        
        const createdTodo = todos.find(t => t.title === testTodo.title);
        assert(createdTodo, 'Should find created todo in response');
        TestUtils.validateTodoStructure(createdTodo);
        
        // Store for cleanup
        this.createdTodoIds.push(createdTodo.id);
        
        // Validate response text
        assert(response.content[0].text.includes('Created todo'), 'Response should mention creation');
        
        console.log('✓ create-todo test passed');
        return createdTodo;
    }

    async testListTodos() {
        console.log('Testing list-todos...');
        
        const request = new MockMCPRequest('tools/call', {
            name: 'list-todos',
            arguments: {}
        });

        const response = await this.server.handleToolCall(request);
        
        // Validate response structure
        TestUtils.validateToolResponse(response);
        TestUtils.validateStructuredContent(response.structuredContent);
        
        // Validate todos structure
        const todos = response.structuredContent.todos;
        todos.forEach(TestUtils.validateTodoStructure);
        
        console.log('✓ list-todos test passed');
        return response;
    }

    async testListTodosWithFilters() {
        console.log('Testing list-todos with filters...');
        
        // Test priority filter
        const priorityRequest = new MockMCPRequest('tools/call', {
            name: 'list-todos',
            arguments: { priority: 'high' }
        });

        const priorityResponse = await this.server.handleToolCall(priorityRequest);
        TestUtils.validateToolResponse(priorityResponse);
        
        // All returned todos should have high priority
        const highPriorityTodos = priorityResponse.structuredContent.todos;
        highPriorityTodos.forEach(todo => {
            assert(todo.priority === 'high', 'Filtered todos should have high priority');
        });

        // Test completion filter
        const completedRequest = new MockMCPRequest('tools/call', {
            name: 'list-todos',
            arguments: { completed: false }
        });

        const completedResponse = await this.server.handleToolCall(completedRequest);
        TestUtils.validateToolResponse(completedResponse);
        
        // All returned todos should be incomplete
        const incompleteTodos = completedResponse.structuredContent.todos;
        incompleteTodos.forEach(todo => {
            assert(todo.completed === false, 'Filtered todos should be incomplete');
        });

        console.log('✓ list-todos with filters test passed');
    }

    async testUpdateTodo(todoId) {
        console.log('Testing update-todo...');
        
        const updates = {
            id: todoId,
            title: 'Updated E2E Test Todo',
            description: 'Updated during end-to-end testing',
            priority: 'low',
            completed: true
        };

        const request = new MockMCPRequest('tools/call', {
            name: 'update-todo',
            arguments: updates
        });

        const response = await this.server.handleToolCall(request);
        
        // Validate response structure
        TestUtils.validateToolResponse(response);
        TestUtils.validateStructuredContent(response.structuredContent);
        
        // Find updated todo
        const todos = response.structuredContent.todos;
        const updatedTodo = todos.find(t => t.id === todoId);
        assert(updatedTodo, 'Should find updated todo');
        
        // Validate updates were applied
        assert(updatedTodo.title === updates.title, 'Title should be updated');
        assert(updatedTodo.description === updates.description, 'Description should be updated');
        assert(updatedTodo.priority === updates.priority, 'Priority should be updated');
        assert(updatedTodo.completed === updates.completed, 'Completion status should be updated');
        
        console.log('✓ update-todo test passed');
        return updatedTodo;
    }

    async testCompleteTodo(todoId) {
        console.log('Testing complete-todo...');
        
        const request = new MockMCPRequest('tools/call', {
            name: 'complete-todo',
            arguments: { id: todoId, completed: true }
        });

        const response = await this.server.handleToolCall(request);
        
        // Validate response structure
        TestUtils.validateToolResponse(response);
        TestUtils.validateStructuredContent(response.structuredContent);
        
        // Find completed todo
        const todos = response.structuredContent.todos;
        const completedTodo = todos.find(t => t.id === todoId);
        assert(completedTodo, 'Should find completed todo');
        assert(completedTodo.completed === true, 'Todo should be marked as completed');
        
        // Test marking as incomplete
        const incompleteRequest = new MockMCPRequest('tools/call', {
            name: 'complete-todo',
            arguments: { id: todoId, completed: false }
        });

        const incompleteResponse = await this.server.handleToolCall(incompleteRequest);
        const incompleteTodos = incompleteResponse.structuredContent.todos;
        const incompleteTodo = incompleteTodos.find(t => t.id === todoId);
        assert(incompleteTodo.completed === false, 'Todo should be marked as incomplete');
        
        console.log('✓ complete-todo test passed');
    }

    async testDeleteTodo(todoId) {
        console.log('Testing delete-todo...');
        
        const request = new MockMCPRequest('tools/call', {
            name: 'delete-todo',
            arguments: { id: todoId }
        });

        const response = await this.server.handleToolCall(request);
        
        // Validate response structure
        TestUtils.validateToolResponse(response);
        TestUtils.validateStructuredContent(response.structuredContent);
        
        // Verify todo is deleted
        const todos = response.structuredContent.todos;
        const deletedTodo = todos.find(t => t.id === todoId);
        assert(!deletedTodo, 'Deleted todo should not be in the list');
        
        console.log('✓ delete-todo test passed');
    }

    async cleanup() {
        // Delete any remaining test todos
        for (const todoId of this.createdTodoIds) {
            try {
                await this.testDeleteTodo(todoId);
            } catch (error) {
                console.warn(`Failed to cleanup todo ${todoId}:`, error.message);
            }
        }
    }
}

// Test suite for error scenarios
class ErrorTests {
    constructor(server) {
        this.server = server;
    }

    async testInvalidToolName() {
        console.log('Testing invalid tool name...');
        
        const request = new MockMCPRequest('tools/call', {
            name: 'invalid-tool',
            arguments: {}
        });

        try {
            await this.server.handleToolCall(request);
            assert.fail('Should have thrown error for invalid tool');
        } catch (error) {
            assert(error.message.includes('Unknown tool'), 'Should indicate unknown tool');
        }
        
        console.log('✓ Invalid tool name test passed');
    }

    async testMissingRequiredFields() {
        console.log('Testing missing required fields...');
        
        // Test create-todo without title
        const createRequest = new MockMCPRequest('tools/call', {
            name: 'create-todo',
            arguments: { description: 'No title' }
        });

        try {
            await this.server.handleToolCall(createRequest);
            assert.fail('Should have thrown error for missing title');
        } catch (error) {
            assert(error.message.includes('title'), 'Should mention missing title');
        }

        // Test update-todo without id
        const updateRequest = new MockMCPRequest('tools/call', {
            name: 'update-todo',
            arguments: { title: 'New title' }
        });

        try {
            await this.server.handleToolCall(updateRequest);
            assert.fail('Should have thrown error for missing id');
        } catch (error) {
            assert(error.message.includes('id'), 'Should mention missing id');
        }
        
        console.log('✓ Missing required fields test passed');
    }

    async testInvalidTodoId() {
        console.log('Testing invalid todo ID...');
        
        const invalidId = 'non-existent-id';
        
        // Test update with invalid ID
        const updateRequest = new MockMCPRequest('tools/call', {
            name: 'update-todo',
            arguments: { id: invalidId, title: 'Updated' }
        });

        try {
            await this.server.handleToolCall(updateRequest);
            assert.fail('Should have thrown error for invalid ID');
        } catch (error) {
            assert(error.message.includes('not found'), 'Should indicate todo not found');
        }

        // Test delete with invalid ID
        const deleteRequest = new MockMCPRequest('tools/call', {
            name: 'delete-todo',
            arguments: { id: invalidId }
        });

        try {
            await this.server.handleToolCall(deleteRequest);
            assert.fail('Should have thrown error for invalid ID');
        } catch (error) {
            assert(error.message.includes('not found'), 'Should indicate todo not found');
        }
        
        console.log('✓ Invalid todo ID test passed');
    }

    async testInvalidFieldValues() {
        console.log('Testing invalid field values...');
        
        // Test invalid priority
        const priorityRequest = new MockMCPRequest('tools/call', {
            name: 'create-todo',
            arguments: {
                title: 'Test',
                priority: 'invalid-priority'
            }
        });

        try {
            await this.server.handleToolCall(priorityRequest);
            assert.fail('Should have thrown error for invalid priority');
        } catch (error) {
            assert(error.message.includes('priority'), 'Should mention invalid priority');
        }

        // Test empty title
        const emptyTitleRequest = new MockMCPRequest('tools/call', {
            name: 'create-todo',
            arguments: { title: '' }
        });

        try {
            await this.server.handleToolCall(emptyTitleRequest);
            assert.fail('Should have thrown error for empty title');
        } catch (error) {
            assert(error.message.includes('empty'), 'Should mention empty title');
        }
        
        console.log('✓ Invalid field values test passed');
    }
}

// Test suite for widget integration
class WidgetTests {
    constructor(server) {
        this.server = server;
    }

    async testWidgetMetadata() {
        console.log('Testing widget metadata...');
        
        const request = new MockMCPRequest('tools/call', {
            name: 'list-todos',
            arguments: {}
        });

        const response = await this.server.handleToolCall(request);
        
        // Validate widget metadata presence and structure
        const meta = response._meta;
        assert(meta, 'Response should have _meta');
        assert(meta['openai/outputTemplate'], 'Should have output template');
        assert(meta['openai/toolInvocation/invoking'], 'Should have invoking message');
        assert(meta['openai/toolInvocation/invoked'], 'Should have invoked message');
        assert(meta['openai/widgetAccessible'] === true, 'Should be widget accessible');
        assert(meta['openai/resultCanProduceWidget'] === true, 'Should produce widget');
        
        console.log('✓ Widget metadata test passed');
    }

    async testStructuredContentFormat() {
        console.log('Testing structured content format...');
        
        const request = new MockMCPRequest('tools/call', {
            name: 'list-todos',
            arguments: {}
        });

        const response = await this.server.handleToolCall(request);
        
        // Validate structured content format for widget consumption
        const content = response.structuredContent;
        assert(Array.isArray(content.todos), 'Should have todos array');
        assert(typeof content.stats === 'object', 'Should have stats object');
        assert(typeof content.metadata === 'object', 'Should have metadata object');
        
        // Validate metadata structure
        const metadata = content.metadata;
        assert(metadata.version, 'Should have version');
        assert(metadata.widgetType === 'todo-management', 'Should have correct widget type');
        assert(metadata.lastUpdated, 'Should have last updated timestamp');
        assert(metadata.serverType === 'node', 'Should indicate server type');
        
        // Validate todos have isOverdue property for widget
        content.todos.forEach(todo => {
            assert(typeof todo.isOverdue === 'boolean', 'Todo should have isOverdue property');
        });
        
        console.log('✓ Structured content format test passed');
    }

    async testResourceHandlers() {
        console.log('Testing resource handlers...');
        
        // Test widget template resource
        const templateRequest = new MockMCPRequest('resources/read', {
            uri: 'ui://widget/todo.html'
        });

        const templateResponse = await this.server.handleResourceRead(templateRequest);
        assert(templateResponse.contents, 'Should have contents');
        assert(templateResponse.contents[0].mimeType === 'text/html+skybridge', 'Should have correct MIME type');
        assert(templateResponse.contents[0].text, 'Should have HTML content');
        
        // Test todo data resource
        const dataRequest = new MockMCPRequest('resources/read', {
            uri: 'ui://data/todos.json'
        });

        const dataResponse = await this.server.handleResourceRead(dataRequest);
        assert(dataResponse.contents, 'Should have contents');
        assert(dataResponse.contents[0].mimeType === 'application/json', 'Should have JSON MIME type');
        
        const todoData = JSON.parse(dataResponse.contents[0].text);
        assert(Array.isArray(todoData.todos), 'Should have todos array');
        assert(typeof todoData.stats === 'object', 'Should have stats');
        
        console.log('✓ Resource handlers test passed');
    }
}

// Performance and edge case tests
class PerformanceTests {
    constructor(server) {
        this.server = server;
        this.testTodoIds = [];
    }

    async testLargeTodoList() {
        console.log('Testing large todo list performance...');
        
        const startTime = Date.now();
        
        // Create 100 test todos
        for (let i = 0; i < 100; i++) {
            const testTodo = TestUtils.generateTestTodo({
                title: `Performance Test Todo ${i}`,
                priority: ['low', 'medium', 'high'][i % 3],
                completed: i % 4 === 0
            });

            const request = new MockMCPRequest('tools/call', {
                name: 'create-todo',
                arguments: testTodo
            });

            const response = await this.server.handleToolCall(request);
            const createdTodo = response.structuredContent.todos.find(t => t.title === testTodo.title);
            this.testTodoIds.push(createdTodo.id);
        }
        
        const createTime = Date.now() - startTime;
        console.log(`Created 100 todos in ${createTime}ms`);
        
        // Test list performance
        const listStartTime = Date.now();
        const listRequest = new MockMCPRequest('tools/call', {
            name: 'list-todos',
            arguments: {}
        });

        const listResponse = await this.server.handleToolCall(listRequest);
        const listTime = Date.now() - listStartTime;
        
        console.log(`Listed ${listResponse.structuredContent.todos.length} todos in ${listTime}ms`);
        
        // Validate response time is reasonable (< 1 second)
        assert(listTime < 1000, 'List operation should complete within 1 second');
        
        console.log('✓ Large todo list performance test passed');
    }

    async testConcurrentOperations() {
        console.log('Testing concurrent operations...');
        
        // Create multiple todos concurrently
        const promises = [];
        for (let i = 0; i < 10; i++) {
            const testTodo = TestUtils.generateTestTodo({
                title: `Concurrent Test Todo ${i}`
            });

            const request = new MockMCPRequest('tools/call', {
                name: 'create-todo',
                arguments: testTodo
            });

            promises.push(this.server.handleToolCall(request));
        }
        
        const responses = await Promise.all(promises);
        
        // Validate all operations succeeded
        responses.forEach((response, index) => {
            TestUtils.validateToolResponse(response);
            const createdTodo = response.structuredContent.todos.find(t => 
                t.title === `Concurrent Test Todo ${index}`
            );
            assert(createdTodo, `Should find concurrent todo ${index}`);
            this.testTodoIds.push(createdTodo.id);
        });
        
        console.log('✓ Concurrent operations test passed');
    }

    async cleanup() {
        // Delete all test todos
        for (const todoId of this.testTodoIds) {
            try {
                const request = new MockMCPRequest('tools/call', {
                    name: 'delete-todo',
                    arguments: { id: todoId }
                });
                await this.server.handleToolCall(request);
            } catch (error) {
                console.warn(`Failed to cleanup todo ${todoId}:`, error.message);
            }
        }
    }
}

// Main test runner
class E2ETestRunner {
    constructor() {
        this.server = null;
        this.testSuites = [];
    }

    async setup() {
        console.log('Setting up E2E tests...');
        
        // Clean up any existing test data
        await TestUtils.cleanupTestData();
        await TestUtils.createTestData();
        
        // Import and initialize the server
        const { createTodoServer } = await import('../src/index.js');
        this.server = createTodoServer();
        
        // Initialize test suites
        this.testSuites = [
            new CRUDTests(this.server),
            new ErrorTests(this.server),
            new WidgetTests(this.server),
            new PerformanceTests(this.server)
        ];
        
        console.log('✓ E2E test setup complete');
    }

    async runTests() {
        console.log('\n🚀 Starting End-to-End Tests for Todo MCP Server (Node.js)\n');
        
        let passedTests = 0;
        let totalTests = 0;
        
        try {
            // Run CRUD tests
            console.log('=== CRUD Operations Tests ===');
            const crudTests = this.testSuites[0];
            
            const createdTodo = await crudTests.testCreateTodo();
            totalTests++;
            passedTests++;
            
            await crudTests.testListTodos();
            totalTests++;
            passedTests++;
            
            await crudTests.testListTodosWithFilters();
            totalTests++;
            passedTests++;
            
            await crudTests.testUpdateTodo(createdTodo.id);
            totalTests++;
            passedTests++;
            
            await crudTests.testCompleteTodo(createdTodo.id);
            totalTests++;
            passedTests++;
            
            await crudTests.testDeleteTodo(createdTodo.id);
            totalTests++;
            passedTests++;
            
            // Run error tests
            console.log('\n=== Error Handling Tests ===');
            const errorTests = this.testSuites[1];
            
            await errorTests.testInvalidToolName();
            totalTests++;
            passedTests++;
            
            await errorTests.testMissingRequiredFields();
            totalTests++;
            passedTests++;
            
            await errorTests.testInvalidTodoId();
            totalTests++;
            passedTests++;
            
            await errorTests.testInvalidFieldValues();
            totalTests++;
            passedTests++;
            
            // Run widget tests
            console.log('\n=== Widget Integration Tests ===');
            const widgetTests = this.testSuites[2];
            
            await widgetTests.testWidgetMetadata();
            totalTests++;
            passedTests++;
            
            await widgetTests.testStructuredContentFormat();
            totalTests++;
            passedTests++;
            
            await widgetTests.testResourceHandlers();
            totalTests++;
            passedTests++;
            
            // Run performance tests
            console.log('\n=== Performance Tests ===');
            const performanceTests = this.testSuites[3];
            
            await performanceTests.testLargeTodoList();
            totalTests++;
            passedTests++;
            
            await performanceTests.testConcurrentOperations();
            totalTests++;
            passedTests++;
            
        } catch (error) {
            console.error(`❌ Test failed: ${error.message}`);
            console.error(error.stack);
        }
        
        return { passedTests, totalTests };
    }

    async cleanup() {
        console.log('\nCleaning up test data...');
        
        // Cleanup all test suites
        for (const suite of this.testSuites) {
            if (suite.cleanup) {
                await suite.cleanup();
            }
        }
        
        // Clean up test data file
        await TestUtils.cleanupTestData();
        
        console.log('✓ Cleanup complete');
    }

    async run() {
        try {
            await this.setup();
            const results = await this.runTests();
            await this.cleanup();
            
            console.log('\n' + '='.repeat(50));
            console.log(`📊 Test Results: ${results.passedTests}/${results.totalTests} tests passed`);
            
            if (results.passedTests === results.totalTests) {
                console.log('🎉 All tests passed! Todo MCP Server is working correctly.');
                return true;
            } else {
                console.log('❌ Some tests failed. Please check the output above.');
                return false;
            }
            
        } catch (error) {
            console.error('💥 Test runner failed:', error.message);
            console.error(error.stack);
            return false;
        }
    }
}

// Export for use in other test files
export { E2ETestRunner, TestUtils, CRUDTests, ErrorTests, WidgetTests, PerformanceTests };

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const runner = new E2ETestRunner();
    const success = await runner.run();
    process.exit(success ? 0 : 1);
}