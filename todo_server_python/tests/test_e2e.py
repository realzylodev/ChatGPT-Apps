#!/usr/bin/env python3
"""
End-to-End Tests for Todo MCP Server (Python)
Tests all CRUD operations, error scenarios, and widget integration
"""

import asyncio
import json
import os
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

import pytest

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from main import (
    list_todos, create_todo, update_todo, complete_todo, delete_todo,
    get_todo_widget_template, get_todo_data, get_todo_js, get_todo_css,
    startup
)
from todo_types import Todo, TodoPriority
from storage import default_todo_storage
from errors import TodoError, ValidationError, NotFoundError


class TestUtils:
    """Utility functions for testing"""
    
    @staticmethod
    def generate_test_todo(overrides: Dict[str, Any] = None) -> Dict[str, Any]:
        """Generate a test todo with optional overrides"""
        base_todo = {
            'title': 'Test Todo',
            'description': 'Test description',
            'priority': 'medium',
            'tags': ['test']
        }
        if overrides:
            base_todo.update(overrides)
        return base_todo
    
    @staticmethod
    def validate_todo_structure(todo: Dict[str, Any]) -> None:
        """Validate that a todo has the correct structure"""
        assert isinstance(todo['id'], str), 'Todo should have string id'
        assert isinstance(todo['title'], str), 'Todo should have string title'
        assert isinstance(todo['description'], str), 'Todo should have string description'
        assert isinstance(todo['completed'], bool), 'Todo should have boolean completed'
        assert isinstance(todo['created_at'], str), 'Todo should have string created_at'
        assert isinstance(todo['updated_at'], str), 'Todo should have string updated_at'
        assert todo['priority'] in ['low', 'medium', 'high'], 'Todo should have valid priority'
        assert isinstance(todo['tags'], list), 'Todo should have list tags'
    
    @staticmethod
    def validate_tool_response(response: Dict[str, Any]) -> None:
        """Validate that a tool response has the correct structure"""
        assert isinstance(response['content'], list), 'Response should have content list'
        assert response['content'][0]['type'] == 'text', 'Response should have text content'
        assert isinstance(response['content'][0]['text'], str), 'Response should have text string'
        assert isinstance(response['structuredContent'], dict), 'Response should have structuredContent'
        assert isinstance(response['_meta'], dict), 'Response should have _meta'
        
        # Validate widget metadata
        meta = response['_meta']
        assert isinstance(meta['openai/outputTemplate'], str), 'Should have outputTemplate'
        assert isinstance(meta['openai/toolInvocation/invoking'], str), 'Should have invoking message'
        assert isinstance(meta['openai/toolInvocation/invoked'], str), 'Should have invoked message'
        assert meta['openai/widgetAccessible'] is True, 'Should be widget accessible'
        assert meta['openai/resultCanProduceWidget'] is True, 'Should produce widget'
    
    @staticmethod
    def validate_structured_content(content: Dict[str, Any]) -> None:
        """Validate structured content format"""
        assert isinstance(content['todos'], list), 'Structured content should have todos list'
        assert isinstance(content['stats'], dict), 'Structured content should have stats'
        assert isinstance(content['metadata'], dict), 'Structured content should have metadata'
        
        # Validate stats structure
        stats = content['stats']
        assert isinstance(stats['total'], int), 'Stats should have total count'
        assert isinstance(stats['completed'], int), 'Stats should have completed count'
        assert isinstance(stats['overdue'], int), 'Stats should have overdue count'
        assert isinstance(stats['by_priority'], dict), 'Stats should have priority breakdown'


class CRUDTests:
    """Test suite for CRUD operations"""
    
    def __init__(self):
        self.created_todo_ids: List[str] = []
    
    async def test_create_todo(self) -> Dict[str, Any]:
        """Test creating a new todo"""
        print('Testing create-todo...')
        
        test_todo = TestUtils.generate_test_todo({
            'title': 'E2E Test Todo',
            'description': 'Created during end-to-end testing',
            'priority': 'high',
            'due_date': '2024-12-31',
            'tags': ['e2e', 'test']
        })
        
        response = await create_todo(**test_todo)
        
        # Validate response structure
        TestUtils.validate_tool_response(response)
        TestUtils.validate_structured_content(response['structuredContent'])
        
        # Validate created todo
        todos = response['structuredContent']['todos']
        assert len(todos) > 0, 'Should have at least one todo'
        
        created_todo = next((t for t in todos if t['title'] == test_todo['title']), None)
        assert created_todo is not None, 'Should find created todo in response'
        TestUtils.validate_todo_structure(created_todo)
        
        # Store for cleanup
        self.created_todo_ids.append(created_todo['id'])
        
        # Validate response text
        assert 'Created todo' in response['content'][0]['text'], 'Response should mention creation'
        
        print('✓ create-todo test passed')
        return created_todo
    
    async def test_list_todos(self) -> Dict[str, Any]:
        """Test listing all todos"""
        print('Testing list-todos...')
        
        response = await list_todos()
        
        # Validate response structure
        TestUtils.validate_tool_response(response)
        TestUtils.validate_structured_content(response['structuredContent'])
        
        # Validate todos structure
        todos = response['structuredContent']['todos']
        for todo in todos:
            TestUtils.validate_todo_structure(todo)
        
        print('✓ list-todos test passed')
        return response
    
    async def test_list_todos_with_filters(self) -> None:
        """Test listing todos with various filters"""
        print('Testing list-todos with filters...')
        
        # Test priority filter
        priority_response = await list_todos(priority='high')
        TestUtils.validate_tool_response(priority_response)
        
        # All returned todos should have high priority
        high_priority_todos = priority_response['structuredContent']['todos']
        for todo in high_priority_todos:
            assert todo['priority'] == 'high', 'Filtered todos should have high priority'
        
        # Test completion filter
        completed_response = await list_todos(completed=False)
        TestUtils.validate_tool_response(completed_response)
        
        # All returned todos should be incomplete
        incomplete_todos = completed_response['structuredContent']['todos']
        for todo in incomplete_todos:
            assert todo['completed'] is False, 'Filtered todos should be incomplete'
        
        print('✓ list-todos with filters test passed')
    
    async def test_update_todo(self, todo_id: str) -> Dict[str, Any]:
        """Test updating an existing todo"""
        print('Testing update-todo...')
        
        response = await update_todo(
            id=todo_id,
            title='Updated E2E Test Todo',
            description='Updated during end-to-end testing',
            priority='low',
            completed=True
        )
        
        # Validate response structure
        TestUtils.validate_tool_response(response)
        TestUtils.validate_structured_content(response['structuredContent'])
        
        # Find updated todo
        todos = response['structuredContent']['todos']
        updated_todo = next((t for t in todos if t['id'] == todo_id), None)
        assert updated_todo is not None, 'Should find updated todo'
        
        # Validate updates were applied
        assert updated_todo['title'] == 'Updated E2E Test Todo', 'Title should be updated'
        assert updated_todo['description'] == 'Updated during end-to-end testing', 'Description should be updated'
        assert updated_todo['priority'] == 'low', 'Priority should be updated'
        assert updated_todo['completed'] is True, 'Completion status should be updated'
        
        print('✓ update-todo test passed')
        return updated_todo
    
    async def test_complete_todo(self, todo_id: str) -> None:
        """Test completing and uncompleting a todo"""
        print('Testing complete-todo...')
        
        # Mark as completed
        response = await complete_todo(id=todo_id, completed=True)
        
        # Validate response structure
        TestUtils.validate_tool_response(response)
        TestUtils.validate_structured_content(response['structuredContent'])
        
        # Find completed todo
        todos = response['structuredContent']['todos']
        completed_todo = next((t for t in todos if t['id'] == todo_id), None)
        assert completed_todo is not None, 'Should find completed todo'
        assert completed_todo['completed'] is True, 'Todo should be marked as completed'
        
        # Test marking as incomplete
        incomplete_response = await complete_todo(id=todo_id, completed=False)
        incomplete_todos = incomplete_response['structuredContent']['todos']
        incomplete_todo = next((t for t in incomplete_todos if t['id'] == todo_id), None)
        assert incomplete_todo['completed'] is False, 'Todo should be marked as incomplete'
        
        print('✓ complete-todo test passed')
    
    async def test_delete_todo(self, todo_id: str) -> None:
        """Test deleting a todo"""
        print('Testing delete-todo...')
        
        response = await delete_todo(id=todo_id)
        
        # Validate response structure
        TestUtils.validate_tool_response(response)
        TestUtils.validate_structured_content(response['structuredContent'])
        
        # Verify todo is deleted
        todos = response['structuredContent']['todos']
        deleted_todo = next((t for t in todos if t['id'] == todo_id), None)
        assert deleted_todo is None, 'Deleted todo should not be in the list'
        
        print('✓ delete-todo test passed')
    
    async def cleanup(self) -> None:
        """Clean up test todos"""
        for todo_id in self.created_todo_ids:
            try:
                await self.test_delete_todo(todo_id)
            except Exception as e:
                print(f'Failed to cleanup todo {todo_id}: {e}')


class ErrorTests:
    """Test suite for error scenarios"""
    
    async def test_missing_required_fields(self) -> None:
        """Test handling of missing required fields"""
        print('Testing missing required fields...')
        
        # Test create-todo without title
        try:
            await create_todo(title='', description='No title')
            assert False, 'Should have raised error for empty title'
        except Exception as e:
            assert 'empty' in str(e).lower(), 'Should mention empty title'
        
        # Test update-todo without id
        try:
            await update_todo(id='', title='New title')
            assert False, 'Should have raised error for missing id'
        except Exception as e:
            assert 'id' in str(e).lower(), 'Should mention missing id'
        
        print('✓ Missing required fields test passed')
    
    async def test_invalid_todo_id(self) -> None:
        """Test handling of invalid todo IDs"""
        print('Testing invalid todo ID...')
        
        invalid_id = 'non-existent-id'
        
        # Test update with invalid ID
        try:
            await update_todo(id=invalid_id, title='Updated')
            assert False, 'Should have raised error for invalid ID'
        except Exception as e:
            assert 'not found' in str(e).lower(), 'Should indicate todo not found'
        
        # Test delete with invalid ID
        try:
            await delete_todo(id=invalid_id)
            assert False, 'Should have raised error for invalid ID'
        except Exception as e:
            assert 'not found' in str(e).lower(), 'Should indicate todo not found'
        
        print('✓ Invalid todo ID test passed')
    
    async def test_invalid_field_values(self) -> None:
        """Test handling of invalid field values"""
        print('Testing invalid field values...')
        
        # Test invalid priority
        try:
            await create_todo(title='Test', priority='invalid-priority')
            assert False, 'Should have raised error for invalid priority'
        except Exception as e:
            assert 'priority' in str(e).lower() or 'validation' in str(e).lower(), 'Should mention invalid priority'
        
        print('✓ Invalid field values test passed')


class WidgetTests:
    """Test suite for widget integration"""
    
    async def test_widget_metadata(self) -> None:
        """Test widget metadata in responses"""
        print('Testing widget metadata...')
        
        response = await list_todos()
        
        # Validate widget metadata presence and structure
        meta = response['_meta']
        assert meta is not None, 'Response should have _meta'
        assert meta['openai/outputTemplate'], 'Should have output template'
        assert meta['openai/toolInvocation/invoking'], 'Should have invoking message'
        assert meta['openai/toolInvocation/invoked'], 'Should have invoked message'
        assert meta['openai/widgetAccessible'] is True, 'Should be widget accessible'
        assert meta['openai/resultCanProduceWidget'] is True, 'Should produce widget'
        
        print('✓ Widget metadata test passed')
    
    async def test_structured_content_format(self) -> None:
        """Test structured content format for widget consumption"""
        print('Testing structured content format...')
        
        response = await list_todos()
        
        # Validate structured content format for widget consumption
        content = response['structuredContent']
        assert isinstance(content['todos'], list), 'Should have todos list'
        assert isinstance(content['stats'], dict), 'Should have stats dict'
        assert isinstance(content['metadata'], dict), 'Should have metadata dict'
        
        # Validate metadata structure
        metadata = content['metadata']
        assert metadata['version'], 'Should have version'
        assert metadata['widgetType'] == 'todo-management', 'Should have correct widget type'
        assert metadata['lastUpdated'], 'Should have last updated timestamp'
        assert metadata['serverType'] == 'python', 'Should indicate server type'
        
        # Validate todos have isOverdue property for widget
        for todo in content['todos']:
            assert isinstance(todo['isOverdue'], bool), 'Todo should have isOverdue property'
        
        print('✓ Structured content format test passed')
    
    async def test_resource_handlers(self) -> None:
        """Test widget resource handlers"""
        print('Testing resource handlers...')
        
        # Test widget template resource
        template_html = await get_todo_widget_template()
        assert isinstance(template_html, str), 'Should return HTML string'
        assert len(template_html) > 0, 'Should have HTML content'
        
        # Test todo data resource
        todo_data_json = await get_todo_data()
        assert isinstance(todo_data_json, str), 'Should return JSON string'
        
        todo_data = json.loads(todo_data_json)
        assert isinstance(todo_data['todos'], list), 'Should have todos list'
        assert isinstance(todo_data['stats'], dict), 'Should have stats'
        
        print('✓ Resource handlers test passed')


class PerformanceTests:
    """Test suite for performance and edge cases"""
    
    def __init__(self):
        self.test_todo_ids: List[str] = []
    
    async def test_large_todo_list(self) -> None:
        """Test performance with large todo list"""
        print('Testing large todo list performance...')
        
        start_time = time.time()
        
        # Create 100 test todos
        for i in range(100):
            test_todo = TestUtils.generate_test_todo({
                'title': f'Performance Test Todo {i}',
                'priority': ['low', 'medium', 'high'][i % 3],
                'completed': i % 4 == 0
            })
            
            response = await create_todo(**test_todo)
            created_todo = next((t for t in response['structuredContent']['todos'] 
                               if t['title'] == test_todo['title']), None)
            self.test_todo_ids.append(created_todo['id'])
        
        create_time = time.time() - start_time
        print(f'Created 100 todos in {create_time:.2f}s')
        
        # Test list performance
        list_start_time = time.time()
        list_response = await list_todos()
        list_time = time.time() - list_start_time
        
        print(f'Listed {len(list_response["structuredContent"]["todos"])} todos in {list_time:.2f}s')
        
        # Validate response time is reasonable (< 1 second)
        assert list_time < 1.0, 'List operation should complete within 1 second'
        
        print('✓ Large todo list performance test passed')
    
    async def test_concurrent_operations(self) -> None:
        """Test concurrent operations"""
        print('Testing concurrent operations...')
        
        # Create multiple todos concurrently
        tasks = []
        for i in range(10):
            test_todo = TestUtils.generate_test_todo({
                'title': f'Concurrent Test Todo {i}'
            })
            tasks.append(create_todo(**test_todo))
        
        responses = await asyncio.gather(*tasks)
        
        # Validate all operations succeeded
        for i, response in enumerate(responses):
            TestUtils.validate_tool_response(response)
            created_todo = next((t for t in response['structuredContent']['todos'] 
                               if t['title'] == f'Concurrent Test Todo {i}'), None)
            assert created_todo is not None, f'Should find concurrent todo {i}'
            self.test_todo_ids.append(created_todo['id'])
        
        print('✓ Concurrent operations test passed')
    
    async def cleanup(self) -> None:
        """Clean up test todos"""
        for todo_id in self.test_todo_ids:
            try:
                await delete_todo(id=todo_id)
            except Exception as e:
                print(f'Failed to cleanup todo {todo_id}: {e}')


class E2ETestRunner:
    """Main test runner for end-to-end tests"""
    
    def __init__(self):
        self.test_suites = []
    
    async def setup(self) -> None:
        """Set up test environment"""
        print('Setting up E2E tests...')
        
        # Initialize storage with temporary file
        await startup()
        
        # Initialize test suites
        self.test_suites = [
            CRUDTests(),
            ErrorTests(),
            WidgetTests(),
            PerformanceTests()
        ]
        
        print('✓ E2E test setup complete')
    
    async def run_tests(self) -> Dict[str, int]:
        """Run all test suites"""
        print('\n🚀 Starting End-to-End Tests for Todo MCP Server (Python)\n')
        
        passed_tests = 0
        total_tests = 0
        
        try:
            # Run CRUD tests
            print('=== CRUD Operations Tests ===')
            crud_tests = self.test_suites[0]
            
            created_todo = await crud_tests.test_create_todo()
            total_tests += 1
            passed_tests += 1
            
            await crud_tests.test_list_todos()
            total_tests += 1
            passed_tests += 1
            
            await crud_tests.test_list_todos_with_filters()
            total_tests += 1
            passed_tests += 1
            
            await crud_tests.test_update_todo(created_todo['id'])
            total_tests += 1
            passed_tests += 1
            
            await crud_tests.test_complete_todo(created_todo['id'])
            total_tests += 1
            passed_tests += 1
            
            await crud_tests.test_delete_todo(created_todo['id'])
            total_tests += 1
            passed_tests += 1
            
            # Run error tests
            print('\n=== Error Handling Tests ===')
            error_tests = self.test_suites[1]
            
            await error_tests.test_missing_required_fields()
            total_tests += 1
            passed_tests += 1
            
            await error_tests.test_invalid_todo_id()
            total_tests += 1
            passed_tests += 1
            
            await error_tests.test_invalid_field_values()
            total_tests += 1
            passed_tests += 1
            
            # Run widget tests
            print('\n=== Widget Integration Tests ===')
            widget_tests = self.test_suites[2]
            
            await widget_tests.test_widget_metadata()
            total_tests += 1
            passed_tests += 1
            
            await widget_tests.test_structured_content_format()
            total_tests += 1
            passed_tests += 1
            
            await widget_tests.test_resource_handlers()
            total_tests += 1
            passed_tests += 1
            
            # Run performance tests
            print('\n=== Performance Tests ===')
            performance_tests = self.test_suites[3]
            
            await performance_tests.test_large_todo_list()
            total_tests += 1
            passed_tests += 1
            
            await performance_tests.test_concurrent_operations()
            total_tests += 1
            passed_tests += 1
            
        except Exception as e:
            print(f'❌ Test failed: {e}')
            import traceback
            traceback.print_exc()
        
        return {'passed': passed_tests, 'total': total_tests}
    
    async def cleanup(self) -> None:
        """Clean up test environment"""
        print('\nCleaning up test data...')
        
        # Cleanup all test suites
        for suite in self.test_suites:
            if hasattr(suite, 'cleanup'):
                await suite.cleanup()
        
        print('✓ Cleanup complete')
    
    async def run(self) -> bool:
        """Run the complete test suite"""
        try:
            await self.setup()
            results = await self.run_tests()
            await self.cleanup()
            
            print('\n' + '=' * 50)
            print(f'📊 Test Results: {results["passed"]}/{results["total"]} tests passed')
            
            if results['passed'] == results['total']:
                print('🎉 All tests passed! Todo MCP Server is working correctly.')
                return True
            else:
                print('❌ Some tests failed. Please check the output above.')
                return False
                
        except Exception as e:
            print(f'💥 Test runner failed: {e}')
            import traceback
            traceback.print_exc()
            return False


# Run tests if this file is executed directly
if __name__ == '__main__':
    async def main():
        runner = E2ETestRunner()
        success = await runner.run()
        return 0 if success else 1
    
    exit_code = asyncio.run(main())
    sys.exit(exit_code)