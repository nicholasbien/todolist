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
    date_keywords = ["on", "due", "by", "before", "for"]
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
        try:
            cleaned_text = remove_phrase(cleaned_text, m)
        except Exception:
            pass
        return reference.date().isoformat(), cleaned_text
    m = re.search(rf"\b({keyword_re})?\s*(tomorrow)\b", lowered)
    if m:
        try:
            cleaned_text = remove_phrase(cleaned_text, m)
        except Exception:
            pass
        return (reference.date() + timedelta(days=1)).isoformat(), cleaned_text

    # Handle "in <number> days/weeks"
    m = re.search(
        r"\bin\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(day|days|week|weeks)\b",
        lowered,
    )
    if m:
        try:
            num_str, unit = m.group(1), m.group(2)
            word_to_num = {
                "one": 1,
                "two": 2,
                "three": 3,
                "four": 4,
                "five": 5,
                "six": 6,
                "seven": 7,
                "eight": 8,
                "nine": 9,
                "ten": 10,
            }
            if num_str.isdigit():
                num: Optional[int] = int(num_str)
            else:
                num = word_to_num.get(num_str)
            if num is not None:
                delta = timedelta(days=num) if "day" in unit else timedelta(weeks=num)
                cleaned_text = remove_phrase(cleaned_text, m)
                return (reference.date() + delta).isoformat(), cleaned_text
        except Exception:
            pass

    # Handle "next <weekday>"
    m = re.search(
        rf"\b({keyword_re})?\s*next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b",
        lowered,
    )
    if m:
        try:
            weekday = WEEKDAYS.index(m.group(2))
            days_ahead = (weekday - reference.weekday() + 7) % 7
            days_ahead = days_ahead or 7
            cleaned_text = remove_phrase(cleaned_text, m)
            return (
                reference.date() + timedelta(days=days_ahead)
            ).isoformat(), cleaned_text
        except Exception:
            pass

    # Handle "<keyword> <weekday>" (later this week or next week)
    m = re.search(
        rf"\b({keyword_re})\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b",
        lowered,
    )
    if m:
        try:
            weekday = WEEKDAYS.index(m.group(2))
            today_weekday = reference.weekday()
            days_ahead = (weekday - today_weekday + 7) % 7
            cleaned_text = remove_phrase(cleaned_text, m)
            return (
                reference.date() + timedelta(days=days_ahead)
            ).isoformat(), cleaned_text
        except Exception:
            pass

    # Handle just a weekday at the end (e.g., "Finish report Friday")
    m = re.search(
        r"(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*$",
        lowered,
    )
    if m:
        try:
            weekday = WEEKDAYS.index(m.group(1))
            today_weekday = reference.weekday()
            days_ahead = (weekday - today_weekday + 7) % 7
            cleaned_text = remove_phrase(cleaned_text, m)
            return (
                reference.date() + timedelta(days=days_ahead)
            ).isoformat(), cleaned_text
        except Exception:
            pass

    # Handle ISO format: YYYY-MM-DD
    m = re.search(rf"\b({keyword_re})?\s*(\d{{4}}-\d{{2}}-\d{{2}})\b", lowered)
    if m:
        try:
            cleaned_text = remove_phrase(cleaned_text, m)
            return m.group(2), cleaned_text
        except Exception:
            pass

    # Handle date formats: MM/DD/YYYY, DD/MM/YYYY or MM-DD-YYYY, DD-MM-YYYY
    m = re.search(
        rf"\b({keyword_re})?\s*(\d{{1,2}})[/-](\d{{1,2}})[/-](\d{{4}})\b", lowered
    )
    if m:
        try:
            first_str, second_str, year_str = m.group(2), m.group(3), m.group(4)
            if not (first_str and second_str and year_str):
                raise ValueError
            first = int(first_str) if first_str.isdigit() else None
            second = int(second_str) if second_str.isdigit() else None
            year = int(year_str) if year_str.isdigit() else None
        except Exception:
            first = second = year = None
        if first is not None and second is not None and year is not None:
            # If first > 12, must be DD/MM (EU)
            if first > 12:
                try:
                    dt = datetime(year, second, first)
                    cleaned_text = remove_phrase(cleaned_text, m)
                    return dt.date().isoformat(), cleaned_text
                except Exception:
                    pass
            # If second > 12, must be MM/DD (US)
            if second > 12:
                try:
                    dt = datetime(year, first, second)
                    cleaned_text = remove_phrase(cleaned_text, m)
                    return dt.date().isoformat(), cleaned_text
                except Exception:
                    pass
            # If both <= 12, always prefer US (MM/DD)
            try:
                dt = datetime(year, first, second)
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
            # Defensive: check number of groups and their content
            try:
                groups = m.groups()
                # ISO: (keyword, date)
                if len(groups) == 2 and groups[1]:
                    cleaned_text = remove_phrase(cleaned_text, m)
                    return str(groups[1]), cleaned_text
                # US/EU: (keyword, month, day, year)
                elif len(groups) == 4 and all(groups[1:]):
                    month_str, day_str, year_str = (
                        str(groups[1]),
                        str(groups[2]),
                        str(groups[3]),
                    )
                    try:
                        dt = datetime(int(year_str), int(month_str), int(day_str))
                        cleaned_text = remove_phrase(cleaned_text, m)
                        return dt.date().isoformat(), cleaned_text
                    except Exception:
                        try:
                            dt = datetime(int(year_str), int(day_str), int(month_str))
                            cleaned_text = remove_phrase(cleaned_text, m)
                            return dt.date().isoformat(), cleaned_text
                        except Exception:
                            pass
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
    # Patterns: (keyword)? Month Day (Year) and (keyword)? Day Month (Year)
    patterns = [
        # e.g. "due Aug 16", "on August 16", "Aug 16", "August 16 2025"
        rf"\b(?:{keyword_re})?\s*({'|'.join(month_names + month_abbr)})\.?\s+(\d{{1,2}})(?:[\s,]+(\d{{4}}))?\b",
        # e.g. "due 16 Aug", "by 16 August", "16 Aug", "16 August 2025"
        rf"\b(?:{keyword_re})?\s*(\d{{1,2}})\s+({'|'.join(month_names + month_abbr)})\.?(?:[\s,]+(\d{{4}}))?\b",
    ]
    for i, pat in enumerate(patterns):
        m = re.search(pat, lowered)
        if m:
            try:
                groups = m.groups()
                if i == 0 and len(groups) >= 2:
                    month_str = groups[0]
                    day_str = groups[1]
                    year_str = groups[2] if len(groups) > 2 else None
                elif i == 1 and len(groups) >= 2:
                    day_str = groups[0]
                    month_str = groups[1]
                    year_str = groups[2] if len(groups) > 2 else None
                else:
                    continue
                if not month_str or not day_str:
                    continue
                month_str = month_str.strip(".").lower()
                if month_str in month_names:
                    month_num = month_names.index(month_str) + 1
                elif month_str in month_abbr:
                    month_num = month_abbr.index(month_str) + 1
                else:
                    continue
                try:
                    day_num = (
                        int(day_str)
                        if isinstance(day_str, str) and day_str.isdigit()
                        else None
                    )
                    year_num = (
                        int(year_str)
                        if year_str and isinstance(year_str, str) and year_str.isdigit()
                        else reference.year
                    )
                except Exception:
                    continue
                if day_num is None or month_num is None or year_num is None:
                    continue
                dt = datetime(year_num, month_num, day_num)
                if (
                    not year_str or not year_str.strip()
                ) and dt.date() < reference.date():
                    dt = datetime(year_num + 1, month_num, day_num)
                cleaned_text = remove_phrase(cleaned_text, m)
                return dt.date().isoformat(), cleaned_text
            except Exception:
                continue
    return None, cleaned_text
