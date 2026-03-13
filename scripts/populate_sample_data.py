#!/usr/bin/env python3
"""
Populate sample todos and journal entries for a user.

Usage:
    python scripts/populate_sample_data.py <email> <verification_code>
"""

import sys
import json
import requests
from datetime import datetime, timedelta
import random

# Configuration
BASE_URL = "http://localhost:8141"

# Sample todos organized by category
SAMPLE_TODOS = {
    "Work": [
        "Review Q4 project proposals",
        "Prepare slides for Monday's team meeting",
        "Update project documentation",
        "Schedule 1:1 with team members",
        "Complete performance reviews",
        "Research new automation tools",
        "Fix bug in authentication system",
        "Optimize database queries",
    ],
    "Personal": [
        "Book dentist appointment",
        "Plan weekend hiking trip",
        "Call mom for her birthday",
        "Organize garage storage",
        "Research vacation destinations",
        "Update emergency contacts",
        "Review monthly budget",
        "Schedule car maintenance",
    ],
    "Health": [
        "Morning yoga session",
        "Meal prep for the week",
        "Schedule annual checkup",
        "Track water intake",
        "Go for evening run",
        "Research healthy recipes",
        "Update fitness goals",
        "Buy vitamins",
    ],
    "Learning": [
        "Complete Python course module",
        "Read 'Atomic Habits' chapter 3",
        "Practice Spanish on Duolingo",
        "Watch machine learning tutorial",
        "Write blog post about productivity",
        "Attend online workshop",
        "Review coding interview questions",
        "Learn new keyboard shortcuts",
    ],
    "Shopping": [
        "Buy groceries for dinner party",
        "Order new running shoes",
        "Get birthday gift for Sarah",
        "Replace kitchen sponges",
        "Buy printer paper",
        "Stock up on coffee beans",
        "Get new phone case",
        "Order book recommendations",
    ],
}

def generate_journal_entries():
    """Generate journal entries for the past week with dynamic dates."""
    journals = []
    today = datetime.now()

    # Generate entries for past 7 days
    entries = [
        {
            "days_ago": 0,
            "entry": f"""Great day today! Completed several important tasks and feeling productive.

Made progress on the project and had good meetings with the team. Everyone is aligned and motivated.

Took time for a walk this afternoon which helped clear my mind. Sometimes stepping away brings the best solutions.

Looking forward to tomorrow's challenges and opportunities.

Grateful for: Productive work sessions, supportive colleagues, and {['sunny weather', 'perfect weather', 'nice breeze', 'beautiful day'][random.randint(0, 3)]}."""
        },
        {
            "days_ago": 1,
            "entry": """Solid progress today despite some unexpected challenges.

Debugged a tricky issue that took longer than expected, but learned a lot in the process. Sometimes the difficult problems teach us the most.

Had an excellent brainstorming session with the team. New ideas are flowing and everyone's contributing great suggestions.

Evening was relaxing - caught up on some reading and planned tomorrow's priorities.

Key learning: Taking breaks during complex problem-solving really helps with perspective."""
        },
        {
            "days_ago": 2,
            "entry": """Friday vibes! Wrapped up the week strong and feeling accomplished.

Completed all planned tasks and even tackled a few items from the backlog. The momentum this week has been excellent.

Team sync was productive - everyone's excited about what we're building. The collaborative energy is infectious.

Looking forward to the weekend to recharge and come back fresh on Monday.

Weekend plans: Some coding projects, outdoor activities, and quality time with friends and family."""
        },
        {
            "days_ago": 3,
        "entry": """Thursday thoughts - the week is flying by! Deep focus day with minimal meetings = maximum productivity.

Finally cracked the service worker routing issue that's been bugging me. The solution was in the cache versioning all along.

Interesting discussion about AI agents and their potential applications. The future of development is changing rapidly.

Evening yoga class helped release the tension from hunching over the keyboard all day.

Reminder: Stay hydrated and take regular breaks, even during flow states."""
    },
        {
            "days_ago": 4,
        "entry": """Midweek momentum! The new environment setup documentation is complete and already helping new team members.

Pair programming session was incredibly productive. Two minds really are better than one sometimes.

Lunch and learn about PWA best practices gave me some ideas for improving our offline functionality.

Started reading 'The Pragmatic Programmer' - already picking up useful tips.

Small win: Fixed the markdown rendering bug that was causing formatting issues."""
    },
        {
            "days_ago": 5,
        "entry": """Tuesday triumphs! Woke up early and had a peaceful morning routine before the day got busy.

Successfully deployed the new journal feature to production. Users are already loving the ability to track their daily thoughts.

Great mentoring session with a junior developer. Teaching others really reinforces your own understanding.

Evening run felt amazing - endorphins are real! Mental clarity bonus: solved a design problem while running.

Goal check: On track for all weekly objectives so far."""
    },
        {
            "days_ago": 6,
            "entry": """Monday momentum! Started the week with clear goals and high energy.

Morning planning session set the tone for a productive week. Priorities are clear and the path forward is well-defined.

Made significant progress on the main project. It's satisfying to see ideas turn into working features.

Had a great knowledge-sharing session with the team. Everyone's learning and growing together.

This week's focus: Deliver quality work while maintaining work-life balance."""
        }
    ]

    return entries


def login_user(email, code):
    """Login and get authentication token."""
    response = requests.post(
        f"{BASE_URL}/auth/login",
        json={"email": email, "code": code}
    )
    if response.status_code != 200:
        print(f"Login failed: {response.json()}")
        sys.exit(1)

    data = response.json()
    # Backend returns "id" not "_id" in the user object
    return data["token"], data["user"]["id"]


def get_user_spaces(token):
    """Get user's spaces."""
    response = requests.get(
        f"{BASE_URL}/spaces",
        headers={"Authorization": f"Bearer {token}"}
    )
    if response.status_code != 200:
        print(f"Failed to get spaces: {response.json()}")
        return None

    spaces = response.json()
    # Find the Personal space (or default)
    for space in spaces:
        if space["name"] in ["Personal", "Default"]:
            return space["_id"]

    # Return first space if no Personal/Default found
    return spaces[0]["_id"] if spaces else None


def add_todos(token, space_id):
    """Add sample todos with mix of completed/pending and some with due dates."""
    print("\n📝 Adding sample todos...")

    todos_added = 0
    today = datetime.now()

    for category, todos in SAMPLE_TODOS.items():
        # Randomly select 3-5 todos from each category
        selected_todos = random.sample(todos, min(random.randint(3, 5), len(todos)))

        for todo_text in selected_todos:
            # Mix of completed (25%) and pending (75%)
            completed = random.random() < 0.25

            # Add due dates to 40% of pending todos
            todo_data = {
                "text": todo_text,
                "space_id": space_id,
                "completed": completed
            }

            if not completed and random.random() < 0.4:
                # Add due date between today and 2 weeks from now
                days_ahead = random.randint(0, 14)
                due_date = (today + timedelta(days=days_ahead)).isoformat()
                todo_data["due_date"] = due_date
                todo_text += f" (Due: {(today + timedelta(days=days_ahead)).strftime('%b %d')})"

            response = requests.post(
                f"{BASE_URL}/todos",
                json=todo_data,
                headers={"Authorization": f"Bearer {token}"}
            )

            if response.status_code == 200:
                status = "✅" if completed else "⏳"
                print(f"  {status} Added: {todo_text} [{category}]")
                todos_added += 1
            else:
                print(f"  ❌ Failed to add: {todo_text}")

    print(f"\n✨ Added {todos_added} todos successfully!")
    return todos_added


def add_journal_entries(token, space_id):
    """Add sample journal entries for the past week."""
    print("\n📔 Adding journal entries...")

    entries_added = 0
    journals = generate_journal_entries()

    for journal in journals:
        # Calculate the date for this entry
        entry_date = datetime.now() - timedelta(days=journal["days_ago"])
        date_str = entry_date.strftime("%Y-%m-%d")

        response = requests.post(
            f"{BASE_URL}/api/journals",
            json={
                "date": date_str,
                "entry": journal["entry"],
                "space_id": space_id
            },
            headers={"Authorization": f"Bearer {token}"}
        )

        if response.status_code in [200, 201]:
            print(f"  ✅ Added entry for {date_str}")
            entries_added += 1
        else:
            print(f"  ❌ Failed to add entry for {date_str}: {response.json()}")

    print(f"\n✨ Added {entries_added} journal entries successfully!")
    return entries_added


def main():
    if len(sys.argv) != 3:
        print("Usage: python scripts/populate_sample_data.py <email> <verification_code>")
        print("\nExample:")
        print("  python scripts/populate_sample_data.py user@example.com 123456")
        sys.exit(1)

    email = sys.argv[1]
    code = sys.argv[2]

    print(f"🚀 Populating sample data for {email}...")

    # Login
    print(f"\n🔐 Logging in...")
    token, user_id = login_user(email, code)
    print(f"  ✅ Logged in successfully! User ID: {user_id}")

    # Get user's space
    print(f"\n🏠 Getting user spaces...")
    space_id = get_user_spaces(token)
    if not space_id:
        print("  ❌ No spaces found for user")
        sys.exit(1)
    print(f"  ✅ Using space: {space_id}")

    # Add todos
    todos_count = add_todos(token, space_id)

    # Add journal entries
    journals_count = add_journal_entries(token, space_id)

    # Summary
    print("\n" + "="*50)
    print("🎉 Sample data population complete!")
    print(f"  • Todos added: {todos_count}")
    print(f"  • Journal entries added: {journals_count}")
    print("\n💡 You can now log in to the app and see your sample data!")
    print("="*50)


if __name__ == "__main__":
    main()
