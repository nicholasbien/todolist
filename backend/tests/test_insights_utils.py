"""Tests for insights_utils module — get_week_key and generate_insights."""

import pytest

from insights_utils import generate_insights, get_week_key


class TestGetWeekKey:
    """Tests for the get_week_key function."""

    def test_monday_returns_same_date(self):
        # 2026-03-09 is a Monday
        assert get_week_key("2026-03-09T10:00:00") == "2026-03-09"

    def test_wednesday_returns_monday(self):
        # 2026-03-11 is Wednesday, Monday is 2026-03-09
        assert get_week_key("2026-03-11T10:00:00") == "2026-03-09"

    def test_sunday_returns_monday(self):
        # 2026-03-15 is Sunday, Monday is 2026-03-09
        assert get_week_key("2026-03-15T10:00:00") == "2026-03-09"

    def test_iso_with_z_suffix(self):
        result = get_week_key("2026-03-11T10:00:00Z")
        assert result == "2026-03-09"

    def test_invalid_input_returns_none(self):
        assert get_week_key("not-a-date") is None

    def test_none_input_returns_none(self):
        assert get_week_key(None) is None


class TestGenerateInsights:
    """Tests for the generate_insights function."""

    def test_empty_todos(self):
        result = generate_insights([])
        assert result["overview"]["total_tasks"] == 0
        assert result["overview"]["completed_tasks"] == 0
        assert result["overview"]["pending_tasks"] == 0
        assert result["overview"]["completion_rate"] == 0
        assert result["weekly_stats"] == []
        assert result["category_breakdown"] == []
        assert result["priority_breakdown"] == []

    def test_single_pending_todo(self):
        todos = [
            {
                "text": "Buy milk",
                "completed": False,
                "category": "Shopping",
                "priority": "Low",
                "dateAdded": "2026-03-10T10:00:00",
            }
        ]
        result = generate_insights(todos)
        assert result["overview"]["total_tasks"] == 1
        assert result["overview"]["completed_tasks"] == 0
        assert result["overview"]["pending_tasks"] == 1
        assert result["overview"]["completion_rate"] == 0

    def test_completed_todo(self):
        todos = [
            {
                "text": "Buy milk",
                "completed": True,
                "category": "Shopping",
                "priority": "Low",
                "dateAdded": "2026-03-10T10:00:00",
                "dateCompleted": "2026-03-11T10:00:00",
            }
        ]
        result = generate_insights(todos)
        assert result["overview"]["total_tasks"] == 1
        assert result["overview"]["completed_tasks"] == 1
        assert result["overview"]["completion_rate"] == 100.0

    def test_completion_rate_rounding(self):
        todos = [
            {"text": "A", "completed": True, "category": "General", "priority": "Medium", "dateAdded": "2026-03-10T10:00:00", "dateCompleted": "2026-03-10T10:00:00"},
            {"text": "B", "completed": True, "category": "General", "priority": "Medium", "dateAdded": "2026-03-10T10:00:00", "dateCompleted": "2026-03-10T10:00:00"},
            {"text": "C", "completed": False, "category": "General", "priority": "Medium", "dateAdded": "2026-03-10T10:00:00"},
        ]
        result = generate_insights(todos)
        assert result["overview"]["completion_rate"] == 66.7

    def test_category_breakdown(self):
        todos = [
            {"text": "A", "completed": True, "category": "Work", "priority": "High", "dateAdded": "2026-03-10T10:00:00", "dateCompleted": "2026-03-10T10:00:00"},
            {"text": "B", "completed": False, "category": "Work", "priority": "High", "dateAdded": "2026-03-10T10:00:00"},
            {"text": "C", "completed": False, "category": "Personal", "priority": "Low", "dateAdded": "2026-03-10T10:00:00"},
        ]
        result = generate_insights(todos)
        cats = {c["category"]: c for c in result["category_breakdown"]}
        assert "Work" in cats
        assert cats["Work"]["total"] == 2
        assert cats["Work"]["completed"] == 1
        assert "Personal" in cats
        assert cats["Personal"]["total"] == 1
        assert cats["Personal"]["completed"] == 0

    def test_priority_breakdown(self):
        todos = [
            {"text": "A", "completed": True, "category": "General", "priority": "High", "dateAdded": "2026-03-10T10:00:00", "dateCompleted": "2026-03-10T10:00:00"},
            {"text": "B", "completed": False, "category": "General", "priority": "Low", "dateAdded": "2026-03-10T10:00:00"},
        ]
        result = generate_insights(todos)
        pris = {p["priority"]: p for p in result["priority_breakdown"]}
        assert pris["High"]["total"] == 1
        assert pris["High"]["completed"] == 1
        assert pris["Low"]["total"] == 1
        assert pris["Low"]["completed"] == 0

    def test_weekly_stats(self):
        todos = [
            {"text": "A", "completed": True, "category": "General", "priority": "Medium", "dateAdded": "2026-03-10T10:00:00", "dateCompleted": "2026-03-11T10:00:00"},
            {"text": "B", "completed": False, "category": "General", "priority": "Medium", "dateAdded": "2026-03-10T10:00:00"},
        ]
        result = generate_insights(todos)
        assert len(result["weekly_stats"]) >= 1
        week = result["weekly_stats"][0]
        assert week["created"] == 2
        assert week["completed"] == 1

    def test_default_category_and_priority(self):
        """When category/priority missing, defaults to General/Medium."""
        todos = [{"text": "A", "completed": False, "dateAdded": "2026-03-10T10:00:00"}]
        result = generate_insights(todos)
        cats = {c["category"]: c for c in result["category_breakdown"]}
        pris = {p["priority"]: p for p in result["priority_breakdown"]}
        assert "General" in cats
        assert "Medium" in pris

    def test_dict_access_pattern(self):
        """generate_insights should work with dict-like todos."""
        todos = {"1": {"text": "A", "completed": False, "category": "X", "priority": "High", "dateAdded": "2026-03-10T10:00:00"}}
        result = generate_insights(todos)
        assert result["overview"]["total_tasks"] == 1
