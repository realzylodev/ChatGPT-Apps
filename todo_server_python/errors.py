"""
Comprehensive error handling system for Todo MCP Server (Python)
Provides structured error responses, logging, and HTTP status codes
"""

import logging
import traceback
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any, Union
from pydantic import BaseModel, ValidationError as PydanticValidationError


class ErrorCode(str, Enum):
    """Error codes for different types of errors"""
    # Validation errors (400)
    VALIDATION_ERROR = "VALIDATION_ERROR"
    INVALID_INPUT = "INVALID_INPUT"
    MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD"
    
    # Resource errors (404)
    TODO_NOT_FOUND = "TODO_NOT_FOUND"
    RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND"
    
    # Storage errors (500)
    STORAGE_ERROR = "STORAGE_ERROR"
    FILE_READ_ERROR = "FILE_READ_ERROR"
    FILE_WRITE_ERROR = "FILE_WRITE_ERROR"
    BACKUP_ERROR = "BACKUP_ERROR"
    
    # Server errors (500)
    INTERNAL_ERROR = "INTERNAL_ERROR"
    INITIALIZATION_ERROR = "INITIALIZATION_ERROR"
    TOOL_HANDLER_ERROR = "TOOL_HANDLER_ERROR"
    
    # Network/Transport errors (503)
    TRANSPORT_ERROR = "TRANSPORT_ERROR"
    CONNECTION_ERROR = "CONNECTION_ERROR"
    
    # Rate limiting (429)
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED"


# HTTP status code mapping
ERROR_STATUS_CODES: Dict[ErrorCode, int] = {
    ErrorCode.VALIDATION_ERROR: 400,
    ErrorCode.INVALID_INPUT: 400,
    ErrorCode.MISSING_REQUIRED_FIELD: 400,
    
    ErrorCode.TODO_NOT_FOUND: 404,
    ErrorCode.RESOURCE_NOT_FOUND: 404,
    
    ErrorCode.STORAGE_ERROR: 500,
    ErrorCode.FILE_READ_ERROR: 500,
    ErrorCode.FILE_WRITE_ERROR: 500,
    ErrorCode.BACKUP_ERROR: 500,
    ErrorCode.INTERNAL_ERROR: 500,
    ErrorCode.INITIALIZATION_ERROR: 500,
    ErrorCode.TOOL_HANDLER_ERROR: 500,
    
    ErrorCode.TRANSPORT_ERROR: 503,
    ErrorCode.CONNECTION_ERROR: 503,
    
    ErrorCode.RATE_LIMIT_EXCEEDED: 429
}


class ErrorResponse(BaseModel):
    """Structured error response"""
    error: bool = True
    message: str
    code: ErrorCode
    status_code: int
    details: Optional[Dict[str, Any]] = None
    timestamp: str
    request_id: Optional[str] = None


class TodoError(Exception):
    """Base exception class for todo-related errors"""
    
    def __init__(
        self,
        message: str,
        code: ErrorCode,
        details: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = ERROR_STATUS_CODES[code]
        self.details = details or {}
        self.timestamp = datetime.now().isoformat()
        self.request_id = request_id

    def to_response(self) -> ErrorResponse:
        """Convert to structured error response"""
        return ErrorResponse(
            message=self.message,
            code=self.code,
            status_code=self.status_code,
            details=self.details,
            timestamp=self.timestamp,
            request_id=self.request_id
        )


class ValidationError(TodoError):
    """Validation error"""
    
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None, request_id: Optional[str] = None):
        super().__init__(message, ErrorCode.VALIDATION_ERROR, details, request_id)

    @classmethod
    def from_pydantic_error(cls, error: PydanticValidationError, request_id: Optional[str] = None) -> 'ValidationError':
        """Create ValidationError from Pydantic ValidationError"""
        details = {
            "validation_errors": [
                {
                    "field": ".".join(str(loc) for loc in err["loc"]),
                    "message": err["msg"],
                    "type": err["type"],
                    "input": err.get("input")
                }
                for err in error.errors()
            ]
        }
        
        message = f"Validation failed: {', '.join(f'{err['loc']}: {err['msg']}' for err in error.errors())}"
        
        return cls(message, details, request_id)


class StorageError(TodoError):
    """Storage-related error"""
    
    def __init__(self, message: str, original_error: Optional[Exception] = None, request_id: Optional[str] = None):
        details = {}
        if original_error:
            details["original_error"] = {
                "type": type(original_error).__name__,
                "message": str(original_error),
                "traceback": traceback.format_exception(type(original_error), original_error, original_error.__traceback__)
            }
        
        super().__init__(message, ErrorCode.STORAGE_ERROR, details, request_id)


class FileError(TodoError):
    """File operation error"""
    
    def __init__(
        self,
        message: str,
        operation: str,
        file_path: str,
        original_error: Optional[Exception] = None,
        request_id: Optional[str] = None
    ):
        code_map = {
            "read": ErrorCode.FILE_READ_ERROR,
            "write": ErrorCode.FILE_WRITE_ERROR,
            "backup": ErrorCode.BACKUP_ERROR
        }
        code = code_map.get(operation, ErrorCode.STORAGE_ERROR)
        
        details = {
            "operation": operation,
            "file_path": file_path
        }
        
        if original_error:
            details["original_error"] = {
                "type": type(original_error).__name__,
                "message": str(original_error)
            }
        
        super().__init__(message, code, details, request_id)


class NotFoundError(TodoError):
    """Resource not found error"""
    
    def __init__(self, resource: str, identifier: str, request_id: Optional[str] = None):
        code = ErrorCode.TODO_NOT_FOUND if resource == "todo" else ErrorCode.RESOURCE_NOT_FOUND
        message = f"{resource} not found: {identifier}"
        details = {"resource": resource, "identifier": identifier}
        
        super().__init__(message, code, details, request_id)


# Logger setup
def setup_logger(name: str = "todo_server") -> logging.Logger:
    """Set up structured logger"""
    logger = logging.getLogger(name)
    
    if not logger.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter(
            '[%(asctime)s] %(levelname)s: %(message)s'
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
    
    return logger


# Global logger instance
logger = setup_logger()


class ErrorHandler:
    """Error handling utilities"""
    
    _request_counter = 0
    
    @classmethod
    def generate_request_id(cls) -> str:
        """Generate unique request ID"""
        cls._request_counter += 1
        return f"req_{int(datetime.now().timestamp())}_{cls._request_counter}"
    
    @classmethod
    def handle_error(cls, error: Exception, request_id: Optional[str] = None) -> ErrorResponse:
        """Handle any error and convert to structured response"""
        # Log the error
        logger.error(f"Error occurred: {str(error)}", exc_info=True, extra={"request_id": request_id})
        
        # Handle known error types
        if isinstance(error, TodoError):
            return error.to_response()
        
        # Handle Pydantic validation errors
        if isinstance(error, PydanticValidationError):
            return ValidationError.from_pydantic_error(error, request_id).to_response()
        
        # Handle file system errors
        if isinstance(error, (FileNotFoundError, PermissionError, OSError)):
            if isinstance(error, FileNotFoundError):
                return FileError(
                    "File not found",
                    "read",
                    getattr(error, 'filename', 'unknown'),
                    error,
                    request_id
                ).to_response()
            elif isinstance(error, PermissionError):
                return FileError(
                    "Permission denied",
                    "read",
                    getattr(error, 'filename', 'unknown'),
                    error,
                    request_id
                ).to_response()
            else:
                return StorageError(
                    f"File system error: {str(error)}",
                    error,
                    request_id
                ).to_response()
        
        # Handle generic errors
        return TodoError(
            str(error) or "An unexpected error occurred",
            ErrorCode.INTERNAL_ERROR,
            {"original_error": type(error).__name__},
            request_id
        ).to_response()
    
    @classmethod
    def create_tool_error_response(cls, error: Exception, tool_name: str, request_id: Optional[str] = None) -> Dict[str, Any]:
        """Create error response for tool calls"""
        error_response = cls.handle_error(error, request_id)
        
        return {
            "content": [
                {
                    "type": "text",
                    "text": f"Error in {tool_name}: {error_response.message}",
                }
            ],
            "isError": True,
            "_meta": {
                "error": error_response.model_dump(),
                "tool_name": tool_name,
                "request_id": request_id
            }
        }
    
    @classmethod
    def create_resource_error_response(cls, error: Exception, resource_uri: str, request_id: Optional[str] = None):
        """Create error response for resource requests"""
        error_response = cls.handle_error(error, request_id)
        raise ValueError(f"Failed to read resource {resource_uri}: {error_response.message}")


class RetryHandler:
    """Retry logic for transient errors"""
    
    @staticmethod
    async def with_retry(
        operation,
        max_retries: int = 3,
        delay_ms: int = 1000,
        request_id: Optional[str] = None
    ):
        """Execute operation with retry logic"""
        import asyncio
        
        last_error = None
        
        for attempt in range(1, max_retries + 1):
            try:
                if asyncio.iscoroutinefunction(operation):
                    return await operation()
                else:
                    return operation()
            except Exception as error:
                last_error = error
                
                logger.warning(
                    f"Operation failed, attempt {attempt}/{max_retries}: {str(error)}",
                    extra={"request_id": request_id, "attempt": attempt}
                )
                
                # Don't retry on validation errors or not found errors
                if isinstance(error, (ValidationError, NotFoundError)):
                    raise error
                
                # Don't retry on the last attempt
                if attempt == max_retries:
                    break
                
                # Exponential backoff
                delay = delay_ms * (2 ** (attempt - 1)) / 1000
                await asyncio.sleep(delay)
        
        raise StorageError(
            f"Operation failed after {max_retries} attempts: {str(last_error)}",
            last_error,
            request_id
        )


class HealthChecker:
    """Health check utilities"""
    
    @staticmethod
    async def check_storage_health(storage_path: str) -> Dict[str, Any]:
        """Check storage system health"""
        try:
            import os
            import tempfile
            from pathlib import Path
            
            storage_dir = Path(storage_path).parent
            
            # Check if directory exists and is accessible
            if not storage_dir.exists():
                return {"healthy": False, "error": f"Storage directory does not exist: {storage_dir}"}
            
            # Check read access
            if not os.access(storage_dir, os.R_OK):
                return {"healthy": False, "error": "No read access to storage directory"}
            
            # Check write access
            if not os.access(storage_dir, os.W_OK):
                return {"healthy": False, "error": "No write access to storage directory"}
            
            # Test write operation
            test_file = storage_dir / f".health_check_{int(datetime.now().timestamp())}"
            try:
                test_file.write_text("health check")
                test_file.unlink()
            except Exception as e:
                return {"healthy": False, "error": f"Write test failed: {str(e)}"}
            
            return {"healthy": True}
            
        except Exception as e:
            return {"healthy": False, "error": str(e)}
    
    @staticmethod
    def check_memory_usage() -> Dict[str, Any]:
        """Check memory usage"""
        try:
            import psutil
            
            process = psutil.Process()
            memory_info = process.memory_info()
            memory_percent = process.memory_percent()
            
            # Consider unhealthy if using more than 80% of available memory
            max_memory_percent = 80.0
            
            return {
                "healthy": memory_percent < max_memory_percent,
                "usage": {
                    "rss": memory_info.rss,
                    "vms": memory_info.vms,
                    "percent": memory_percent
                }
            }
            
        except ImportError:
            # psutil not available, skip memory check
            return {"healthy": True, "error": "psutil not available for memory monitoring"}
        except Exception as e:
            return {"healthy": False, "error": str(e)}