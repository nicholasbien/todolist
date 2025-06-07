#!/usr/bin/env python3
"""
Pytest configuration and shared fixtures.
"""

import os
import sys

import pytest

# Add the backend directory to Python path so we can import modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Common test configuration
BASE_URL = "http://localhost:8000"


@pytest.fixture(scope="session")
def api_base_url():
    """Base URL for API tests."""
    return BASE_URL


@pytest.fixture
def test_email():
    """Test email for authentication tests."""
    return "pytest@example.com"


@pytest.fixture
def test_email2():
    """Second test email for user isolation tests."""
    return "pytest2@example.com"
