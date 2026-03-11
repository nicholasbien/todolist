#!/usr/bin/env python3
"""
Test script to compare email summary quality between gpt-4.1 and gpt-5.2.

Run with: python test_email_model_comparison.py
"""

import asyncio
import json
from datetime import datetime, timedelta

from openai import OpenAI

from email_summary import create_summary_prompt

# Initialize OpenAI client
client = OpenAI()

# Sample todo data similar to user's actual data
SAMPLE_DATA = {
    "spaces": [
        {
            "name": "Personal",
            "todos": {
                "completed": [
                    {
                        "text": "Call dad",
                        "category": "Family",
                        "priority": "Medium",
                        "dateAdded": (datetime.now() - timedelta(days=2)).isoformat(),
                        "dateAddedRelative": "2 days ago",
                        "dateCompleted": (
                            datetime.now() - timedelta(hours=12)
                        ).isoformat(),
                        "dateCompletedRelative": "12 hours ago",
                        "completed": True,
                    },
                    {
                        "text": "Clean retainer",
                        "category": "Health",
                        "priority": "Low",
                        "dateAdded": (datetime.now() - timedelta(days=1)).isoformat(),
                        "dateAddedRelative": "1 day ago",
                        "dateCompleted": (
                            datetime.now() - timedelta(hours=6)
                        ).isoformat(),
                        "dateCompletedRelative": "6 hours ago",
                        "completed": True,
                    },
                ],
                "pending": [
                    {
                        "text": "Change dc train",
                        "category": "Travel",
                        "priority": "High",
                        "dateAdded": (datetime.now() - timedelta(days=1)).isoformat(),
                        "dateAddedRelative": "1 day ago",
                        "completed": False,
                    },
                    {
                        "text": "Book Tahoe Airbnb for 30th birthday",
                        "category": "Travel",
                        "priority": "High",
                        "dateAdded": (datetime.now() - timedelta(days=55)).isoformat(),
                        "dateAddedRelative": "1 month ago",
                        "completed": False,
                    },
                    {
                        "text": "Get a haircut",
                        "category": "Personal Care",
                        "priority": "Medium",
                        "dateAdded": (datetime.now() - timedelta(days=10)).isoformat(),
                        "dateAddedRelative": "1 week ago",
                        "dueDate": datetime.now().strftime("%Y-%m-%d"),
                        "dueDateRelative": "today",
                        "completed": False,
                    },
                    {
                        "text": "Take preamp to Guitar Center",
                        "category": "Errands",
                        "priority": "Medium",
                        "dateAdded": (datetime.now() - timedelta(days=5)).isoformat(),
                        "dateAddedRelative": "5 days ago",
                        "dueDate": (datetime.now() + timedelta(days=1)).strftime(
                            "%Y-%m-%d"
                        ),
                        "dueDateRelative": "in 1 day",
                        "completed": False,
                    },
                    {
                        "text": "Journal!",
                        "category": "Wellness",
                        "priority": "High",
                        "dateAdded": (datetime.now() - timedelta(days=45)).isoformat(),
                        "dateAddedRelative": "1 month ago",
                        "dueDate": (datetime.now() - timedelta(days=41)).strftime(
                            "%Y-%m-%d"
                        ),
                        "dueDateRelative": "1 month ago",
                        "completed": False,
                    },
                    {
                        "text": "Book DC restaurant",
                        "category": "Travel",
                        "priority": "Medium",
                        "dateAdded": (datetime.now() - timedelta(days=10)).isoformat(),
                        "dateAddedRelative": "1 week ago",
                        "completed": False,
                    },
                    {
                        "text": "Donate hair",
                        "category": "Personal",
                        "priority": "High",
                        "dateAdded": (datetime.now() - timedelta(days=55)).isoformat(),
                        "dateAddedRelative": "1 month ago",
                        "completed": False,
                    },
                    {
                        "text": "Flu shot",
                        "category": "Health",
                        "priority": "High",
                        "dateAdded": (datetime.now() - timedelta(days=62)).isoformat(),
                        "dateAddedRelative": "2 months ago",
                        "completed": False,
                    },
                    {
                        "text": "Trim beard",
                        "category": "Personal Care",
                        "priority": "Low",
                        "dateAdded": (datetime.now() - timedelta(days=3)).isoformat(),
                        "dateAddedRelative": "3 days ago",
                        "completed": False,
                    },
                    {
                        "text": "Trim fingernails",
                        "category": "Personal Care",
                        "priority": "Low",
                        "dateAdded": (datetime.now() - timedelta(days=2)).isoformat(),
                        "dateAddedRelative": "2 days ago",
                        "completed": False,
                    },
                    {
                        "text": "Text Jon Kamalu",
                        "category": "Social",
                        "priority": "Medium",
                        "dateAdded": (datetime.now() - timedelta(days=8)).isoformat(),
                        "dateAddedRelative": "1 week ago",
                        "completed": False,
                    },
                    {
                        "text": "Schedule doctor appointment",
                        "category": "Health",
                        "priority": "High",
                        "dateAdded": (datetime.now() - timedelta(days=70)).isoformat(),
                        "dateAddedRelative": "2 months ago",
                        "completed": False,
                    },
                ],
            },
        }
    ],
    "journal_entries": [
        {
            "date": (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%d"),
            "text": "Feeling good about progress on work projects. Need to focus more on personal health.",
        }
    ],
}

# Sample haiku
SAMPLE_HAIKU = """The summer grasses
All that remains
Of brave soldiers dreams"""


async def test_model(model_name: str, model_version: str) -> str:
    """Generate email summary with specified model."""
    print(f"\n{'='*80}")
    print(f"Testing model: {model_version}")
    print(f"{'='*80}\n")

    # Create prompt
    spaces_json = json.dumps(SAMPLE_DATA["spaces"], indent=2, default=str)
    journal_entries_json = json.dumps(
        SAMPLE_DATA["journal_entries"], indent=2, default=str
    )

    prompt = create_summary_prompt(
        spaces_json=spaces_json,
        user_name="Nicholas",
        custom_instructions="",
        user_timezone="America/New_York",
        haiku=SAMPLE_HAIKU,
        journal_entries_json=journal_entries_json,
    )

    print("Calling OpenAI API...")
    start_time = datetime.now()

    try:
        response = client.responses.create(
            model=model_name,
            instructions=(
                "You are a helpful personal assistant creating daily todo summaries. "
                "Use ONLY the exact haiku provided in the prompt - never create additional poetry or haiku."
            ),
            input=prompt,
        )

        duration = (datetime.now() - start_time).total_seconds()
        print(f"✅ API call completed in {duration:.2f}s\n")

        summary = response.output_text
        return summary

    except Exception as e:
        print(f"❌ Error: {e}")
        return f"ERROR: {str(e)}"


async def main():
    """Run comparison test between models."""
    print("\n" + "=" * 80)
    print("EMAIL MODEL COMPARISON TEST")
    print("=" * 80)
    print("\nSample data:")
    print(
        f"- Completed tasks (last 48h): {len(SAMPLE_DATA['spaces'][0]['todos']['completed'])}"
    )
    print(f"- Pending tasks: {len(SAMPLE_DATA['spaces'][0]['todos']['pending'])}")
    print(
        f"- High priority: {sum(1 for t in SAMPLE_DATA['spaces'][0]['todos']['pending'] if t['priority'] == 'High')}"
    )
    print(f"- Journal entries: {len(SAMPLE_DATA['journal_entries'])}")

    # Test both models
    result_41 = await test_model("gpt-4.1", "gpt-4.1")
    result_52 = await test_model("gpt-5.2", "gpt-5.2")

    # Print results
    print("\n" + "=" * 80)
    print("RESULTS")
    print("=" * 80)

    print("\n" + "─" * 80)
    print("GPT-4.1 OUTPUT:")
    print("─" * 80)
    print(result_41)

    print("\n" + "─" * 80)
    print("GPT-5.2 OUTPUT:")
    print("─" * 80)
    print(result_52)

    # Analysis
    print("\n" + "=" * 80)
    print("ANALYSIS")
    print("=" * 80)

    def analyze_output(text: str) -> dict:
        """Analyze email output for quality metrics."""
        lines = text.split("\n")
        return {
            "length": len(text),
            "lines": len(lines),
            "has_overview": "Overview" in text or "✅" in text,
            "has_reflection": "Insights" in text or "Reflection" in text,
            "has_recent_wins": "Recent Wins" in text or "Wins" in text,
            "has_priority_focus": "Priority" in text or "🔥" in text,
            "has_haiku": SAMPLE_HAIKU.split("\n")[0] in text,
            "section_count": sum(
                1
                for line in lines
                if line.strip().startswith(("**", "🎯", "✨", "🔥", "⚡", "📊"))
            ),
        }

    analysis_41 = analyze_output(result_41)
    analysis_52 = analyze_output(result_52)

    print("\nGPT-4.1:")
    print(f"  Length: {analysis_41['length']} chars, {analysis_41['lines']} lines")
    print(f"  Sections: {analysis_41['section_count']}")
    print(f"  Has Overview: {analysis_41['has_overview']}")
    print(f"  Has Reflection: {analysis_41['has_reflection']}")
    print(f"  Has Recent Wins: {analysis_41['has_recent_wins']}")
    print(f"  Has Priority Focus: {analysis_41['has_priority_focus']}")
    print(f"  Has Haiku: {analysis_41['has_haiku']}")

    print("\nGPT-5.2:")
    print(f"  Length: {analysis_52['length']} chars, {analysis_52['lines']} lines")
    print(f"  Sections: {analysis_52['section_count']}")
    print(f"  Has Overview: {analysis_52['has_overview']}")
    print(f"  Has Reflection: {analysis_52['has_reflection']}")
    print(f"  Has Recent Wins: {analysis_52['has_recent_wins']}")
    print(f"  Has Priority Focus: {analysis_52['has_priority_focus']}")
    print(f"  Has Haiku: {analysis_52['has_haiku']}")

    print("\n" + "=" * 80)
    print("Test complete! Review the outputs above to compare quality.")
    print("=" * 80 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
