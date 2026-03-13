"""Authentication routes."""

import logging

from fastapi import APIRouter, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

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

from .dependencies import get_current_user

logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup")
@limiter.limit("3/minute")
async def api_signup(request: Request, signup_request: SignupRequest):
    """Send verification code to email for signup/login."""
    logger.info(f"Signup request for email: {signup_request.email}")
    return await signup_user(signup_request.email)


@router.post("/login")
@limiter.limit("5/minute")
async def api_login(request: Request, login_request: LoginRequest):
    """Verify code and create session."""
    logger.info(f"Login request for email: {login_request.email}")
    return await login_user(login_request.email, login_request.code)


@router.post("/logout")
@limiter.limit("10/minute")
async def api_logout(request: Request, current_user: dict = Depends(get_current_user)):
    """Logout and deactivate session."""
    logger.info(f"Logout request for user: {current_user['email']}")
    return await logout_user(current_user["token"])


@router.get("/me")
@limiter.limit("30/minute")
async def api_get_current_user(request: Request, current_user: dict = Depends(get_current_user)):
    """Get current user info (session verification)."""
    return current_user


@router.post("/update-name")
@limiter.limit("10/minute")
async def api_update_name(
    request: Request,
    name_request: UpdateNameRequest,
    current_user: dict = Depends(get_current_user),
):
    """Update user's first name."""
    logger.info(f"Update name request for user: {current_user['email']}," f" name: {name_request.first_name}")
    return await update_user_name(current_user["user_id"], name_request.first_name)


@router.delete("/me")
@limiter.limit("3/minute")
async def api_delete_account(request: Request, current_user: dict = Depends(get_current_user)):
    """Delete user account and all associated data."""
    logger.info(f"Account deletion request for user: {current_user['email']}")
    return await delete_user_account(current_user["user_id"])
