from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest
from chatbot import answer_question


@pytest.mark.asyncio
async def test_answer_question_serializes_datetimes():
    spaces_data = [
        {
            "space": "Work",
            "journals": [
                {
                    "_id": "1",
                    "date": "2024-08-30",
                    "text": "Met with team",
                    "created_at": datetime(2024, 8, 30, 12, 0, 0),
                }
            ],
        }
    ]
    history = []

    fake_response = MagicMock()
    fake_response.choices = [MagicMock(message=MagicMock(content="ok"))]

    with patch("chatbot.client.chat.completions.create", return_value=fake_response):
        result = await answer_question("What's up?", spaces_data, history)

    assert result == "ok"
