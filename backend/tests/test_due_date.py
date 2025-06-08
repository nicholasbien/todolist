from datetime import datetime

import classify
import pytest


class FakeCompletion:
    def __init__(self, content):
        self.choices = [type("obj", (), {"message": type("obj", (), {"content": content})()})]


@pytest.mark.asyncio
async def test_prompt_contains_date_context(monkeypatch):
    captured = {}

    def fake_create(model, messages, temperature):
        captured["messages"] = messages
        return FakeCompletion('{"category": "General", "priority": "Low", "text": "task", "dueDate": null}')

    class FixedDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2025, 6, 10)

    monkeypatch.setattr(classify, "datetime", FixedDatetime)
    monkeypatch.setattr(classify.client.chat.completions, "create", fake_create)

    await classify.classify_task("do it tomorrow", [])

    system_msg = captured["messages"][0]["content"]
    assert "Dates should be interpreted relative to Tuesday, 2025-06-10" in system_msg


def test_manual_parse_due_date():
    ref = datetime(2025, 6, 10)  # Tuesday
    assert classify.manual_parse_due_date("finish tomorrow", ref) == "2025-06-11"
    assert classify.manual_parse_due_date("meet next Monday", ref) == "2025-06-16"
