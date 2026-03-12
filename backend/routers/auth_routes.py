"""Authentication route handlers."""

import logging

from fastapi import APIRouter, Depends

from auth import (
    LoginRequest,
    SignupRequest,
    UpdateNameRequest,
    delete_user_account,
    login_user,
    logout_user,
    signup_user,
    update_user_name,
)
from routers.deps import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["auth"])


@router.post("/auth/signup")
async def api_signup(request: SignupRequest):
    """Send verification code to email for signup/login."""
    logger.info(f"Signup request for email: {request.email}")
    return await signup_user(request.email)


@router.post("/auth/login")
async def api_login(request: LoginRequest):
    """Verify code and create session."""
    logger.info(f"Login request for email: {request.email}")
    return await login_user(request.email, request.code)


@router.post("/auth/logout")
async def api_logout(current_user: dict = Depends(get_current_user)):
    """Logout and deactivate session."""
    logger.info(f"Logout request for user: {current_user['email']}")
    return await logout_user(current_user["token"])


@router.get("/auth/me")
async def api_get_current_user(current_user: dict = Depends(get_current_user)):
    """Get current user info."""
    return current_user


@router.post("/auth/update-name")
async def api_update_name(
    request: UpdateNameRequest, current_user: dict = Depends(get_current_user)
):
    """Update user's first name."""
    logger.info(
        f"Update name request for user: {current_user['email']}, name: {request.first_name}"
    )
    return await update_user_name(current_user["user_id"], request.first_name)


@router.delete("/auth/me")
async def api_delete_account(current_user: dict = Depends(get_current_user)):
    """Delete user account and all associated data."""
    logger.info(f"Account deletion request for user: {current_user['email']}")
    return await delete_user_account(current_user["user_id"])
