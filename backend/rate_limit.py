"""Rate limiting configuration using slowapi.

Rate limiting is automatically disabled when USE_MOCK_DB is set,
so tests don't hit 429 errors.
"""

import os

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(
    key_func=get_remote_address,
    enabled=not os.getenv("USE_MOCK_DB"),
)
