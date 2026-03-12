"""Image upload and retrieval using MongoDB GridFS.

Provides endpoints for uploading images (with size/type validation) and
serving them back via a simple GET endpoint. Images are stored in GridFS
which handles chunking large files automatically.
"""

import logging
from typing import Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorGridFSBucket

from db import db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# GridFS bucket for image storage
fs = AsyncIOMotorGridFSBucket(db, bucket_name="images")

# Validation constants
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5 MB
ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
}


async def upload_image(
    file_data: bytes,
    filename: str,
    content_type: str,
    user_id: str,
    space_id: Optional[str] = None,
) -> str:
    """Upload an image to GridFS and return its string ID.

    Raises ValueError for invalid file type or size.
    """
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise ValueError(
            f"Unsupported image type: {content_type}. "
            f"Allowed types: {', '.join(sorted(ALLOWED_CONTENT_TYPES))}"
        )

    if len(file_data) > MAX_IMAGE_SIZE:
        raise ValueError(
            f"Image too large ({len(file_data)} bytes). Maximum size is {MAX_IMAGE_SIZE} bytes."
        )

    if len(file_data) == 0:
        raise ValueError("Empty file")

    metadata = {
        "user_id": user_id,
        "content_type": content_type,
    }
    if space_id:
        metadata["space_id"] = space_id

    grid_id = await fs.upload_from_stream(
        filename,
        file_data,
        metadata=metadata,
    )
    image_id = str(grid_id)
    logger.info(
        "Uploaded image %s (%s, %d bytes) for user %s",
        image_id,
        content_type,
        len(file_data),
        user_id,
    )
    return image_id


async def get_image(image_id: str) -> Optional[dict]:
    """Retrieve an image by ID.

    Returns a dict with keys: data (bytes), content_type (str), filename (str),
    user_id (str), space_id (str|None).
    Returns None if not found.
    """
    try:
        oid = ObjectId(image_id)
    except Exception:
        return None

    try:
        grid_out = await fs.open_download_stream(oid)
    except Exception:
        return None

    data = await grid_out.read()
    metadata = grid_out.metadata or {}

    return {
        "data": data,
        "content_type": metadata.get("content_type", "application/octet-stream"),
        "filename": grid_out.filename,
        "user_id": metadata.get("user_id"),
        "space_id": metadata.get("space_id"),
    }


async def get_image_metadata(image_id: str) -> Optional[dict]:
    """Retrieve image metadata without downloading the file data.

    Returns a dict with keys: user_id (str), space_id (str|None), content_type (str).
    Returns None if not found.
    """
    try:
        oid = ObjectId(image_id)
    except Exception:
        return None

    # Query the GridFS files collection directly for metadata only
    file_doc = await db["images.files"].find_one({"_id": oid})
    if not file_doc:
        return None

    metadata = file_doc.get("metadata") or {}
    return {
        "user_id": metadata.get("user_id"),
        "space_id": metadata.get("space_id"),
        "content_type": metadata.get("content_type", "application/octet-stream"),
    }


async def delete_image(image_id: str) -> bool:
    """Delete an image from GridFS. Returns True if deleted."""
    try:
        oid = ObjectId(image_id)
        await fs.delete(oid)
        logger.info("Deleted image %s", image_id)
        return True
    except Exception:
        return False
