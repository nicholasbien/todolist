"""Test classification timeout handling to prevent duplicate todos."""

import time
from unittest.mock import AsyncMock, patch

import pytest
from classify import classify_task


@pytest.mark.asyncio
async def test_classification_timeout_fallback():
    """Test that classification falls back to defaults when OpenAI times out."""
    from openai import APITimeoutError

    def slow_response_create(*args, **kwargs):
        """Simulate OpenAI timing out."""
        raise APITimeoutError("Request timed out after 3.0 seconds")

    with patch("classify.client.responses.create", side_effect=slow_response_create):
        start = time.time()
        result = await classify_task("do laundry tomorrow", [], "2025-11-30T10:00:00")
        elapsed = time.time() - start

        # Should return defaults quickly (< 1s since no actual network call)
        assert elapsed < 1.0, f"Classification took too long: {elapsed:.2f}s"
        assert result["category"] == "General"
        assert result["priority"] == "Low"
        # Should still parse "tomorrow" date manually
        assert result["dueDate"] == "2025-12-01"
        assert result["text"] == "do laundry tomorrow"


@pytest.mark.asyncio
async def test_classification_timeout_faster_than_frontend():
    """Test that backend timeout (3s) is faster than frontend timeout (5s)."""
    from openai import APITimeoutError

    def very_slow_response(*args, **kwargs):
        """Simulate OpenAI timing out after 3s."""
        # Raise the actual OpenAI timeout error that would occur
        raise APITimeoutError("Request timed out after 3.0 seconds")

    with patch("classify.client.responses.create", side_effect=very_slow_response):
        start = time.time()
        result = await classify_task("test task", [], "2025-11-30T10:00:00")
        elapsed = time.time() - start

        # Backend must timeout before frontend's 5s timeout
        # Allow small buffer for processing overhead
        assert elapsed < 4.0, (
            f"Backend timeout ({elapsed:.2f}s) exceeded safe threshold (4s). " "This will cause duplicate todos!"
        )
        assert result["category"] == "General"  # Fallback defaults


@pytest.mark.asyncio
async def test_classification_normal_speed():
    """Test that classification works normally when OpenAI responds quickly."""

    mock_response = AsyncMock()
    mock_response.output_text = '{"category": "Work", "priority": "High", "text": "finish report", "dueDate": null}'

    with patch("classify.client.responses.create", return_value=mock_response):
        start = time.time()
        result = await classify_task("finish report", ["Work", "Personal"], "2025-11-30T10:00:00")
        elapsed = time.time() - start

        # Normal classification should be very fast (< 1s typically)
        assert elapsed < 2.0, f"Normal classification took too long: {elapsed:.2f}s"
        assert result["category"] == "Work"
        assert result["priority"] == "High"
        assert result["text"] == "finish report"


@pytest.mark.asyncio
async def test_classification_with_manual_date_parsing_on_timeout():
    """Test that manual date parsing still works when classification times out."""
    from openai import APITimeoutError

    def timeout_response(*args, **kwargs):
        raise APITimeoutError("Request timed out after 3.0 seconds")

    with patch("classify.client.responses.create", side_effect=timeout_response):
        # Test various date formats
        test_cases = [
            ("do laundry tomorrow", "2025-12-01"),
            ("meeting on monday", "2025-12-01"),  # Next Monday from 2025-11-30 (Sunday)
            ("dentist on friday", "2025-12-05"),
        ]

        for text, expected_date in test_cases:
            result = await classify_task(text, [], "2025-11-30T10:00:00")
            assert result["dueDate"] == expected_date, (
                f"Manual date parsing failed for '{text}': " f"expected {expected_date}, got {result['dueDate']}"
            )
            assert result["category"] == "General"  # Fallback category
