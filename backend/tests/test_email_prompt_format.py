import email_summary


def test_summary_prompt_contains_buddhist_instruction():
    instructions = email_summary.get_default_buddhist_instructions()
    prompt = email_summary.create_summary_prompt(
        "[]",
        user_name="Tester",
        custom_instructions=instructions,
        user_timezone="UTC",
        haiku="An old silent pond",
    )
    assert "Write like a Buddhist monk" in prompt
