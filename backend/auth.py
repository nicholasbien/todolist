import logging
import os
import secrets
import smtplib
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Optional

from bson import ObjectId
from dotenv import load_dotenv
from fastapi import HTTPException
from pydantic import BaseModel, EmailStr, Field

from db import db
from spaces import add_user_to_pending_spaces

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# MongoDB connection provided by shared database module
users_collection = db.users
sessions_collection = db.sessions


async def init_auth_indexes() -> None:
    """Create indexes used for authentication and session management."""
    try:
        # User collection indexes
        await users_collection.create_index("email", unique=True)  # Unique constraint for login

        # Session collection indexes
        await sessions_collection.create_index("token", unique=True)  # Fast token lookup
        await sessions_collection.create_index("user_id")  # Find sessions by user
        await sessions_collection.create_index("expires_at")  # Cleanup expired sessions efficiently

        # Compound index for session validation (token + expiry check)
        await sessions_collection.create_index([("token", 1), ("expires_at", 1)])

        logger.info("Auth indexes created successfully")
    except Exception as e:
        logger.error(f"Error creating auth indexes: {e}")


# JWT settings
JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    raise ValueError("JWT_SECRET environment variable is required")
JWT_ALGORITHM = "HS256"
# Extend sessions for 30 days from last activity
JWT_EXPIRATION_HOURS = 24 * 30  # 30 days

# Email settings
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
FROM_EMAIL = os.getenv("FROM_EMAIL")
SMTP_USERNAME = FROM_EMAIL  # Use FROM_EMAIL as username
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")


# Pydantic models
class User(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    email: EmailStr
    first_name: str
    verification_code: Optional[str] = None
    code_expires_at: Optional[datetime] = None
    is_verified: bool = False
    created_at: datetime = Field(default_factory=datetime.now)
    last_login: Optional[datetime] = None
    summary_hour: Optional[int] = None
    summary_minute: Optional[int] = None
    email_instructions: str = ""
    timezone: str = "America/New_York"
    email_enabled: bool = False
    email_spaces: List[str] = []
    # Proactive briefing preferences
    briefing_enabled: bool = False
    briefing_hour: int = 8
    briefing_minute: int = 0
    stale_task_days: int = 3

    class Config:
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
        populate_by_name = True


class Session(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    user_id: str
    token: str
    created_at: datetime = Field(default_factory=datetime.now)
    expires_at: datetime
    is_active: bool = True

    class Config:
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
        populate_by_name = True


class SignupRequest(BaseModel):
    email: EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    code: str


class UpdateNameRequest(BaseModel):
    first_name: str


class UserResponse(BaseModel):
    """User response model with consistent id field."""

    id: str
    email: str
    first_name: str
    summary_hour: Optional[int] = None
    summary_minute: Optional[int] = None
    email_instructions: str = ""
    timezone: str = "America/New_York"
    email_enabled: bool = False
    email_spaces: List[str] = []
    # Proactive briefing preferences
    briefing_enabled: bool = False
    briefing_hour: int = 8
    briefing_minute: int = 0
    stale_task_days: int = 3

    @classmethod
    def from_db(cls, user_dict: dict) -> "UserResponse":
        """Create UserResponse from database document."""
        return cls(
            id=str(user_dict["_id"]),
            email=user_dict["email"],
            first_name=user_dict.get("first_name", ""),
            summary_hour=user_dict.get("summary_hour"),
            summary_minute=user_dict.get("summary_minute"),
            email_instructions=user_dict.get("email_instructions", ""),
            timezone=user_dict.get("timezone", "America/New_York"),
            email_enabled=user_dict.get("email_enabled", False),
            email_spaces=user_dict.get("email_spaces", []),
            briefing_enabled=user_dict.get("briefing_enabled", False),
            briefing_hour=user_dict.get("briefing_hour", 8),
            briefing_minute=user_dict.get("briefing_minute", 0),
            stale_task_days=user_dict.get("stale_task_days", 3),
        )


def generate_verification_code() -> str:
    """Generate a 6-digit verification code."""
    return f"{secrets.randbelow(1000000):06d}"


def generate_session_token() -> str:
    """Generate a secure session token."""
    return secrets.token_urlsafe(32)


async def send_verification_email(email: str, code: str) -> bool:
    """Send verification code via email."""
    try:
        # Skip sending emails to @example.com addresses (test/demo accounts)
        if email.lower().endswith("@example.com"):
            logger.info(f"Skipped verification email to example.com address: {email}")
            print(f"VERIFICATION CODE for {email}: {code}")
            return True

        # In test environment, just print and return
        if os.getenv("ALLOW_TEST_ACCOUNT"):
            print(f"VERIFICATION CODE for {email}: {code}")
            return True

        if not SMTP_USERNAME or not SMTP_PASSWORD or not FROM_EMAIL:
            logger.warning("Email credentials not configured, printing code to console")
            print(f"VERIFICATION CODE for {email}: {code}")
            return False

        # Run SMTP operations in thread pool to avoid blocking the event loop
        import asyncio
        import concurrent.futures

        def send_smtp_email():
            msg = MIMEMultipart()
            msg["From"] = FROM_EMAIL
            msg["To"] = email
            msg["Subject"] = "Your Todo App Verification Code"

            body = f"""Hi there!

Your verification code for todolist is: {code}

This code will expire in 10 minutes.

If you didn't request this code, please ignore this email.

Best regards,
Nicholas"""

            msg.attach(MIMEText(body, "plain"))

            server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            text = msg.as_string()
            server.sendmail(FROM_EMAIL, email, text)
            server.quit()
            return True

        # Run SMTP in thread pool
        loop = asyncio.get_event_loop()
        with concurrent.futures.ThreadPoolExecutor() as executor:
            await loop.run_in_executor(executor, send_smtp_email)

        logger.info(f"Verification email sent to {email}")
        # Only print verification code in test/dev environments
        if os.getenv("ALLOW_TEST_ACCOUNT"):
            print(f"VERIFICATION CODE for {email}: {code}")
        return True

    except Exception as e:
        logger.error(f"Failed to send email to {email}: {str(e)}")
        # For development, print to console if email fails
        print(f"EMAIL FAILED - VERIFICATION CODE for {email}: {code}")
        return False


async def signup_user(email: str) -> dict:
    """Create or update user with new verification code."""
    try:
        # Generate verification code
        code = generate_verification_code()
        code_expires_at = datetime.now() + timedelta(minutes=10)

        # Check if user already exists
        existing_user = await users_collection.find_one({"email": email})

        if existing_user:
            # Update existing user with new code
            await users_collection.update_one(
                {"email": email},
                {
                    "$set": {
                        "verification_code": code,
                        "code_expires_at": code_expires_at,
                        "is_verified": False,
                    }
                },
            )
            logger.info(f"Updated verification code for existing user: {email}")
        else:
            # Create new user (first_name will be added during login)
            user = User(
                email=email,
                first_name="",  # Will be set during first login
                verification_code=code,
                code_expires_at=code_expires_at,
                summary_hour=None,
                summary_minute=None,
                email_instructions="",
                timezone="America/New_York",
                email_enabled=False,
            )
            user_dict = user.dict(by_alias=True)
            user_dict.pop("_id", None)
            user_dict.pop("email_spaces", None)

            await users_collection.insert_one(user_dict)
            logger.info(f"Created new user: {email}")

        # Send verification email
        email_sent = await send_verification_email(email, code)

        if email_sent:
            return {"message": "Verification code sent to your email"}
        else:
            raise HTTPException(status_code=500, detail="Failed to send verification email")

    except Exception as e:
        logger.error(f"Error in signup_user: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Signup failed: {str(e)}")


async def login_user(email: str, code: str) -> dict:
    """Verify code and create session for user."""
    try:
        # Test environment bypass - only available when ALLOW_TEST_ACCOUNT is set
        is_test_env = os.getenv("ALLOW_TEST_ACCOUNT")
        test_email = os.getenv("TEST_EMAIL") if is_test_env else None
        test_code = os.getenv("TEST_CODE") if is_test_env else None
        if is_test_env and test_email and test_code and email == test_email and code == test_code:
            # Find or create test user
            user = await users_collection.find_one({"email": email})
            if not user:
                # Create test user
                user = User(
                    email=email,
                    first_name="Test User",
                    is_verified=True,
                    email_instructions="",
                    timezone="America/New_York",
                    email_enabled=False,
                )
                user_dict = user.dict(by_alias=True)
                user_dict.pop("_id", None)
                user_dict.pop("email_spaces", None)
                result = await users_collection.insert_one(user_dict)
                user = await users_collection.find_one({"_id": result.inserted_id})
                logger.info(f"Created test user: {email}")

            # Skip verification steps for test user
            logger.info(f"Test login bypassed for: {email}")
        else:
            # Normal verification flow
            user = await users_collection.find_one({"email": email})
            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            # Check if code is valid and not expired
            if user.get("verification_code") != code:
                raise HTTPException(status_code=400, detail="Invalid verification code")

            if not user.get("code_expires_at") or datetime.now() > user["code_expires_at"]:
                raise HTTPException(status_code=400, detail="Verification code has expired")

        # Mark user as verified and update last login
        await users_collection.update_one(
            {"email": email},
            {
                "$set": {"is_verified": True, "last_login": datetime.now()},
                "$unset": {"verification_code": "", "code_expires_at": ""},
            },
        )

        # Add user to any spaces they were invited to
        await add_user_to_pending_spaces(str(user["_id"]), email)

        # Ensure user has a default space
        await ensure_user_has_default_space(str(user["_id"]))

        # Reload user data to get updated email_spaces field
        user = await users_collection.find_one({"_id": user["_id"]})

        # Create session
        token = generate_session_token()
        expires_at = datetime.now() + timedelta(hours=JWT_EXPIRATION_HOURS)

        session = Session(user_id=str(user["_id"]), token=token, expires_at=expires_at)

        session_dict = session.dict(by_alias=True)
        session_dict.pop("_id", None)

        await sessions_collection.insert_one(session_dict)

        logger.info(f"User logged in successfully: {email}")

        return {
            "message": "Login successful",
            "token": token,
            "user": UserResponse.from_db(user).dict(),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in login_user: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")


async def verify_session(token: str) -> dict:
    """Verify session token and return user info."""
    try:
        # Find active session
        session = await sessions_collection.find_one(
            {"token": token, "is_active": True, "expires_at": {"$gt": datetime.now()}}
        )

        if not session:
            raise HTTPException(status_code=401, detail="Invalid or expired session")

        # Get user info
        user = await users_collection.find_one({"_id": ObjectId(session["user_id"])})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Extend expiration to one month from last activity
        new_expiration = datetime.now() + timedelta(hours=JWT_EXPIRATION_HOURS)
        await sessions_collection.update_one({"_id": session["_id"]}, {"$set": {"expires_at": new_expiration}})

        # Record last active time
        await users_collection.update_one({"_id": user["_id"]}, {"$set": {"last_login": datetime.now()}})

        # Return consistent user data structure (using 'id' to match login response)
        return {
            "user_id": str(user["_id"]),  # Keep for backward compatibility
            "id": str(user["_id"]),  # Add 'id' field to match UserResponse
            "email": user["email"],
            "first_name": user.get("first_name", ""),
            "summary_hour": user.get("summary_hour"),
            "summary_minute": user.get("summary_minute"),
            "email_instructions": user.get("email_instructions", ""),
            "timezone": user.get("timezone", "America/New_York"),
            "email_enabled": user.get("email_enabled", False),
            "email_spaces": user.get("email_spaces", []),
            "briefing_enabled": user.get("briefing_enabled", False),
            "briefing_hour": user.get("briefing_hour", 8),
            "briefing_minute": user.get("briefing_minute", 0),
            "stale_task_days": user.get("stale_task_days", 3),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in verify_session: {str(e)}")
        raise HTTPException(status_code=401, detail="Session verification failed")


async def logout_user(token: str) -> dict:
    """Deactivate user session."""
    try:
        result = await sessions_collection.update_one({"token": token}, {"$set": {"is_active": False}})

        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Session not found")

        return {"message": "Logged out successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in logout_user: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Logout failed: {str(e)}")


async def update_user_name(user_id: str, first_name: str) -> dict:
    """Update user's first name."""
    try:
        # Update user's first name
        result = await users_collection.update_one({"_id": ObjectId(user_id)}, {"$set": {"first_name": first_name}})

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="User not found")

        # Get updated user data
        user = await users_collection.find_one({"_id": ObjectId(user_id)})

        logger.info(f"Updated first name for user: {user['email']}")

        return {
            "message": "Name updated successfully",
            "user": UserResponse.from_db(user).dict(),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in update_user_name: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update name: {str(e)}")


async def delete_user_account(user_id: str) -> dict:
    """Delete user account and all associated data.

    This will permanently delete:
    - All todos owned by the user
    - All journals owned by the user
    - All categories in user's spaces
    - All spaces owned by the user
    - User's membership from shared spaces
    - All sessions for the user
    - The user account itself
    """
    try:
        # Import collections
        from db import collections
        from spaces import spaces_collection

        user_object_id = ObjectId(user_id)

        # Verify user exists
        user = await users_collection.find_one({"_id": user_object_id})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        user_email = user.get("email", "unknown")
        logger.info(f"Starting account deletion for user: {user_email} ({user_id})")

        # 1. Delete all todos owned by this user
        todos_result = await collections.todos.delete_many({"user_id": user_id})
        logger.info(f"Deleted {todos_result.deleted_count} todos for user {user_email}")

        # 2. Delete all journals owned by this user
        journals_result = await collections.journals.delete_many({"user_id": user_id})
        logger.info(f"Deleted {journals_result.deleted_count} journals for user {user_email}")

        # 3. Get all spaces owned by this user to delete their categories
        owned_spaces = await spaces_collection.find({"owner_id": user_id}).to_list(length=None)
        space_ids = [str(space["_id"]) for space in owned_spaces]

        # Delete categories for all spaces owned by this user
        if space_ids:
            categories_result = await collections.categories.delete_many({"space_id": {"$in": space_ids}})
            logger.info(f"Deleted {categories_result.deleted_count} categories for user {user_email}")

        # 4. Delete all spaces owned by this user
        spaces_result = await spaces_collection.delete_many({"owner_id": user_id})
        logger.info(f"Deleted {spaces_result.deleted_count} spaces owned by user {user_email}")

        # 5. Remove user from member_ids of any shared spaces
        shared_spaces_result = await spaces_collection.update_many(
            {"member_ids": user_id}, {"$pull": {"member_ids": user_id}}
        )
        logger.info(f"Removed user {user_email} from {shared_spaces_result.modified_count} shared spaces")

        # 6. Remove user email from pending_emails of any spaces
        pending_spaces_result = await spaces_collection.update_many(
            {"pending_emails": user_email}, {"$pull": {"pending_emails": user_email}}
        )
        logger.info(f"Removed user {user_email} from {pending_spaces_result.modified_count} pending invites")

        # 7. Delete all sessions for this user
        sessions_result = await sessions_collection.delete_many({"user_id": user_id})
        logger.info(f"Deleted {sessions_result.deleted_count} sessions for user {user_email}")

        # 8. Finally, delete the user account itself
        user_result = await users_collection.delete_one({"_id": user_object_id})
        if user_result.deleted_count == 0:
            raise HTTPException(status_code=500, detail="Failed to delete user account")

        logger.info(f"Successfully deleted user account: {user_email} ({user_id})")

        return {
            "message": "Account deleted successfully",
            "deleted": {
                "todos": todos_result.deleted_count,
                "journals": journals_result.deleted_count,
                "categories": categories_result.deleted_count if space_ids else 0,
                "spaces": spaces_result.deleted_count,
                "sessions": sessions_result.deleted_count,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in delete_user_account: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete account: {str(e)}")


async def ensure_user_has_default_space(user_id: str) -> None:
    """Ensure the user has a default space, creating one if needed."""
    try:
        # Import here to avoid circular imports
        from spaces import spaces_collection

        # Check if user already has a default space
        existing_default = await spaces_collection.find_one({"owner_id": user_id, "is_default": True})

        if not existing_default:
            # Create default space
            default_space = {
                "name": "Personal",
                "owner_id": user_id,
                "member_ids": [user_id],
                "pending_emails": [],
                "is_default": True,
            }

            result = await spaces_collection.insert_one(default_space)
            space_id = str(result.inserted_id)
            logger.info(f"Created default space {space_id} for user {user_id}")
        else:
            space_id = str(existing_default["_id"])

        # Ensure email summaries include the default space by default
        await users_collection.update_one(
            {"_id": ObjectId(user_id), "email_spaces": {"$exists": False}},
            {"$set": {"email_spaces": [space_id]}},
        )

    except Exception as e:
        logger.error(f"Error ensuring default space for user {user_id}: {str(e)}")


async def update_user_summary_time(
    user_id: str,
    email_enabled: bool,
    hour: int,
    minute: int,
    timezone: str = "America/New_York",
) -> dict:
    """Update user's daily summary time, timezone, and email enabled status."""
    try:
        update_fields = {
            "summary_hour": hour,
            "summary_minute": minute,
            "timezone": timezone,
            "email_enabled": email_enabled,
        }

        result = await users_collection.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": update_fields},
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="User not found")

        status = "enabled" if email_enabled else "disabled" if email_enabled is False else "unchanged"
        logger.info(
            "Updated summary time for user %s to %02d:%02d %s (email %s)",
            user_id,
            hour,
            minute,
            timezone,
            status,
        )

        return {"message": "Summary settings updated"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in update_user_summary_time: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update summary time")


async def update_user_email_instructions(user_id: str, instructions: str) -> dict:
    """Update a user's custom email instructions."""
    try:
        result = await users_collection.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"email_instructions": instructions}},
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="User not found")

        logger.info("Updated email instructions for user %s", user_id)

        return {"message": "Email instructions updated"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in update_user_email_instructions: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update email instructions")


async def update_user_email_spaces(user_id: str, space_ids: List[str]) -> dict:
    """Update the list of spaces included in daily summaries."""
    try:
        unique_ids = list(dict.fromkeys(space_ids))

        result = await users_collection.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"email_spaces": unique_ids}},
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="User not found")

        logger.info("Updated email spaces for user %s", user_id)

        return {"message": "Email spaces updated"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in update_user_email_spaces: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update email spaces")


async def cleanup_expired_sessions():
    """Clean up expired sessions and verification codes."""
    try:
        # Remove expired sessions
        await sessions_collection.delete_many({"expires_at": {"$lt": datetime.now()}})

        # Remove expired verification codes
        await users_collection.update_many(
            {"code_expires_at": {"$lt": datetime.now()}},
            {"$unset": {"verification_code": "", "code_expires_at": ""}},
        )

        logger.info("Cleaned up expired sessions and codes")

    except Exception as e:
        logger.error(f"Error in cleanup: {str(e)}")
