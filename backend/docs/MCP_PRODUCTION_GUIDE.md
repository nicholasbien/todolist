# MCP Integration: Production Considerations & Solutions

## Current Implementation Issues

The current MCP integration in `agent.py` has several resource management concerns that could cause problems in production:

### 🚨 Problems with Current Implementation

1. **Resource Leaks**
   - Subprocesses spawn for each user but are never properly terminated
   - Global dictionaries (`mcp_sessions`, `mcp_contexts`) grow indefinitely
   - No cleanup mechanism when connections die

2. **Scalability Issues**
   - Each user request could potentially spawn a new MCP subprocess
   - No limit on concurrent subprocesses
   - No connection pooling or reuse strategy

3. **Reliability Concerns**
   - No health checks for dead connections
   - No automatic reconnection on failure
   - No timeout handling for stuck processes

4. **Memory & CPU Impact**
   - Unbounded subprocess creation
   - Python subprocesses can consume significant memory (~30-50MB each)
   - With 100 concurrent users, could spawn 100 subprocesses = 3-5GB RAM

## Recommended Solutions

### Solution 1: Connection Pool with Shared MCP Server

Create a connection pool that maintains a single shared MCP subprocess for all users:

```python
# agent_mcp_improved.py
"""Improved MCP connection management for production use."""

import asyncio
import logging
import os
from typing import Optional
from contextlib import asynccontextmanager
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

logger = logging.getLogger(__name__)

class MCPConnectionPool:
    """Manages a single shared MCP server connection for all users."""

    def __init__(self):
        self.session: Optional[ClientSession] = None
        self.context = None
        self.lock = asyncio.Lock()
        self.subprocess = None
        self.connection_count = 0
        self.max_retries = 3

    async def get_session(self) -> Optional[ClientSession]:
        """Get or create the shared MCP session."""
        async with self.lock:
            # If we have a healthy session, return it
            if self.session:
                try:
                    # Ping to check if connection is alive
                    await self.session.list_tools()
                    self.connection_count += 1
                    return self.session
                except Exception as e:
                    logger.warning(f"MCP session unhealthy, reconnecting: {e}")
                    await self._cleanup()

            # Try to connect with retries
            for attempt in range(self.max_retries):
                try:
                    await self._connect()
                    if self.session:
                        self.connection_count += 1
                        return self.session
                except Exception as e:
                    logger.error(f"MCP connection attempt {attempt + 1} failed: {e}")
                    await asyncio.sleep(1)  # Brief delay before retry

            return None

    async def _connect(self):
        """Create new MCP connection."""
        mcp_server_path = os.path.join(
            os.path.dirname(__file__), "..", "mcp_server.py"
        )

        if not os.path.exists(mcp_server_path):
            raise FileNotFoundError(f"MCP server not found at: {mcp_server_path}")

        server = StdioServerParameters(
            command=os.sys.executable,
            args=[mcp_server_path],
            env=dict(os.environ)
        )

        logger.info(f"Starting MCP server subprocess from: {mcp_server_path}")

        # Start the subprocess
        self.context = stdio_client(server)
        read, write = await self.context.__aenter__()

        # Create session
        self.session = ClientSession(read, write)
        await self.session.__aenter__()
        await self.session.initialize()

        logger.info("MCP server connected successfully")

    async def _cleanup(self):
        """Clean up the current connection."""
        if self.session:
            try:
                await self.session.__aexit__(None, None, None)
            except Exception as e:
                logger.error(f"Error closing MCP session: {e}")
            self.session = None

        if self.context:
            try:
                await self.context.__aexit__(None, None, None)
            except Exception as e:
                logger.error(f"Error closing MCP context: {e}")
            self.context = None

    async def shutdown(self):
        """Gracefully shutdown the MCP connection."""
        async with self.lock:
            logger.info(f"Shutting down MCP pool after {self.connection_count} uses")
            await self._cleanup()

# Single global instance
_mcp_pool = None

def get_mcp_pool() -> MCPConnectionPool:
    """Get the global MCP connection pool."""
    global _mcp_pool
    if _mcp_pool is None:
        _mcp_pool = MCPConnectionPool()
    return _mcp_pool

async def get_mcp_session() -> Optional[ClientSession]:
    """Get an MCP session from the pool."""
    pool = get_mcp_pool()
    return await pool.get_session()

async def shutdown_mcp():
    """Shutdown the MCP connection pool."""
    global _mcp_pool
    if _mcp_pool:
        await _mcp_pool.shutdown()
        _mcp_pool = None
```

### Solution 2: FastAPI Lifecycle Management

Integrate MCP lifecycle with FastAPI's startup/shutdown events:

```python
# agent_mcp_lifecycle.py
"""FastAPI lifecycle management for MCP connections."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
import logging

logger = logging.getLogger(__name__)

@asynccontextmanager
async def mcp_lifespan(app: FastAPI):
    """Manage MCP server lifecycle with FastAPI."""

    # Startup
    logger.info("Starting MCP connection pool...")
    from .agent_mcp_improved import get_mcp_pool
    pool = get_mcp_pool()

    # Pre-warm the connection
    session = await pool.get_session()
    if session:
        logger.info("MCP connection pool ready")
    else:
        logger.warning("MCP connection pool failed to initialize")

    yield

    # Shutdown
    logger.info("Shutting down MCP connection pool...")
    from .agent_mcp_improved import shutdown_mcp
    await shutdown_mcp()
    logger.info("MCP connection pool shutdown complete")

# Usage in app.py:
# app = FastAPI(lifespan=mcp_lifespan)
```

### Solution 3: Run MCP as Standalone Service

For production, run MCP as a separate service instead of subprocess:

```python
#!/usr/bin/env python3
# run_mcp_server.py
"""Run MCP server as a standalone service."""

import asyncio
import logging
import sys
import os

# Add current directory to path
sys.path.insert(0, os.path.dirname(__file__))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def main():
    """Run the MCP server."""
    logger.info("Starting MCP server as standalone service...")

    # Import and run the MCP server
    from mcp_server import mcp

    try:
        logger.info("MCP server running on stdio transport...")
        mcp.run()
    except KeyboardInterrupt:
        logger.info("MCP server shutting down...")
    except Exception as e:
        logger.error(f"MCP server error: {e}", exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
```

## Integration Changes for agent.py

To use the connection pool in your existing `agent.py`:

```python
# Replace the current connect_to_mcp_server function with:
from .agent_mcp_improved import get_mcp_session

async def stream_agent_response(...):
    # Instead of:
    # mcp_session = await connect_to_mcp_server()

    # Use:
    mcp_session = await get_mcp_session()
    # Rest of the code remains the same
```

## Production Deployment Recommendations

### 1. Use Process Managers
For production, run MCP server as a systemd service:

```ini
# /etc/systemd/system/mcp-server.service
[Unit]
Description=MCP Server for todolist
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/todolist/backend
Environment="PATH=/path/to/venv/bin"
ExecStart=/path/to/venv/bin/python run_mcp_server.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### 2. Use Docker Compose
```yaml
version: '3.8'
services:
  backend:
    build: ./backend
    environment:
      - MCP_SERVER_URL=mcp-server:8080
    depends_on:
      - mcp-server

  mcp-server:
    build: ./mcp-server
    ports:
      - "8080:8080"
    restart: always
```

### 3. Monitoring & Health Checks
Add health checks to monitor subprocess health:

```python
async def health_check():
    """Health check endpoint for MCP integration."""
    pool = get_mcp_pool()
    session = await pool.get_session()
    if session:
        try:
            tools = await session.list_tools()
            return {
                "status": "healthy",
                "mcp_tools": len(tools.tools),
                "connection_count": pool.connection_count
            }
        except Exception as e:
            return {"status": "unhealthy", "error": str(e)}
    return {"status": "disconnected"}
```

## Performance Comparison

| Approach | Memory Usage | CPU Impact | Scalability | Complexity |
|----------|-------------|------------|-------------|------------|
| **Current (Per-User Subprocess)** | High (30-50MB × users) | High | Poor | Low |
| **Connection Pool** | Low (30-50MB total) | Low | Good | Medium |
| **Standalone Service** | Lowest (separate process) | Lowest | Best | High |

## Key Benefits of Improved Approach

1. **Resource Efficiency**
   - Single subprocess serves all users
   - ~100x reduction in memory usage at scale
   - Minimal CPU overhead

2. **Reliability**
   - Automatic reconnection on failure
   - Health checks before use
   - Graceful shutdown handling

3. **Scalability**
   - Can handle thousands of concurrent users
   - No subprocess explosion
   - Predictable resource usage

4. **Maintainability**
   - Clean separation of concerns
   - Easy to monitor and debug
   - Can be deployed independently

## Implementation Priority

1. **Quick Fix** (5 minutes): Add MAX_AGENT_STEPS limit ✅ (already done)
2. **Better** (30 minutes): Implement connection pool
3. **Best** (2 hours): Deploy as standalone service with proper process management

The connection pool approach provides the best balance of improvement vs. implementation effort for most use cases.
