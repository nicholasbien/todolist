"""
Agent module for AI-powered task management and weather information.

This module provides direct tool implementations and agent orchestration
to replace the previous Node.js MCP implementation with a simpler,
more performant Python backend solution.
"""

from .agent import router as agent_router
from .tools import AVAILABLE_TOOLS

__all__ = ["AVAILABLE_TOOLS", "agent_router"]
