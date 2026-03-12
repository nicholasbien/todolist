"""Category management route handlers."""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException

from categories import (
    Category,
    CategoryRename,
    add_category,
    delete_category,
    get_categories,
    rename_category,
)
from routers.deps import get_current_user
from spaces import user_in_space

logger = logging.getLogger(__name__)

router = APIRouter(tags=["categories"])


@router.get("/categories", response_model=List[str])
async def api_get_categories(
    space_id: Optional[str] = None, current_user: dict = Depends(get_current_user)
):
    """Get categories for a space, or default categories if no space_id provided."""
    if space_id is not None and not await user_in_space(
        current_user["user_id"], space_id
    ):
        raise HTTPException(status_code=403, detail="Not in space")
    logger.info("Fetching categories for space %s", space_id or "default")
    return await get_categories(space_id)


@router.post("/categories")
async def api_add_category(
    category: Category, current_user: dict = Depends(get_current_user)
):
    """Add a new category to a space."""
    if category.space_id is not None and not await user_in_space(
        current_user["user_id"], category.space_id
    ):
        raise HTTPException(status_code=403, detail="Not in space")
    logger.info(
        "Adding new category %s to space %s",
        category.name,
        category.space_id or "default",
    )
    return await add_category(category)


@router.put("/categories/{name}")
async def api_rename_category(
    name: str,
    body: CategoryRename,
    space_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Rename an existing category within a space."""
    if space_id is not None and not await user_in_space(
        current_user["user_id"], space_id
    ):
        raise HTTPException(status_code=403, detail="Not in space")
    logger.info(
        "Renaming category %s to %s in space %s",
        name,
        body.new_name,
        space_id or "default",
    )
    return await rename_category(name, body.new_name, space_id)


@router.delete("/categories/{name}")
async def api_delete_category(
    name: str,
    space_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Delete a category from a space."""
    if space_id is not None and not await user_in_space(
        current_user["user_id"], space_id
    ):
        raise HTTPException(status_code=403, detail="Not in space")
    logger.info("Deleting category %s from space %s", name, space_id or "default")
    return await delete_category(name, space_id)
