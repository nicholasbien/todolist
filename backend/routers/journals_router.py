"""Journal management routes."""

import logging
from typing import List, Optional, Union

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from journals import (
    JournalEntry,
    create_journal_entry,
    delete_journal_entry,
    get_journal_entries,
    get_journal_entry_by_date,
)
from spaces import user_in_space

from .dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["journals"])


class JournalCreateRequest(BaseModel):
    date: str  # YYYY-MM-DD format
    text: str
    space_id: Optional[str] = None


@router.get("/journals", response_model=Union[JournalEntry, List[JournalEntry], None])
async def api_get_journal_entries(
    date: Optional[str] = None,
    space_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Get journal entries. If date is provided, get entry for that specific date. Otherwise get recent entries."""
    try:
        # Check space access if space_id provided
        if space_id is not None and not await user_in_space(
            current_user["user_id"], space_id
        ):
            raise HTTPException(status_code=403, detail="Access denied to this space")

        if date:
            # Get specific date entry
            entry = await get_journal_entry_by_date(
                current_user["user_id"], date, space_id
            )
            return entry
        else:
            # Get recent entries
            entries = await get_journal_entries(current_user["user_id"], space_id)
            return entries

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching journal entries: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch journal entries")


@router.post("/journals", response_model=JournalEntry)
async def api_create_journal_entry(
    request: JournalCreateRequest, current_user: dict = Depends(get_current_user)
):
    """Create or update a journal entry."""
    try:
        # Input length validation
        if len(request.text) > 50000:
            raise HTTPException(
                status_code=400, detail="Journal text too long (max 50000 chars)"
            )

        # Check space access if space_id provided
        if request.space_id is not None and not await user_in_space(
            current_user["user_id"], request.space_id
        ):
            raise HTTPException(status_code=403, detail="Access denied to this space")

        # Create journal entry
        entry = JournalEntry(
            user_id=current_user["user_id"],
            space_id=request.space_id,
            date=request.date,
            text=request.text,
        )

        result = await create_journal_entry(entry, current_user.get("timezone", "UTC"))
        logger.info(
            f"Journal entry created/updated for user {current_user['email']}, date {request.date}"
        )
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating journal entry: {e}")
        raise HTTPException(status_code=500, detail="Failed to create journal entry")


@router.delete("/journals/{entry_id}")
async def api_delete_journal_entry(
    entry_id: str, current_user: dict = Depends(get_current_user)
):
    """Delete a journal entry."""
    try:
        success = await delete_journal_entry(entry_id, current_user["user_id"])
        if success:
            logger.info(
                f"Journal entry {entry_id} deleted by user {current_user['email']}"
            )
            return {"message": "Journal entry deleted successfully"}
        else:
            raise HTTPException(status_code=404, detail="Journal entry not found")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting journal entry: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete journal entry")
