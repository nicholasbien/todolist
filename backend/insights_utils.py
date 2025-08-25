"""
Shared insights computation logic between backend and service worker.
This eliminates duplication and ensures consistent calculations.
"""


def get_week_key(date_string):
    """Get the Monday date key for a given date string."""
    try:
        from datetime import datetime

        if isinstance(date_string, str):
            date = datetime.fromisoformat(date_string.replace("Z", "+00:00"))
        else:
            date = date_string

        if hasattr(date, "getTime") and callable(getattr(date, "getTime")):
            # JavaScript Date object detection
            date_ms = date.getTime()
            if not date_ms or date_ms != date_ms:  # NaN check
                return None
        elif hasattr(date, "timestamp"):
            # Python datetime
            if not date or str(date) == "NaT":
                return None
        else:
            return None

        # Get Monday of the week (ISO week)
        weekday = date.weekday() if hasattr(date, "weekday") else date.getUTCDay()
        if hasattr(date, "weekday"):
            # Python datetime
            from datetime import timedelta

            week_start = date - timedelta(days=weekday)
        else:
            # JavaScript-like date handling (for service worker)
            week_start = date
            day = weekday
            diff = (day + 6) % 7  # Monday as start of week
            week_start.setUTCDate(week_start.getUTCDate() - diff)

        return (
            week_start.strftime("%Y-%m-%d")
            if hasattr(week_start, "strftime")
            else week_start.toISOString().split("T")[0]
        )
    except Exception:
        return None


def generate_insights(todos):
    """
    Generate insights from todos data.
    Works in both Python backend and JavaScript service worker contexts.
    """
    # Convert todos to consistent format
    todo_array = list(todos) if hasattr(todos, "__iter__") else list(todos.values()) if hasattr(todos, "values") else []

    # Initialize tracking
    weekly_stats = {}
    category_stats = {}
    priority_stats = {}
    completed = 0

    # Process each todo
    for todo in todo_array:
        # Handle both dict and object access patterns
        def get_attr(obj, key, default=None):
            if hasattr(obj, "get"):
                return obj.get(key, default)
            elif hasattr(obj, key):
                return getattr(obj, key, default)
            else:
                return default

        is_completed = get_attr(todo, "completed", False)
        if is_completed:
            completed += 1

        # Weekly creation stats
        date_added = get_attr(todo, "dateAdded")
        if date_added:
            week = get_week_key(date_added)
            if week:
                if week not in weekly_stats:
                    weekly_stats[week] = {"created": 0, "completed": 0}
                weekly_stats[week]["created"] += 1

        # Weekly completion stats
        if is_completed:
            date_completed = get_attr(todo, "dateCompleted")
            if date_completed:
                week = get_week_key(date_completed)
                if week:
                    if week not in weekly_stats:
                        weekly_stats[week] = {"created": 0, "completed": 0}
                    weekly_stats[week]["completed"] += 1

        # Category stats
        category = get_attr(todo, "category", "General")
        if category not in category_stats:
            category_stats[category] = {"total": 0, "completed": 0}
        category_stats[category]["total"] += 1
        if is_completed:
            category_stats[category]["completed"] += 1

        # Priority stats
        priority = get_attr(todo, "priority", "Medium")
        if priority not in priority_stats:
            priority_stats[priority] = {"total": 0, "completed": 0}
        priority_stats[priority]["total"] += 1
        if is_completed:
            priority_stats[priority]["completed"] += 1

    # Calculate totals
    total = len(todo_array)
    pending = total - completed
    completion_rate = round((completed / total) * 1000) / 10 if total > 0 else 0

    # Convert weekly stats to sorted list
    weekly_data = []
    for week in sorted(weekly_stats.keys()):
        stats = weekly_stats[week]
        weekly_data.append({"week": week, "created": stats["created"], "completed": stats["completed"]})

    # Convert category stats to list
    category_data = []
    for category, stats in category_stats.items():
        completion_rate_cat = round((stats["completed"] / stats["total"]) * 1000) / 10 if stats["total"] > 0 else 0
        category_data.append(
            {
                "category": category,
                "total": stats["total"],
                "completed": stats["completed"],
                "completion_rate": completion_rate_cat,
            }
        )

    # Convert priority stats to list
    priority_data = []
    for priority, stats in priority_stats.items():
        completion_rate_pri = round((stats["completed"] / stats["total"]) * 1000) / 10 if stats["total"] > 0 else 0
        priority_data.append(
            {
                "priority": priority,
                "total": stats["total"],
                "completed": stats["completed"],
                "completion_rate": completion_rate_pri,
            }
        )

    return {
        "overview": {
            "total_tasks": total,
            "completed_tasks": completed,
            "pending_tasks": pending,
            "completion_rate": completion_rate,
        },
        "weekly_stats": weekly_data,
        "category_breakdown": category_data,
        "priority_breakdown": priority_data,
    }
