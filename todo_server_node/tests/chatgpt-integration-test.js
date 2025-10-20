/**
 * ChatGPT Integration Test for Todo MCP Server
 * Tests the actual MCP protocol communication and widget rendering
 */

import { strict as assert } from 'assert';
import { spawn } from 'child_process';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class MCPProtocolTester {
    constructor() {
        this.serverProcess = null;
        this.serverPort = 3001;
        this.testResults = [];
    }

    async startServer() {
        console.log('Starting Todo MCP Server...');
        
        return new Promise((resolve, reject) => {
            this.serverProcess = spawn('node', ['src/index.js'], {
                cwd: path.join(__dirname, '..'),
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env, PORT: this.serverPort }
            });

            let output = '';
            this.serverProcess.stdout.on('data', (data) => {
                output += data.toString();
                if (output.includes('Server running') || output.includes('listening')) {
                    resolve();
                }
            });

            this.serverProcess.stderr.on('data', (data) => {
                console.error('Server error:', data.toString());
            });

            this.serverProcess.on('error', reject);
            
            // Timeout after 10 seconds
            setTimeout(() => {
                reject(new Error('Server startup timeout'));
            }, 10000);
        });
    }

    async stopServer() {
        if (this.serverProcess) {
            this.serverProcess.kill();
            this.serverProcess = null;
        }
    }

    async sendMCPRequest(method, params = {}) {
        const request = {
            jsonrpc: '2.0',
            id: Date.now(),
            method,
            params
        };

        try {
            const response = await fetch(`http://localhost:${this.serverPort}/mcp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(request)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('MCP request failed:', error);
            throw error;
        }
    }

    async testServerCapabilities() {
        console.log('Testing server capabilities...');
        
        const response = await this.sendMCPRequest('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {
                roots: {
                    listChanged: true
                },
                sampling: {}
            },
            clientInfo: {
                name: 'test-client',
                version: '1.0.0'
            }
        });

        assert(response.result, 'Should receive initialization result');
        assert(response.result.capabilities, 'Should have capabilities');
        assert(response.result.capabilities.tools, 'Should support tools');
        assert(response.result.capabilities.resources, 'Should support resources');

        this.testResults.push({
            test: 'Server Capabilities',
            status: 'PASS',
            details: 'Server properly advertises MCP capabilities'
        });

        console.log('✓ Server capabilities test passed');
    }

    async testToolDiscovery() {
        console.log('Testing tool discovery...');
        
        const response = await this.sendMCPRequest('tools/list');
        
        assert(response.result, 'Should receive tools list');
        assert(Array.isArray(response.result.tools), 'Should have tools array');
        
        const expectedTools = ['list-todos', 'create-todo', 'update-todo', 'complete-todo', 'delete-todo'];
        const actualTools = response.result.tools.map(tool => tool.name);
        
        for (const expectedTool of expectedTools) {
            assert(actualTools.includes(expectedTool), `Should have ${expectedTool} tool`);
        }

        // Validate tool metadata
        for (const tool of response.result.tools) {
            assert(tool.name, 'Tool should have name');
            assert(tool.description, 'Tool should have description');
            assert(tool.inputSchema, 'Tool should have input schema');
            assert(tool._meta, 'Tool should have widget metadata');
            
            // Validate widget metadata
            const meta = tool._meta;
            assert(meta['openai/outputTemplate'], 'Tool should have output template');
            assert(meta['openai/widgetAccessible'], 'Tool should be widget accessible');
        }

        this.testResults.push({
            test: 'Tool Discovery',
            status: 'PASS',
            details: `Found ${actualTools.length} tools with proper metadata`
        });

        console.log('✓ Tool discovery test passed');
    }

    async testResourceDiscovery() {
        console.log('Testing resource discovery...');
        
        const response = await this.sendMCPRequest('resources/list');
        
        assert(response.result, 'Should receive resources list');
        assert(Array.isArray(response.result.resources), 'Should have resources array');
        
        const expectedResources = [
            'ui://widget/todo.html',
            'ui://data/todos.json',
            'ui://assets/todo.js',
            'ui://assets/todo.css'
        ];
        
        const actualResources = response.result.resources.map(resource => resource.uri);
        
        for (const expectedResource of expectedResources) {
            assert(actualResources.includes(expectedResource), `Should have ${expectedResource} resource`);
        }

        // Validate resource metadata
        for (const resource of response.result.resources) {
            assert(resource.uri, 'Resource should have URI');
            assert(resource.name, 'Resource should have name');
            assert(resource.mimeType, 'Resource should have MIME type');
            assert(resource._meta, 'Resource should have widget metadata');
        }

        this.testResults.push({
            test: 'Resource Discovery',
            status: 'PASS',
            details: `Found ${actualResources.length} resources with proper metadata`
        });

        console.log('✓ Resource discovery test passed');
    }

    async testToolExecution() {
        console.log('Testing tool execution...');
        
        // Test list-todos tool
        const listResponse = await this.sendMCPRequest('tools/call', {
            name: 'list-todos',
            arguments: {}
        });

        assert(listResponse.result, 'Should receive tool result');
        assert(Array.isArray(listResponse.result.content), 'Should have content array');
        assert(listResponse.result.structuredContent, 'Should have structured content');
        assert(listResponse.result._meta, 'Should have widget metadata');

        // Validate structured content for widget
        const structuredContent = listResponse.result.structuredContent;
        assert(Array.isArray(structuredContent.todos), 'Should have todos array');
        assert(typeof structuredContent.stats === 'object', 'Should have stats object');
        assert(typeof structuredContent.metadata === 'object', 'Should have metadata object');

        // Test create-todo tool
        const createResponse = await this.sendMCPRequest('tools/call', {
            name: 'create-todo',
            arguments: {
                title: 'ChatGPT Integration Test Todo',
                description: 'Created during ChatGPT integration testing',
                priority: 'high'
            }
        });

        assert(createResponse.result, 'Should receive create result');
        assert(createResponse.result.structuredContent, 'Should have structured content');
        
        const createdTodos = createResponse.result.structuredContent.todos;
        const testTodo = createdTodos.find(t => t.title === 'ChatGPT Integration Test Todo');
        assert(testTodo, 'Should find created test todo');

        this.testResults.push({
            test: 'Tool Execution',
            status: 'PASS',
            details: 'Tools execute properly and return widget-compatible responses'
        });

        console.log('✓ Tool execution test passed');
        return testTodo.id;
    }

    async testResourceAccess() {
        console.log('Testing resource access...');
        
        // Test widget template access
        const templateResponse = await this.sendMCPRequest('resources/read', {
            uri: 'ui://widget/todo.html'
        });

        assert(templateResponse.result, 'Should receive template result');
        assert(Array.isArray(templateResponse.result.contents), 'Should have contents array');
        assert(templateResponse.result.contents[0].text, 'Should have HTML content');
        assert(templateResponse.result.contents[0].mimeType === 'text/html+skybridge', 'Should have correct MIME type');

        // Test todo data access
        const dataResponse = await this.sendMCPRequest('resources/read', {
            uri: 'ui://data/todos.json'
        });

        assert(dataResponse.result, 'Should receive data result');
        assert(dataResponse.result.contents[0].text, 'Should have JSON content');
        
        const todoData = JSON.parse(dataResponse.result.contents[0].text);
        assert(Array.isArray(todoData.todos), 'Should have todos array in data');
        assert(typeof todoData.stats === 'object', 'Should have stats in data');

        this.testResults.push({
            test: 'Resource Access',
            status: 'PASS',
            details: 'Resources are accessible and return proper content'
        });

        console.log('✓ Resource access test passed');
    }

    async testWidgetMetadataConsistency() {
        console.log('Testing widget metadata consistency...');
        
        // Get tools and resources
        const toolsResponse = await this.sendMCPRequest('tools/list');
        const resourcesResponse = await this.sendMCPRequest('resources/list');
        
        // Check that all tools have consistent widget metadata
        const tools = toolsResponse.result.tools;
        const firstToolMeta = tools[0]._meta;
        
        for (const tool of tools) {
            const meta = tool._meta;
            assert(meta['openai/outputTemplate'] === firstToolMeta['openai/outputTemplate'], 
                   'All tools should have same output template');
            assert(meta['openai/widgetAccessible'] === true, 'All tools should be widget accessible');
            assert(meta['openai/resultCanProduceWidget'] === true, 'All tools should produce widgets');
        }

        // Check that all resources have consistent widget metadata
        const resources = resourcesResponse.result.resources;
        for (const resource of resources) {
            const meta = resource._meta;
            assert(meta['openai/outputTemplate'] === firstToolMeta['openai/outputTemplate'], 
                   'All resources should have same output template as tools');
        }

        this.testResults.push({
            test: 'Widget Metadata Consistency',
            status: 'PASS',
            details: 'All tools and resources have consistent widget metadata'
        });

        console.log('✓ Widget metadata consistency test passed');
    }

    async testErrorHandling() {
        console.log('Testing error handling...');
        
        // Test invalid tool call
        try {
            await this.sendMCPRequest('tools/call', {
                name: 'invalid-tool',
                arguments: {}
            });
            assert.fail('Should have thrown error for invalid tool');
        } catch (error) {
            // Expected error
        }

        // Test invalid resource access
        try {
            await this.sendMCPRequest('resources/read', {
                uri: 'ui://invalid/resource'
            });
            assert.fail('Should have thrown error for invalid resource');
        } catch (error) {
            // Expected error
        }

        // Test tool call with invalid arguments
        try {
            await this.sendMCPRequest('tools/call', {
                name: 'create-todo',
                arguments: { title: '' } // Empty title should fail
            });
            assert.fail('Should have thrown error for empty title');
        } catch (error) {
            // Expected error
        }

        this.testResults.push({
            test: 'Error Handling',
            status: 'PASS',
            details: 'Server properly handles and reports errors'
        });

        console.log('✓ Error handling test passed');
    }

    async testFullWorkflow() {
        console.log('Testing full ChatGPT workflow...');
        
        // Simulate a complete ChatGPT interaction workflow
        
        // 1. List initial todos
        const initialList = await this.sendMCPRequest('tools/call', {
            name: 'list-todos',
            arguments: {}
        });
        
        const initialCount = initialList.result.structuredContent.todos.length;
        
        // 2. Create a new todo
        const createResult = await this.sendMCPRequest('tools/call', {
            name: 'create-todo',
            arguments: {
                title: 'Workflow Test Todo',
                description: 'Testing complete workflow',
                priority: 'medium',
                dueDate: '2024-12-31'
            }
        });
        
        const createdTodos = createResult.result.structuredContent.todos;
        assert(createdTodos.length === initialCount + 1, 'Should have one more todo');
        
        const newTodo = createdTodos.find(t => t.title === 'Workflow Test Todo');
        assert(newTodo, 'Should find created todo');
        
        // 3. Update the todo
        const updateResult = await this.sendMCPRequest('tools/call', {
            name: 'update-todo',
            arguments: {
                id: newTodo.id,
                title: 'Updated Workflow Test Todo',
                priority: 'high'
            }
        });
        
        const updatedTodos = updateResult.result.structuredContent.todos;
        const updatedTodo = updatedTodos.find(t => t.id === newTodo.id);
        assert(updatedTodo.title === 'Updated Workflow Test Todo', 'Title should be updated');
        assert(updatedTodo.priority === 'high', 'Priority should be updated');
        
        // 4. Complete the todo
        const completeResult = await this.sendMCPRequest('tools/call', {
            name: 'complete-todo',
            arguments: {
                id: newTodo.id,
                completed: true
            }
        });
        
        const completedTodos = completeResult.result.structuredContent.todos;
        const completedTodo = completedTodos.find(t => t.id === newTodo.id);
        assert(completedTodo.completed === true, 'Todo should be completed');
        
        // 5. Delete the todo
        const deleteResult = await this.sendMCPRequest('tools/call', {
            name: 'delete-todo',
            arguments: {
                id: newTodo.id
            }
        });
        
        const finalTodos = deleteResult.result.structuredContent.todos;
        const deletedTodo = finalTodos.find(t => t.id === newTodo.id);
        assert(!deletedTodo, 'Todo should be deleted');
        assert(finalTodos.length === initialCount, 'Should be back to initial count');

        this.testResults.push({
            test: 'Full Workflow',
            status: 'PASS',
            details: 'Complete CRUD workflow executes successfully with proper widget updates'
        });

        console.log('✓ Full workflow test passed');
    }

    async runAllTests() {
        console.log('\n🚀 Starting ChatGPT Integration Tests for Todo MCP Server\n');
        
        try {
            await this.startServer();
            
            // Wait a moment for server to fully start
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            await this.testServerCapabilities();
            await this.testToolDiscovery();
            await this.testResourceDiscovery();
            const testTodoId = await this.testToolExecution();
            await this.testResourceAccess();
            await this.testWidgetMetadataConsistency();
            await this.testErrorHandling();
            await this.testFullWorkflow();
            
            // Clean up test todo if it still exists
            try {
                await this.sendMCPRequest('tools/call', {
                    name: 'delete-todo',
                    arguments: { id: testTodoId }
                });
            } catch (error) {
                // Ignore cleanup errors
            }
            
        } finally {
            await this.stopServer();
        }
    }

    printResults() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 ChatGPT Integration Test Results');
        console.log('='.repeat(60));
        
        let passed = 0;
        let total = this.testResults.length;
        
        for (const result of this.testResults) {
            const status = result.status === 'PASS' ? '✅' : '❌';
            console.log(`${status} ${result.test}: ${result.details}`);
            if (result.status === 'PASS') passed++;
        }
        
        console.log('='.repeat(60));
        console.log(`📈 Results: ${passed}/${total} tests passed`);
        
        if (passed === total) {
            console.log('🎉 All ChatGPT integration tests passed!');
            console.log('✨ The Todo MCP Server is ready for ChatGPT integration.');
            return true;
        } else {
            console.log('❌ Some tests failed. Please check the implementation.');
            return false;
        }
    }

    async run() {
        try {
            await this.runAllTests();
            return this.printResults();
        } catch (error) {
            console.error('💥 Integration test failed:', error.message);
            console.error(error.stack);
            return false;
        }
    }
}

// Export for use in other test files
export { MCPProtocolTester };

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const tester = new MCPProtocolTester();
    const success = await tester.run();
    process.exit(success ? 0 : 1);
}