"""Space management route handlers."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from routers.deps import get_current_user
from spaces import (
    Space,
    create_space,
    delete_space,
    get_spaces_for_user,
    invite_members,
    leave_space,
    list_space_members,
    update_space,
    user_in_space,
)

router = APIRouter(tags=["spaces"])


class SpaceCreateRequest(BaseModel):
    name: str


class InviteRequest(BaseModel):
    emails: List[str]


class SpaceUpdateRequest(BaseModel):
    name: Optional[str] = None
    collaborative: Optional[bool] = None


@router.get("/spaces", response_model=List[Space])
async def api_get_spaces(current_user: dict = Depends(get_current_user)):
    return await get_spaces_for_user(current_user["user_id"])


@router.post("/spaces", response_model=Space)
async def api_create_space_endpoint(
    req: SpaceCreateRequest, current_user: dict = Depends(get_current_user)
):
    return await create_space(req.name, current_user["user_id"])


@router.post("/spaces/{space_id}/invite")
async def api_invite_members(
    space_id: str, req: InviteRequest, current_user: dict = Depends(get_current_user)
):
    await invite_members(
        space_id,
        current_user["email"],
        req.emails,
        inviter_user_id=current_user["user_id"],
    )
    return {"message": "Invitations sent"}


@router.get("/spaces/{space_id}/members")
async def api_list_members(
    space_id: str, current_user: dict = Depends(get_current_user)
):
    if not await user_in_space(current_user["user_id"], space_id):
        raise HTTPException(status_code=403, detail="Not authorized")
    return await list_space_members(space_id, current_user["user_id"])


@router.post("/spaces/{space_id}/leave")
async def api_leave_space(
    space_id: str, current_user: dict = Depends(get_current_user)
):
    if not await user_in_space(current_user["user_id"], space_id):
        raise HTTPException(status_code=403, detail="Not authorized")
    return await leave_space(space_id, current_user["user_id"])


@router.put("/spaces/{space_id}", response_model=Space)
async def api_update_space(
    space_id: str,
    req: SpaceUpdateRequest,
    current_user: dict = Depends(get_current_user),
):
    return await update_space(
        space_id, current_user["user_id"], req.name, req.collaborative
    )


@router.delete("/spaces/{space_id}")
async def api_delete_space(
    space_id: str, current_user: dict = Depends(get_current_user)
):
    return await delete_space(space_id, current_user["user_id"])
