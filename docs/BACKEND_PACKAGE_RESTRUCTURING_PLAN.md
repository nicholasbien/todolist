# Backend Python Package Restructuring Plan

## Overview

This document outlines a comprehensive plan to restructure the backend from a collection of loose Python files into a proper Python package structure. This will eliminate the need for `sys.path.append` workarounds, improve code organization, and follow Python packaging best practices.

## Current Structure Issues

```
backend/
├── app.py                    # Main FastAPI app
├── auth.py                   # Auth functions
├── todos.py                  # Todo operations
├── journals.py               # Journal operations
├── spaces.py                 # Space management
├── categories.py             # Category management
├── db.py                     # Database connections
├── classify.py               # OpenAI classification
├── email_summary.py          # Email functionality
├── agent/                    # Agent module (needs sys.path.append)
│   ├── __init__.py
│   ├── agent.py              # Router with sys.path hacks
│   ├── schemas.py            # Pydantic schemas
│   └── tools.py              # Tool implementations with sys.path hacks
├── tests/                    # Test files
└── venv/
```

### Problems with Current Structure

1. **Import Hacks**: Agent module requires `sys.path.append()` to import backend modules
2. **Flat Structure**: All backend logic in root directory lacks organization
3. **Mixed Concerns**: API routes, business logic, and models all mixed together
4. **Testing Issues**: Difficult to organize and run tests properly
5. **IDE Issues**: Poor autocompletion and navigation
6. **Deployment Issues**: Hard to package properly for production

## Proposed New Structure

```
backend/
├── main.py                   # Entry point (replaces app.py)
├── requirements.txt
├── README.md
├── .env.example
├── venv/
└── todoapp/                  # Main package
    ├── __init__.py
    ├── app.py                # FastAPI app setup
    ├── config/
    │   ├── __init__.py
    │   └── settings.py       # Configuration management
    ├── core/
    │   ├── __init__.py
    │   ├── auth.py           # Auth utilities (from auth.py)
    │   ├── database.py       # DB connections (from db.py)
    │   └── security.py       # Security utilities
    ├── models/
    │   ├── __init__.py
    │   ├── todo.py           # Todo Pydantic models
    │   ├── user.py           # User models
    │   ├── journal.py        # Journal models
    │   ├── space.py          # Space models
    │   └── category.py       # Category models
    ├── api/
    │   ├── __init__.py
    │   ├── routes/
    │   │   ├── __init__.py
    │   │   ├── todos.py      # Todo API routes
    │   │   ├── auth.py       # Auth API routes
    │   │   ├── journals.py   # Journal routes
    │   │   ├── spaces.py     # Space routes
    │   │   ├── categories.py # Category routes
    │   │   ├── insights.py   # Insights routes
    │   │   ├── chat.py       # Chat routes
    │   │   └── agent.py      # Agent routes (from agent/agent.py)
    │   └── dependencies.py   # FastAPI dependencies
    ├── services/
    │   ├── __init__.py
    │   ├── todo_service.py   # Business logic for todos
    │   ├── auth_service.py   # Auth business logic
    │   ├── journal_service.py# Journal business logic
    │   ├── space_service.py  # Space business logic
    │   ├── category_service.py# Category business logic
    │   ├── classify_service.py# OpenAI classification
    │   └── email_service.py  # Email functionality
    ├── agent/
    │   ├── __init__.py
    │   ├── schemas.py        # Tool schemas (from agent/schemas.py)
    │   └── tools.py          # Tool implementations (from agent/tools.py)
    └── tests/
        ├── __init__.py
        ├── conftest.py       # Test configuration
        ├── test_todos.py
        ├── test_auth.py
        ├── test_journals.py
        ├── test_spaces.py
        ├── test_categories.py
        ├── test_agent.py
        └── fixtures/         # Test data fixtures
```

## Migration Steps

### Phase 1: Create Package Structure

1. **Create main package directory**
   ```bash
   mkdir -p todoapp/{config,core,models,api/routes,services,agent,tests/fixtures}
   ```

2. **Create all `__init__.py` files**
   ```bash
   touch todoapp/__init__.py
   touch todoapp/config/__init__.py
   touch todoapp/core/__init__.py
   touch todoapp/models/__init__.py
   touch todoapp/api/__init__.py
   touch todoapp/api/routes/__init__.py
   touch todoapp/services/__init__.py
   touch todoapp/agent/__init__.py
   touch todoapp/tests/__init__.py
   ```

3. **Create `main.py` entry point**
   ```python
   # main.py
   from todoapp.app import create_app
   import uvicorn

   app = create_app()

   if __name__ == "__main__":
       uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
   ```

### Phase 2: Move and Refactor Core Modules

1. **Move core functionality**
   - `auth.py` → `todoapp/core/auth.py`
   - `db.py` → `todoapp/core/database.py`

2. **Extract Pydantic models**
   - Extract Todo model from `todos.py` → `todoapp/models/todo.py`
   - Extract User models from `auth.py` → `todoapp/models/user.py`
   - Extract Journal model from `journals.py` → `todoapp/models/journal.py`
   - Extract Space model from `spaces.py` → `todoapp/models/space.py`
   - Extract Category models → `todoapp/models/category.py`

3. **Update imports to use package-relative imports**
   ```python
   # Before
   from db import collections
   from auth import verify_session

   # After
   from todoapp.core.database import collections
   from todoapp.core.auth import verify_session
   ```

### Phase 3: Restructure API Routes

1. **Move route handlers to `todoapp/api/routes/`**
   - Extract routes from `todos.py` → `todoapp/api/routes/todos.py`
   - Extract routes from `auth.py` → `todoapp/api/routes/auth.py`
   - Extract routes from `journals.py` → `todoapp/api/routes/journals.py`
   - Extract routes from `spaces.py` → `todoapp/api/routes/spaces.py`
   - Extract routes from `categories.py` → `todoapp/api/routes/categories.py`

2. **Create proper FastAPI routers**
   ```python
   # todoapp/api/routes/todos.py
   from fastapi import APIRouter
   from todoapp.services.todo_service import TodoService
   from todoapp.models.todo import Todo

   router = APIRouter(prefix="/todos", tags=["todos"])

   @router.get("/")
   async def get_todos():
       # Route logic here
   ```

3. **Move `app.py` logic to `todoapp/app.py`**
   ```python
   # todoapp/app.py
   from fastapi import FastAPI
   from todoapp.api.routes import todos, auth, journals, spaces, categories, agent

   def create_app() -> FastAPI:
       app = FastAPI()
       app.include_router(todos.router)
       app.include_router(auth.router)
       app.include_router(journals.router)
       app.include_router(spaces.router)
       app.include_router(categories.router)
       app.include_router(agent.router)
       return app
   ```

### Phase 4: Move Agent Module

1. **Move agent contents to `todoapp/agent/`**
   - `agent/schemas.py` → `todoapp/agent/schemas.py`
   - `agent/tools.py` → `todoapp/agent/tools.py`

2. **Update imports to use package-relative imports**
   ```python
   # todoapp/agent/tools.py - AFTER restructuring
   from todoapp.core.database import collections
   from todoapp.models.todo import Todo
   from todoapp.models.journal import JournalEntry
   from todoapp.services.todo_service import create_todo, get_todos
   from todoapp.services.journal_service import create_journal_entry
   from .schemas import TaskAddRequest, WeatherCurrentRequest
   ```

3. **Remove all `sys.path.append` hacks**
   - Delete `sys.path.append(os.path.join(os.path.dirname(__file__), ".."))` lines
   - Remove `# noqa: E402` comments
   - Clean up import ordering

4. **Update agent router registration**
   ```python
   # todoapp/api/routes/agent.py
   from todoapp.agent.tools import AVAILABLE_TOOLS
   from todoapp.agent.schemas import OPENAI_TOOL_SCHEMAS
   ```

### Phase 5: Create Service Layer

1. **Extract business logic to services**
   ```python
   # todoapp/services/todo_service.py
   from todoapp.models.todo import Todo
   from todoapp.core.database import collections

   class TodoService:
       @staticmethod
       async def create_todo(todo: Todo):
           # Business logic here
   ```

2. **Create service instances**
   - `TodoService` for todo operations
   - `AuthService` for authentication
   - `JournalService` for journals
   - `SpaceService` for space management
   - `CategoryService` for categories
   - `ClassifyService` for OpenAI classification
   - `EmailService` for email functionality

### Phase 6: Update Configuration

1. **Create configuration management**
   ```python
   # todoapp/config/settings.py
   from pydantic import BaseSettings

   class Settings(BaseSettings):
       openai_api_key: str
       mongodb_url: str = "mongodb://localhost:27017"
       jwt_secret: str

       class Config:
           env_file = ".env"
   ```

2. **Update all import paths**
   - Update imports in all files to use new package structure
   - Update test imports
   - Update any deployment scripts

3. **Update `requirements.txt` if needed**
   - Add any new dependencies
   - Remove any unused dependencies

4. **Test all functionality**
   - Run all tests
   - Test API endpoints
   - Test agent functionality
   - Verify database connections

## Benefits

### 1. Clean Imports
- **Before**: `sys.path.append(os.path.join(os.path.dirname(__file__), ".."))`
- **After**: `from todoapp.core.database import collections`

### 2. Better Organization
- **Separation of Concerns**: Models, services, API routes, and core utilities properly separated
- **Logical Structure**: Related functionality grouped together
- **Scalability**: Easy to add new features in the right place

### 3. Improved Testability
- **Isolated Testing**: Test individual components in isolation
- **Better Fixtures**: Organized test data and setup
- **Coverage**: Easier to track test coverage across modules

### 4. Enhanced Maintainability
- **Standard Structure**: Follows Python packaging conventions
- **Documentation**: Clear module boundaries and responsibilities
- **Refactoring**: Easier to refactor and modify code

### 5. Better IDE Support
- **Autocompletion**: Proper import resolution
- **Navigation**: Jump to definition across modules
- **Type Checking**: Better mypy integration

### 6. Easier Deployment
- **Packaging**: Can be packaged as a proper Python package
- **Docker**: Cleaner Dockerfile with proper package structure
- **Dependencies**: Clear dependency management

## Example Import Changes

### Before Restructuring
```python
# agent/tools.py - BEFORE
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))  # noqa: E402

from db import collections  # noqa: E402
from todos import Todo, create_todo, get_todos  # noqa: E402
from journals import JournalEntry, create_journal_entry  # noqa: E402
from .schemas import TaskAddRequest  # noqa: E402
```

### After Restructuring
```python
# todoapp/agent/tools.py - AFTER
from todoapp.core.database import collections
from todoapp.models.todo import Todo
from todoapp.models.journal import JournalEntry
from todoapp.services.todo_service import create_todo, get_todos
from todoapp.services.journal_service import create_journal_entry
from .schemas import TaskAddRequest
```

## Migration Checklist

### Phase 1: Package Structure ✅
- [ ] Create `todoapp/` directory structure
- [ ] Create all `__init__.py` files
- [ ] Create `main.py` entry point

### Phase 2: Core Modules
- [ ] Move `auth.py` → `todoapp/core/auth.py`
- [ ] Move `db.py` → `todoapp/core/database.py`
- [ ] Extract models to `todoapp/models/`
- [ ] Update core imports

### Phase 3: API Routes
- [ ] Move route handlers to `todoapp/api/routes/`
- [ ] Create FastAPI routers
- [ ] Move `app.py` → `todoapp/app.py`
- [ ] Update route imports

### Phase 4: Agent Module
- [ ] Move `agent/` → `todoapp/agent/`
- [ ] Remove `sys.path.append` hacks
- [ ] Update agent imports
- [ ] Test agent functionality

### Phase 5: Services
- [ ] Create service layer
- [ ] Extract business logic
- [ ] Update service imports

### Phase 6: Configuration
- [ ] Create settings management
- [ ] Update all imports
- [ ] Test functionality
- [ ] Update deployment configs

## Testing Strategy

1. **Before Migration**: Run full test suite to establish baseline
2. **During Migration**: Test each phase incrementally
3. **After Migration**: Comprehensive testing of all functionality
4. **Performance Testing**: Ensure no performance regressions

## Rollback Plan

1. **Git Branch**: Perform migration on feature branch
2. **Backup**: Keep current structure until migration verified
3. **Incremental**: Can roll back individual phases if needed
4. **Testing**: Comprehensive testing before merging

## Timeline Estimate

- **Phase 1**: 1-2 hours (Package structure)
- **Phase 2**: 3-4 hours (Core modules)
- **Phase 3**: 4-6 hours (API routes)
- **Phase 4**: 2-3 hours (Agent module)
- **Phase 5**: 3-4 hours (Service layer)
- **Phase 6**: 2-3 hours (Configuration and testing)

**Total Estimated Time**: 15-22 hours

## Next Steps

1. **Review Plan**: Get approval for the restructuring approach
2. **Create Branch**: Create feature branch for migration work
3. **Start Phase 1**: Begin with package structure creation
4. **Test Incrementally**: Test each phase before proceeding
5. **Update Documentation**: Update all documentation after migration

This restructuring will modernize the backend architecture and eliminate the technical debt from the current flat file structure, making the codebase much more maintainable and professional.
