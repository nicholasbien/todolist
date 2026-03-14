"""Simple in-memory rate limiter for FastAPI.

Uses a sliding window counter per key (IP or user ID).
Not suitable for multi-process deployments without shared state,
but works well for single-process Railway deployments.

Rate limiting is automatically disabled when USE_MOCK_DB is set,
so tests don't hit 429 errors.
"""

import logging
import os
import time
from collections import defaultdict

from fastapi import HTTPException, Request

# Disable rate limiting in test environments
_RATE_LIMITING_DISABLED = os.getenv("USE_MOCK_DB", "").lower() in (
    "true",
    "1",
    "yes",
)

logger = logging.getLogger(__name__)

# Store: key -> list of request timestamps
_request_log: dict[str, list[float]] = defaultdict(list)

# Cleanup counter to avoid unbounded memory growth
_cleanup_counter = 0
_CLEANUP_INTERVAL = 1000  # Cleanup every N requests


def _cleanup_old_entries(window_seconds: int = 300) -> None:
    """Remove entries older than the largest window to prevent memory leaks."""
    cutoff = time.monotonic() - window_seconds
    keys_to_delete = []
    for key, timestamps in _request_log.items():
        _request_log[key] = [t for t in timestamps if t > cutoff]
        if not _request_log[key]:
            keys_to_delete.append(key)
    for key in keys_to_delete:
        del _request_log[key]


def reset_rate_limits() -> None:
    """Reset all rate limit state. Useful for testing."""
    _request_log.clear()


def check_rate_limit(
    key: str,
    max_requests: int,
    window_seconds: int,
    error_message: str = "Too many requests. Please try again later.",
) -> None:
    """Check if a key has exceeded the rate limit.

    Args:
        key: Unique identifier (e.g., IP address or user ID)
        max_requests: Maximum number of requests allowed in the window
        window_seconds: Time window in seconds
        error_message: Custom error message for 429 response

    Raises:
        HTTPException: 429 if rate limit exceeded
    """
    if _RATE_LIMITING_DISABLED:
        return

    global _cleanup_counter
    _cleanup_counter += 1
    if _cleanup_counter >= _CLEANUP_INTERVAL:
        _cleanup_counter = 0
        _cleanup_old_entries()

    now = time.monotonic()
    cutoff = now - window_seconds

    # Filter to only requests within the window
    timestamps = _request_log[key]
    recent = [t for t in timestamps if t > cutoff]

    if len(recent) >= max_requests:
        logger.warning(f"Rate limit exceeded for key: {key} " f"({len(recent)}/{max_requests} in {window_seconds}s)")
        raise HTTPException(
            status_code=429,
            detail=error_message,
        )

    recent.append(now)
    _request_log[key] = recent


def get_client_ip(request: Request) -> str:
    """Extract client IP from request, respecting X-Forwarded-For behind proxies."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        # Take the first IP in the chain (original client)
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit_by_ip(
    request: Request,
    max_requests: int,
    window_seconds: int,
    endpoint: str = "",
) -> None:
    """Rate limit by client IP address. Use for unauthenticated endpoints."""
    ip = get_client_ip(request)
    key = f"ip:{ip}:{endpoint}"
    check_rate_limit(key, max_requests, window_seconds)


def rate_limit_by_user(
    user_id: str,
    max_requests: int,
    window_seconds: int,
    endpoint: str = "",
) -> None:
    """Rate limit by user ID. Use for authenticated endpoints."""
    key = f"user:{user_id}:{endpoint}"
    check_rate_limit(key, max_requests, window_seconds)
