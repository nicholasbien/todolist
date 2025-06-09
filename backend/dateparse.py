import re
from datetime import datetime, timedelta
from typing import Optional

WEEKDAYS = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]


def manual_parse_due_date(text: str, date_added: str) -> tuple[Optional[str], str]:
    """
    Parse simple relative dates and explicit date formats from text. Returns (due_date, cleaned_text).
    """
    reference = datetime.fromisoformat(date_added)
    lowered = text.lower().strip()
    cleaned_text = text

    # Common date keywords
    date_keywords = ["on", "due", "by", "before"]
    # Regex to match a keyword followed by a date/weekday
    keyword_re = r"(?:" + "|".join(date_keywords) + r")"

    # Helper to remove the matched date phrase from the text
    def remove_phrase(original, match):
        start, end = match.span()
        # Remove and clean up whitespace
        return (original[:start] + original[end:]).strip().replace("  ", " ")

    # Handle "today" and "tomorrow"
    m = re.search(rf"\b({keyword_re})?\s*(today)\b", lowered)
    if m:
        cleaned_text = remove_phrase(cleaned_text, m)
        return reference.date().isoformat(), cleaned_text
    m = re.search(rf"\b({keyword_re})?\s*(tomorrow)\b", lowered)
    if m:
        cleaned_text = remove_phrase(cleaned_text, m)
        return (reference.date() + timedelta(days=1)).isoformat(), cleaned_text

    # Handle "next <weekday>"
    m = re.search(
        rf"\b({keyword_re})?\s*next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b",
        lowered,
    )
    if m:
        weekday = WEEKDAYS.index(m.group(2))
        days_ahead = (weekday - reference.weekday() + 7) % 7
        days_ahead = days_ahead or 7
        cleaned_text = remove_phrase(cleaned_text, m)
        return (reference.date() + timedelta(days=days_ahead)).isoformat(), cleaned_text

    # Handle "<keyword> <weekday>" (later this week)
    m = re.search(
        rf"\b({keyword_re})\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b",
        lowered,
    )
    if m:
        weekday = WEEKDAYS.index(m.group(2))
        today_weekday = reference.weekday()
        days_ahead = weekday - today_weekday
        cleaned_text = remove_phrase(cleaned_text, m)
        if days_ahead < 0:
            return None, cleaned_text
        elif days_ahead == 0:
            return reference.date().isoformat(), cleaned_text
        else:
            return (reference.date() + timedelta(days=days_ahead)).isoformat(), cleaned_text

    # Handle just a weekday at the end (e.g., "Finish report Friday")
    m = re.search(
        r"(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*$",
        lowered,
    )
    if m:
        weekday = WEEKDAYS.index(m.group(1))
        today_weekday = reference.weekday()
        days_ahead = weekday - today_weekday
        cleaned_text = remove_phrase(cleaned_text, m)
        if days_ahead < 0:
            return None, cleaned_text
        elif days_ahead == 0:
            return reference.date().isoformat(), cleaned_text
        else:
            return (reference.date() + timedelta(days=days_ahead)).isoformat(), cleaned_text

    # Handle ISO format: YYYY-MM-DD
    m = re.search(rf"\b({keyword_re})?\s*(\d{{4}}-\d{{2}}-\d{{2}})\b", lowered)
    if m:
        cleaned_text = remove_phrase(cleaned_text, m)
        return m.group(2), cleaned_text

    # Handle US format: MM/DD/YYYY or MM-DD-YYYY
    m = re.search(rf"\b({keyword_re})?\s*(\d{{1,2}})[/-](\d{{1,2}})[/-](\d{{4}})\b", lowered)
    if m:
        month, day, year = m.group(2), m.group(3), m.group(4)
        try:
            dt = datetime(int(year), int(month), int(day))
            cleaned_text = remove_phrase(cleaned_text, m)
            return dt.date().isoformat(), cleaned_text
        except Exception:
            pass

    # Handle European format: DD/MM/YYYY or DD-MM-YYYY
    m = re.search(rf"\b({keyword_re})?\s*(\d{{1,2}})[/-](\d{{1,2}})[/-](\d{{4}})\b", lowered)
    if m:
        day, month, year = m.group(2), m.group(3), m.group(4)
        try:
            dt = datetime(int(year), int(month), int(day))
            cleaned_text = remove_phrase(cleaned_text, m)
            return dt.date().isoformat(), cleaned_text
        except Exception:
            pass

    # Handle just a date at the end (e.g., "2024-06-10", "6/10/2024", "10-06-2024")
    date_only_patterns = [
        rf"^\s*({keyword_re})?\s*(\d{{4}}-\d{{2}}-\d{{2}})\s*$",  # ISO
        rf"^\s*({keyword_re})?\s*(\d{{1,2}})[/-](\d{{1,2}})[/-](\d{{4}})\s*$",  # US/EU
    ]
    for pat in date_only_patterns:
        m = re.match(pat, lowered)
        if m:
            if len(m.groups()) == 2:
                cleaned_text = remove_phrase(cleaned_text, m)
                return m.group(2), cleaned_text
            elif len(m.groups()) == 4:
                month, day, year = m.group(2), m.group(3), m.group(4)
                try:
                    dt = datetime(int(year), int(month), int(day))
                    cleaned_text = remove_phrase(cleaned_text, m)
                    return dt.date().isoformat(), cleaned_text
                except Exception:
                    try:
                        dt = datetime(int(year), int(day), int(month))
                        cleaned_text = remove_phrase(cleaned_text, m)
                        return dt.date().isoformat(), cleaned_text
                    except Exception:
                        pass

    # Handle "Aug 16", "August 16", "16 Aug", "16 August", with or without year
    # Assume current year if year is missing, and if date has already passed, use next year
    month_names = [
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
    ]
    month_abbr = [m[:3] for m in month_names]
    patterns = [
        rf"\b({keyword_re})?\s*({'|'.join(month_names + month_abbr)})\.?\s+(\d{{1,2}})(?:[\s,]+(\d{{4}}))?\b",
        rf"\b({keyword_re})?\s*(\d{{1,2}})\s+({'|'.join(month_names + month_abbr)})\.?((?:[\s,]+\d{{4}})?)\b",
    ]
    for pat in patterns:
        m = re.search(pat, lowered)
        if m:
            if pat.startswith(r"\b({keyword_re})?\s*({'"):
                month_str, day_str, year_str = m.group(2), m.group(3), m.group(4)
            else:
                day_str, month_str, year_str = m.group(2), m.group(3), m.group(4)
            month_str = month_str.strip(".").lower()
            if month_str in month_names:
                month_num = month_names.index(month_str) + 1
            elif month_str in month_abbr:
                month_num = month_abbr.index(month_str) + 1
            else:
                continue
            day_num = int(day_str)
            year_num = int(year_str) if year_str and year_str.strip() else reference.year
            try:
                dt = datetime(year_num, month_num, day_num)
                if (not year_str or not year_str.strip()) and dt.date() < reference.date():
                    dt = datetime(year_num + 1, month_num, day_num)
                cleaned_text = remove_phrase(cleaned_text, m)
                return dt.date().isoformat(), cleaned_text
            except Exception:
                continue
    return None, cleaned_text
