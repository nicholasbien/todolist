# Timezone Handling for Todo Dates

## Current State

The application currently uses **naive datetimes** (datetimes without timezone information) for all date operations:

- Frontend creates todos with `dateAdded: datetime.now().isoformat()`
- Backend processes these naive datetime strings
- Date parsing in `dateparse.py` uses naive datetimes for calculations

### The Problem

**Symptom**: Sometimes when users specify a due date (e.g., "do this by Friday"), the parsed date is one day ahead (Saturday).

**Root Cause**: When naive datetimes cross timezone boundaries, they can be interpreted differently:
- User creates task at 11 PM PST Tuesday
- Naive datetime: `2025-12-09T23:00:00` (no timezone info)
- If server runs in UTC, it might interpret this as Wednesday 7 AM UTC
- Date calculations then use Wednesday as "today" instead of Tuesday
- "Friday from Wednesday" could be calculated incorrectly

**Why it's intermittent**: Only happens when creating tasks late in the day in timezones behind UTC.

## Proposed Solution: UTC Timezone-Aware Datetimes

Make all datetime operations use **timezone-aware UTC datetimes** throughout the stack.

### Benefits
- Consistent date calculations regardless of server timezone
- Clear semantics: all dates stored in UTC
- Easier debugging: no ambiguity about what "now" means
- Better for users across different timezones

### Implementation Plan

#### 1. Backend: Use UTC for All Datetime Generation

**Files to modify:**
- `backend/app.py`
- `backend/todos.py`
- `backend/agent/tools.py`

**Changes:**

```python
# Before (naive):
from datetime import datetime
datetime.now().isoformat()  # ❌ Naive, local timezone

# After (timezone-aware UTC):
from datetime import datetime, timezone
datetime.now(timezone.utc).isoformat()  # ✅ UTC timezone-aware
# Returns: "2025-12-09T23:00:00+00:00"
```

**Specific locations:**

1. **`backend/app.py:349`** - Default dateAdded:
   ```python
   # Current:
   body.setdefault("dateAdded", datetime.now().isoformat())

   # Fixed:
   from datetime import datetime, timezone
   body.setdefault("dateAdded", datetime.now(timezone.utc).isoformat())
   ```

2. **`backend/todos.py:220`** - Date completed:
   ```python
   # Current:
   {"$set": {"completed": True, "dateCompleted": datetime.now().isoformat()}}

   # Fixed:
   {"$set": {"completed": True, "dateCompleted": datetime.now(timezone.utc).isoformat()}}
   ```

3. **`backend/agent/tools.py:458, 527, 568`** - Agent datetime operations:
   ```python
   # Replace all datetime.now() and datetime.utcnow() with:
   datetime.now(timezone.utc)
   ```

#### 2. Date Parsing: Handle Timezone-Aware Strings

**File: `backend/dateparse.py`**

Update `manual_parse_due_date` to handle both naive and timezone-aware datetimes:

```python
def manual_parse_due_date(text: str, date_added: str) -> tuple[Optional[str], str]:
    """
    Parse simple relative dates and explicit date formats from text.
    Handles both naive and timezone-aware datetime strings.
    """
    from datetime import timezone

    reference = datetime.fromisoformat(date_added)

    # If naive datetime, assume it's UTC
    if reference.tzinfo is None:
        reference = reference.replace(tzinfo=timezone.utc)

    # All subsequent calculations use timezone-aware reference
    # ... rest of function unchanged
```

**Why this works:**
- Backward compatible: handles old naive datetimes by assuming UTC
- Future-proof: properly handles new timezone-aware datetimes
- Date arithmetic with `timedelta` works correctly with timezone-aware datetimes

#### 3. Classification: Use Timezone-Aware Parsing

**File: `backend/classify.py:81-86`**

```python
# Current:
try:
    date_obj = datetime.fromisoformat(date_added)
    day_of_week = date_obj.strftime("%A")
    date_only = date_obj.strftime("%Y-%m-%d")
except Exception:
    day_of_week = None
    date_only = date_added.split("T")[0] if "T" in date_added else date_added

# Fixed:
try:
    from datetime import timezone
    date_obj = datetime.fromisoformat(date_added)

    # If naive, assume UTC
    if date_obj.tzinfo is None:
        date_obj = date_obj.replace(tzinfo=timezone.utc)

    day_of_week = date_obj.strftime("%A")
    date_only = date_obj.strftime("%Y-%m-%d")
except Exception:
    day_of_week = None
    date_only = date_added.split("T")[0] if "T" in date_added else date_added
```

#### 4. Frontend: Send Timezone-Aware Datetimes

**File: `frontend/src/components/AIToDoListApp.tsx`** (or wherever todos are created)

```typescript
// Current (if using JavaScript Date):
const dateAdded = new Date().toISOString();
// Returns: "2025-12-09T23:00:00.123Z" (already UTC!)

// If you're using a custom date formatter, ensure it includes timezone:
const dateAdded = new Date().toISOString();  // ✅ Always UTC with 'Z' suffix
```

**Good news**: JavaScript's `Date.toISOString()` already returns UTC timezone-aware strings with 'Z' suffix!

#### 5. Email Summary: Use Timezone-Aware Dates

**File: `backend/email_summary.py`**

Update all `datetime.now()` calls:
```python
# Lines 142, 291, 444, 548, 571
datetime.now(timezone.utc)
```

#### 6. Tests: Use Timezone-Aware Datetimes

**Files: `backend/tests/*.py`**

Update all test fixtures:
```python
# Current:
"dateAdded": datetime.now().isoformat()

# Fixed:
from datetime import datetime, timezone
"dateAdded": datetime.now(timezone.utc).isoformat()
```

### Migration Strategy

#### Phase 1: Backend Changes (Backward Compatible)
1. Update `dateparse.py` to handle both naive and timezone-aware datetimes
2. Update `classify.py` to handle both formats
3. Update backend to generate timezone-aware datetimes for new todos
4. **Result**: Old naive datetimes still work, new ones are timezone-aware

#### Phase 2: Test & Validate
1. Update all tests to use timezone-aware datetimes
2. Run full test suite
3. Manual testing of date parsing with various inputs
4. Verify both old and new datetime formats work

#### Phase 3: Frontend Update (if needed)
1. Check if frontend is already sending UTC timestamps (likely yes!)
2. If not, update to use `.toISOString()`
3. Test end-to-end flow

### Testing Checklist

After implementation, test these scenarios:

- [ ] Create todo with "do this by Friday" on Tuesday → Should give Friday
- [ ] Create todo with "do this tomorrow" at 11 PM PST → Should give next day
- [ ] Create todo with explicit date "2025-12-15" → Should give Dec 15
- [ ] Create todo with "in 3 days" → Should give 3 days from today
- [ ] Complete a todo → dateCompleted should be UTC timestamp
- [ ] Old todos with naive timestamps still work
- [ ] New todos with timezone-aware timestamps work
- [ ] Date calculations work across timezone boundaries

### Rollback Plan

If issues arise:

1. **Immediate**: Revert backend changes, keep using naive datetimes
2. **Database**: No migration needed - dates stored as ISO strings work either way
3. **Frontend**: No changes needed if already using `.toISOString()`

### Alternative: User Timezone Preference

If you want to display dates in user's local timezone (while storing in UTC):

```python
# Store user's timezone preference in User model
class User(BaseModel):
    timezone: str = "UTC"  # e.g., "America/Los_Angeles"

# Convert UTC to user's timezone for display
import pytz
user_tz = pytz.timezone(user.timezone)
local_time = utc_time.astimezone(user_tz)
```

**Note**: This adds complexity. Only implement if users explicitly request timezone-aware display.

## Files to Modify (Summary)

### Critical (Required for fix):
- `backend/app.py:349` - Default dateAdded
- `backend/dateparse.py:20` - Date parsing reference
- `backend/classify.py:81-86` - Classification date handling
- `backend/todos.py:220` - Date completed

### Recommended (Consistency):
- `backend/agent/tools.py:458, 527, 568` - Agent datetime operations
- `backend/email_summary.py:142, 291, 444, 548, 571` - Email datetime operations

### Tests (For validation):
- `backend/tests/test_todos.py`
- `backend/tests/test_todo_date_updates.py`
- `backend/tests/test_due_date.py`
- All other test files using `datetime.now()`

## References

- [Python datetime timezone docs](https://docs.python.org/3/library/datetime.html#datetime.timezone)
- [ISO 8601 format](https://en.wikipedia.org/wiki/ISO_8601)
- [JavaScript Date.toISOString()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toISOString)
