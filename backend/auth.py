import logging
import os
import secrets
import smtplib
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from bson import ObjectId
from dotenv import load_dotenv
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# MongoDB connection
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
USE_MOCK_DB = os.getenv("USE_MOCK_DB", "false").lower() == "true"
client = AsyncMongoMockClient() if USE_MOCK_DB else AsyncIOMotorClient(MONGODB_URL)
db = client.todo_db
users_collection = db.users
sessions_collection = db.sessions

# JWT settings
JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    raise ValueError("JWT_SECRET environment variable is required")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24 * 7  # 7 days

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
    timezone: str = "UTC"

    class Config:
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
        allow_population_by_field_name = True


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
        allow_population_by_field_name = True


class SignupRequest(BaseModel):
    email: EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    code: str


class UpdateNameRequest(BaseModel):
    first_name: str


def generate_verification_code() -> str:
    """Generate a 6-digit verification code."""
    return f"{secrets.randbelow(1000000):06d}"


def generate_session_token() -> str:
    """Generate a secure session token."""
    return secrets.token_urlsafe(32)


async def send_verification_email(email: str, code: str) -> bool:
    """Send verification code via email."""
    try:
        # In test environment, just print and return
        if os.getenv("USE_MOCK_DB"):
            print(f"VERIFICATION CODE for {email}: {code}")
            return True

        if not SMTP_USERNAME or not SMTP_PASSWORD or not FROM_EMAIL:
            logger.warning("Email credentials not configured, printing code to console")
            print(f"VERIFICATION CODE for {email}: {code}")
            return True

        # Run SMTP operations in thread pool to avoid blocking the event loop
        import asyncio
        import concurrent.futures

        def send_smtp_email():
            msg = MIMEMultipart()
            msg["From"] = FROM_EMAIL
            msg["To"] = email
            msg["Subject"] = "Your Todo App Verification Code"

            body = f"""Hi there!

Your verification code for my todolist app is: {code}

This code will expire in 10 minutes.

If you didn't request this code, please ignore this email.

Best regards,
Nicholas"""

            msg.attach(MIMEText(body, "plain"))

            server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
            server.starttls()
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
        # For testing: always print verification code to console
        print(f"VERIFICATION CODE for {email}: {code}")
        return True

    except Exception as e:
        logger.error(f"Failed to send email to {email}: {str(e)}")
        # For development, print to console if email fails
        print(f"EMAIL FAILED - VERIFICATION CODE for {email}: {code}")
        return True  # Return True anyway for development


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
            )
            user_dict = user.dict(by_alias=True)
            user_dict.pop("_id", None)

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
        # Find user
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
            "user": {
                "id": str(user["_id"]),
                "email": user["email"],
                "first_name": user.get("first_name", ""),
                "summary_hour": user.get("summary_hour"),
                "summary_minute": user.get("summary_minute"),
                "email_instructions": user.get("email_instructions", ""),
            },
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

        return {
            "user_id": str(user["_id"]),
            "email": user["email"],
            "first_name": user.get("first_name", ""),
            "summary_hour": user.get("summary_hour"),
            "summary_minute": user.get("summary_minute"),
            "email_instructions": user.get("email_instructions", ""),
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
            "user": {
                "id": str(user["_id"]),
                "email": user["email"],
                "first_name": user["first_name"],
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in update_user_name: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update name: {str(e)}")


async def update_user_summary_time(user_id: str, hour: int, minute: int) -> dict:
    """Update user's daily summary time."""
    try:
        result = await users_collection.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"summary_hour": hour, "summary_minute": minute}},
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="User not found")

        logger.info("Updated summary time for user %s to %02d:%02d", user_id, hour, minute)

        return {"message": "Summary time updated"}

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
