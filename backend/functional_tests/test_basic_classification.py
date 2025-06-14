import os

import pytest
from classify import classify_task

pytestmark = pytest.mark.skipif(
    not os.getenv("OPENAI_API_KEY"),
    reason="OPENAI_API_KEY not set - skipping functional tests that require real LLM calls",
)


@pytest.mark.asyncio
async def test_basic_due_date_parsing():
    result = await classify_task(
        "buy milk tomorrow",
        ["Shopping", "Work", "Personal"],
        "2025-06-10",
    )
    assert result["category"] in ["Shopping", "Work", "Personal", "General"]
    assert result["priority"] in ["High", "Medium", "Low"]
    assert result["dueDate"] == "2025-06-11"


@pytest.mark.asyncio
async def test_basic_without_due_date():
    result = await classify_task(
        "call mom",
        ["Personal", "Work"],
        "2025-06-10",
    )
    assert result["category"] in ["Personal", "Work", "General"]
    assert result["priority"] in ["High", "Medium", "Low"]
    assert result["dueDate"] is None
