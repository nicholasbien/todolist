# mypy: ignore-errors
import os

import pytest

from backend.classify import classify_task

# Skip all tests in this file if OPENAI_API_KEY is not set
pytestmark = pytest.mark.skipif(
    not os.getenv("OPENAI_API_KEY"),
    reason="OPENAI_API_KEY not set - skipping functional tests that require real LLM calls",
)


@pytest.mark.asyncio
async def test_classify_dentist_appointment_tuesday():
    """Test that 'dentist appointment tuesday' parses correctly with real LLM."""
    text = "dentist appointment tuesday"
    categories = ["Health", "Work", "Personal", "General"]
    date_added = "2025-06-10"  # Tuesday

    result = await classify_task(text, categories, date_added)

    # Check that the text was cleaned (no "tuesday" should remain)
    assert "tuesday" not in result["text"].lower()
    assert "dentist" in result["text"].lower()
    assert "appointment" in result["text"].lower()

    # Check that due date was parsed (should be 2025-06-10 since it's "tuesday" and reference date is Tuesday)
    assert result["dueDate"] == "2025-06-10"

    # Check that category is reasonable (likely Health)
    assert result["category"] in categories
    assert result["category"] == "Health"  # Dentist should be categorized as Health

    # Check priority is set
    assert result["priority"] in ["High", "Medium", "Low"]


@pytest.mark.asyncio
async def test_classify_party_on_friday():
    """Test that 'party on friday' parses correctly with real LLM."""
    text = "party on friday"
    categories = ["Health", "Work", "Personal", "General", "Social"]
    date_added = "2025-06-10"  # Tuesday

    result = await classify_task(text, categories, date_added)

    # Check that the text was cleaned (no "on friday" should remain)
    assert "friday" not in result["text"].lower()
    assert "on" not in result["text"].lower() or result["text"].lower() == "party"
    assert "party" in result["text"].lower()

    # Check that due date was parsed (should be 2025-06-13 since Friday is 3 days after Tuesday)
    assert result["dueDate"] == "2025-06-13"

    # Check that category is reasonable (likely Personal or Social)
    assert result["category"] in categories
    assert result["category"] in ["Personal", "Social"]  # Party should be Personal or Social

    # Check priority is set
    assert result["priority"] in ["High", "Medium", "Low"]


@pytest.mark.asyncio
async def test_classify_meeting_by_wednesday():
    """Test that 'meeting by wednesday' parses correctly with real LLM."""
    text = "meeting by wednesday"
    categories = ["Health", "Work", "Personal", "General"]
    date_added = "2025-06-10"  # Tuesday

    result = await classify_task(text, categories, date_added)

    # Check that the text was cleaned (no "by wednesday" should remain)
    assert "wednesday" not in result["text"].lower()
    assert "by" not in result["text"].lower() or result["text"].lower() == "meeting"
    assert "meeting" in result["text"].lower()

    # Check that due date was parsed (should be 2025-06-11 since Wednesday is 1 day after Tuesday)
    assert result["dueDate"] == "2025-06-11"

    # Check that category is reasonable (likely Work)
    assert result["category"] in categories
    assert result["category"] == "Work"  # Meeting should be categorized as Work

    # Check priority is set
    assert result["priority"] in ["High", "Medium", "Low"]


@pytest.mark.asyncio
async def test_classify_grocery_shopping_tomorrow():
    """Test that 'grocery shopping tomorrow' parses correctly with real LLM."""
    text = "grocery shopping tomorrow"
    categories = ["Health", "Work", "Personal", "General", "Shopping"]
    date_added = "2025-06-10"  # Tuesday

    result = await classify_task(text, categories, date_added)

    # Check that the text was cleaned (no "tomorrow" should remain)
    assert "tomorrow" not in result["text"].lower()
    assert "grocery" in result["text"].lower()
    assert "shopping" in result["text"].lower()

    # Check that due date was parsed (should be 2025-06-11 since tomorrow is Wednesday)
    assert result["dueDate"] == "2025-06-11"

    # Check that category is reasonable (likely Personal or Shopping)
    assert result["category"] in categories
    assert result["category"] in ["Personal", "Shopping"]  # Grocery shopping should be Personal or Shopping

    # Check priority is set
    assert result["priority"] in ["High", "Medium", "Low"]


@pytest.mark.asyncio
async def test_classify_workout_today():
    """Test that 'workout today' parses correctly with real LLM."""
    text = "workout today"
    categories = ["Health", "Work", "Personal", "General"]
    date_added = "2025-06-10"  # Tuesday

    result = await classify_task(text, categories, date_added)

    # Check that the text was cleaned (no "today" should remain)
    assert "today" not in result["text"].lower()
    assert "workout" in result["text"].lower()

    # Check that due date was parsed (should be 2025-06-10 since today is the reference date)
    assert result["dueDate"] == "2025-06-10"

    # Check that category is reasonable (likely Health)
    assert result["category"] in categories
    assert result["category"] == "Health"  # Workout should be categorized as Health

    # Check priority is set
    assert result["priority"] in ["High", "Medium", "Low"]


@pytest.mark.asyncio
async def test_classify_no_date_task():
    """Test that tasks without dates are handled correctly."""
    text = "call mom"
    categories = ["Health", "Work", "Personal", "General"]
    date_added = "2025-06-10"

    result = await classify_task(text, categories, date_added)

    # Check that the text remains unchanged
    assert result["text"].lower() == "call mom"

    # Check that no due date was set
    assert result["dueDate"] is None

    # Check that category is reasonable (likely Personal)
    assert result["category"] in categories
    assert result["category"] == "Personal"  # Calling mom should be Personal

    # Check priority is set
    assert result["priority"] in ["High", "Medium", "Low"]


@pytest.mark.asyncio
async def test_classify_specific_date():
    """Test that specific dates like '2025-07-04' are parsed correctly."""
    text = "submit report by 2025-07-04"
    categories = ["Health", "Work", "Personal", "General"]
    date_added = "2025-06-10"

    result = await classify_task(text, categories, date_added)

    # Check that the text was cleaned (no date should remain)
    assert "2025-07-04" not in result["text"]
    assert "by" not in result["text"] or result["text"] == "submit report"
    assert "submit" in result["text"].lower()
    assert "report" in result["text"].lower()

    # Check that due date was parsed correctly
    assert result["dueDate"] == "2025-07-04"

    # Check that category is reasonable (likely Work)
    assert result["category"] in categories
    assert result["category"] == "Work"  # Submit report should be Work

    # Check priority is set
    assert result["priority"] in ["High", "Medium", "Low"]
