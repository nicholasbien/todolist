import email_summary


def test_generate_top_items_section_formats_html_and_text():
    todos = [
        {
            "text": "Task A",
            "priority": "High",
            "dueDateRelative": "today",
        },
        {
            "text": "Task B",
            "priority": "Medium",
            "dateAddedRelative": "1 day ago",
        },
    ]
    text, html = email_summary.generate_top_items_section(todos)
    assert "1. Task A" in text
    assert "Priority: High" in text
    assert "<ol>" in html and "</ol>" in html
    assert "Task B" in html
