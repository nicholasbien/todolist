import classify
import pytest
from dateparse import manual_parse_due_date


class FakeCompletion:
    def __init__(self, content):
        self.choices = [type("obj", (), {"message": type("obj", (), {"content": content})()})]


@pytest.mark.asyncio
async def test_prompt_contains_date_context(monkeypatch):
    captured = {}

    def fake_create(model, messages, temperature):
        captured["messages"] = messages
        return FakeCompletion('{"category": "General", "priority": "Low", "text": "task", "dueDate": null}')

    monkeypatch.setattr(classify.client.chat.completions, "create", fake_create)

    await classify.classify_task("do it tomorrow", [], "2025-06-10")

    system_msg = captured["messages"][0]["content"]
    assert "Tuesday, 2025-06-10" in system_msg


def test_manual_parse_due_date():
    ref = "2025-06-10"  # Tuesday
    due_date, _ = manual_parse_due_date("finish tomorrow", ref)
    assert due_date == "2025-06-11"
    due_date, _ = manual_parse_due_date("meet next Monday", ref)
    assert due_date == "2025-06-16"


def test_manual_parse_due_date_various():
    ref = "2025-06-10"  # Tuesday

    # Helper for tuple unpacking
    def check(text, expected_date, expected_clean):
        date, cleaned = manual_parse_due_date(text, ref)
        assert date == expected_date, f"Failed for: {text} (date)"
        assert cleaned == expected_clean, f"Failed for: {text} (cleaned)"

    # Relative days
    check("finish today", "2025-06-10", "finish")
    check("finish tomorrow", "2025-06-11", "finish")
    check("do it by today", "2025-06-10", "do it")
    check("due tomorrow", "2025-06-11", "")
    # Next weekday
    check("meet next Monday", "2025-06-16", "meet")
    check("by next tuesday", "2025-06-17", "")
    # On/By/Before weekday
    check("on Thursday", "2025-06-12", "")
    check("by Monday", "2025-06-16", "")  # next Monday since this Monday has passed
    check("before Friday", "2025-06-13", "")
    # Weekday at end
    check("Finish report Friday", "2025-06-13", "Finish report")
    check("Finish report Monday", "2025-06-16", "Finish report")  # next Monday
    # ISO format
    check("due 2025-07-04", "2025-07-04", "")
    check("on 2025-07-04", "2025-07-04", "")
    # US format
    check("due 7/4/2025", "2025-07-04", "")
    check("by 07-04-2025", "2025-07-04", "")
    # EU format (ambiguous, now always US)
    # check("before 04/07/2025", "2025-07-04", "")  # This would now be April 7th, 2025 (US)
    # check("until 04-07-2025", "2025-07-04", "")   # This would now be April 7th, 2025 (US)
    # Date only
    check("2025-07-04", "2025-07-04", "")
    check("7/4/2025", "2025-07-04", "")
    # Month name patterns
    check("due Aug 16", "2025-08-16", "")
    check("on August 16", "2025-08-16", "")
    check("by 16 Aug", "2025-08-16", "")
    check("before 16 August", "2025-08-16", "")
    check("due Aug 16 2026", "2026-08-16", "")
    check("for 16 Aug 2026", "2026-08-16", "")
    # Month abbreviation
    check("due Jan 2", "2026-01-02", "")  # next year since Jan 2, 2025 has passed
    # Edge: invalid
    check("no date here", None, "no date here")
    check("", None, "")
