import re
from datetime import datetime

from classify import extract_due_date


def test_extract_due_date_today():
    today = datetime.now().date().isoformat()
    due, text = extract_due_date("go to gym today")
    assert due == today
    assert re.sub(r"\s+", " ", text.lower()) == "go to gym"
