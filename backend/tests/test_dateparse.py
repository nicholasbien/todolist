"""Tests for dateparse module — manual_parse_due_date."""

import pytest

from dateparse import manual_parse_due_date


class TestRelativeDates:
    """Tests for 'today', 'tomorrow', and relative day/week offsets."""

    def test_today(self):
        due, cleaned = manual_parse_due_date("Buy milk today", "2026-03-12T10:00:00")
        assert due == "2026-03-12"
        assert "today" not in cleaned.lower()
        assert "milk" in cleaned.lower()

    def test_tomorrow(self):
        due, cleaned = manual_parse_due_date("Call dentist tomorrow", "2026-03-12T10:00:00")
        assert due == "2026-03-13"
        assert "tomorrow" not in cleaned.lower()

    def test_in_3_days(self):
        due, cleaned = manual_parse_due_date("Submit report in 3 days", "2026-03-12T10:00:00")
        assert due == "2026-03-15"

    def test_in_two_weeks(self):
        due, cleaned = manual_parse_due_date("Plan trip in two weeks", "2026-03-12T10:00:00")
        assert due == "2026-03-26"

    def test_in_1_week(self):
        due, cleaned = manual_parse_due_date("Review PR in 1 week", "2026-03-12T10:00:00")
        assert due == "2026-03-19"


class TestWeekdayParsing:
    """Tests for weekday references like 'next Monday' or 'on Friday'."""

    def test_next_monday_from_thursday(self):
        # 2026-03-12 is Thursday
        due, cleaned = manual_parse_due_date("Meeting next monday", "2026-03-12T10:00:00")
        assert due == "2026-03-16"  # Monday after Thursday

    def test_on_friday(self):
        due, cleaned = manual_parse_due_date("Finish report on friday", "2026-03-12T10:00:00")
        assert due == "2026-03-13"  # Friday is tomorrow from Thursday

    def test_trailing_weekday(self):
        due, cleaned = manual_parse_due_date("Finish report Friday", "2026-03-12T10:00:00")
        assert due == "2026-03-13"


class TestExplicitDates:
    """Tests for explicit date formats."""

    def test_iso_format(self):
        due, cleaned = manual_parse_due_date("Submit by 2026-04-15", "2026-03-12T10:00:00")
        assert due == "2026-04-15"

    def test_us_date_format(self):
        due, cleaned = manual_parse_due_date("Due 6/15/2026", "2026-03-12T10:00:00")
        assert due == "2026-06-15"

    def test_eu_date_format(self):
        # 25/06/2026 — day > 12 means DD/MM/YYYY
        due, cleaned = manual_parse_due_date("Due 25/06/2026", "2026-03-12T10:00:00")
        assert due == "2026-06-25"

    def test_month_name_short(self):
        due, cleaned = manual_parse_due_date("Submit Aug 16", "2026-03-12T10:00:00")
        assert due == "2026-08-16"

    def test_month_name_long(self):
        due, cleaned = manual_parse_due_date("Due January 5", "2026-03-12T10:00:00")
        # January 5 already passed (reference March), should go to next year
        assert due == "2027-01-05"

    def test_month_name_with_year(self):
        due, cleaned = manual_parse_due_date("Due August 16 2026", "2026-03-12T10:00:00")
        assert due == "2026-08-16"


class TestNoDate:
    """Tests where no date is found."""

    def test_no_date_in_text(self):
        due, cleaned = manual_parse_due_date("Buy groceries", "2026-03-12T10:00:00")
        assert due is None
        assert cleaned == "Buy groceries"

    def test_empty_text(self):
        due, cleaned = manual_parse_due_date("", "2026-03-12T10:00:00")
        assert due is None


class TestTextCleaning:
    """Tests that date phrases are properly removed from the text."""

    def test_today_removed(self):
        _, cleaned = manual_parse_due_date("Buy milk today", "2026-03-12T10:00:00")
        assert cleaned.strip() == "Buy milk"

    def test_iso_date_removed(self):
        _, cleaned = manual_parse_due_date("Submit by 2026-04-15", "2026-03-12T10:00:00")
        assert "2026-04-15" not in cleaned

    def test_keyword_and_date_removed(self):
        _, cleaned = manual_parse_due_date("Finish report due tomorrow", "2026-03-12T10:00:00")
        assert "due" not in cleaned.lower()
        assert "tomorrow" not in cleaned.lower()
