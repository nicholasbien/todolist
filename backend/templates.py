import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from bson import ObjectId
from db import db
from dotenv import load_dotenv
from fastapi import HTTPException
from pydantic import BaseModel, Field
from spaces import user_in_space

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# MongoDB connection provided by shared database module
templates_collection = db.templates


SYSTEM_TEMPLATE_DEFINITIONS = [
    {
        "name": "Daily Standup",
        "description": "Daily check-in format for team updates.",
        "default_text": "Daily standup update",
        "default_category": "Work",
        "default_priority": "Medium",
        "default_notes": "Yesterday / Today / Blockers",
    },
    {
        "name": "Weekly Review",
        "description": "Review wins, blockers, and next-week priorities.",
        "default_text": "Weekly review",
        "default_category": "Planning",
        "default_priority": "Medium",
        "default_notes": "Wins / Challenges / Priorities",
    },
    {
        "name": "Bug Report",
        "description": "Capture bug details with reproduction context.",
        "default_text": "Investigate and fix bug",
        "default_category": "Development",
        "default_priority": "High",
        "default_notes": "Steps to reproduce / Expected / Actual",
    },
    {
        "name": "Meeting Notes",
        "description": "Capture decisions, action items, and follow-ups.",
        "default_text": "Document meeting notes",
        "default_category": "Work",
        "default_priority": "Medium",
        "default_notes": "Agenda / Decisions / Action items",
    },
]


class Template(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    name: str
    description: Optional[str] = None
    default_text: str
    default_category: Optional[str] = "General"
    default_priority: Optional[str] = "Medium"
    default_notes: Optional[str] = None
    space_id: Optional[str] = None
    user_id: Optional[str] = None
    is_system: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
        populate_by_name = True


def _parse_template_id(template_id: str) -> ObjectId:
    if not template_id or template_id == "None" or template_id == "undefined":
        raise HTTPException(status_code=400, detail="Invalid template ID")
    try:
        return ObjectId(template_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid template ID format")


def _sanitize_template_updates(updates: Dict[str, Any]) -> Dict[str, Any]:
    allowed_fields = {
        "name",
        "description",
        "default_text",
        "default_category",
        "default_priority",
        "default_notes",
        "space_id",
    }
    sanitized = {key: value for key, value in updates.items() if key in allowed_fields}

    if "space_id" in sanitized and sanitized["space_id"] in ("", "None", "undefined"):
        sanitized["space_id"] = None

    return sanitized


async def init_system_templates() -> None:
    """Ensure required system templates exist."""
    try:
        for template in SYSTEM_TEMPLATE_DEFINITIONS:
            await templates_collection.update_one(
                {"name": template["name"], "is_system": True},
                {
                    "$setOnInsert": {
                        **template,
                        "space_id": None,
                        "user_id": None,
                        "is_system": True,
                        "created_at": datetime.utcnow(),
                    }
                },
                upsert=True,
            )
    except Exception as e:
        logger.error(f"Error initializing system templates: {e}")
        raise HTTPException(status_code=500, detail=f"Error initializing system templates: {str(e)}")


async def init_template_indexes() -> None:
    """Create indexes used in frequent template queries."""
    try:
        await templates_collection.create_index("user_id")
        await templates_collection.create_index("space_id")
        await templates_collection.create_index("is_system")
        await templates_collection.create_index("created_at")

        # Common lookup pattern: user + space
        await templates_collection.create_index([("user_id", 1), ("space_id", 1)])

        # Fast listing for system templates and deterministic ordering
        await templates_collection.create_index([("is_system", 1), ("name", 1)])

        # Ensure one system template per name
        await templates_collection.create_index(
            [("name", 1), ("is_system", 1)],
            unique=True,
            partialFilterExpression={"is_system": True},
        )

        await init_system_templates()
        logger.info("Template indexes created successfully")
    except Exception as e:
        logger.error(f"Error creating template indexes: {e}")


async def create_template(template: Template, user_id: str) -> Template:
    """Create a user-owned task template."""
    try:
        if template.is_system:
            raise HTTPException(status_code=403, detail="Cannot create system templates")

        template_dict = template.dict(by_alias=True, exclude_unset=True)
        template_dict.pop("_id", None)

        template_dict["user_id"] = user_id
        template_dict["is_system"] = False
        template_dict["created_at"] = template_dict.get("created_at", datetime.utcnow())

        template_space_id = template_dict.get("space_id")
        if template_space_id and not await user_in_space(user_id, template_space_id):
            raise HTTPException(status_code=403, detail="Not in space")

        result = await templates_collection.insert_one(template_dict)
        created_template = await templates_collection.find_one({"_id": result.inserted_id})
        if not created_template:
            raise HTTPException(status_code=404, detail="Created template not found")

        created_template["_id"] = str(created_template["_id"])
        return Template(**created_template)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating template: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating template: {str(e)}")


async def get_templates(user_id: str, space_id: Optional[str] = None) -> List[Template]:
    """Get system templates plus user templates, optionally scoped to a space."""
    try:
        await init_system_templates()

        if space_id and not await user_in_space(user_id, space_id):
            raise HTTPException(status_code=403, detail="Not in space")

        if space_id is None:
            query: Dict[str, Any] = {
                "$or": [
                    {"is_system": True},
                    {"user_id": user_id, "is_system": False},
                ]
            }
        else:
            query = {
                "$or": [
                    {"is_system": True},
                    {"user_id": user_id, "is_system": False, "space_id": None},
                    {"user_id": user_id, "is_system": False, "space_id": space_id},
                ]
            }

        cursor = templates_collection.find(query).sort([("is_system", -1), ("name", 1)])
        templates = await cursor.to_list(length=None)

        result: List[Template] = []
        for template in templates:
            template["_id"] = str(template["_id"])
            result.append(Template(**template))
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching templates: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching templates: {str(e)}")


async def update_template(template_id: str, updates: Dict[str, Any], user_id: str) -> Template:
    """Update a user-owned template."""
    try:
        object_id = _parse_template_id(template_id)

        existing = await templates_collection.find_one({"_id": object_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Template not found")

        if existing.get("is_system"):
            raise HTTPException(status_code=403, detail="System templates cannot be modified")

        if existing.get("user_id") != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to update this template")

        current_space_id = existing.get("space_id")
        if current_space_id and not await user_in_space(user_id, current_space_id):
            raise HTTPException(status_code=403, detail="Not in space")

        sanitized_updates = _sanitize_template_updates(updates)
        if not sanitized_updates:
            raise HTTPException(status_code=400, detail="No valid fields to update")

        updated_space_id = sanitized_updates.get("space_id", current_space_id)
        if updated_space_id and not await user_in_space(user_id, updated_space_id):
            raise HTTPException(status_code=403, detail="Not in space")

        await templates_collection.update_one({"_id": object_id}, {"$set": sanitized_updates})

        updated = await templates_collection.find_one({"_id": object_id})
        if not updated:
            raise HTTPException(status_code=404, detail="Template not found")

        updated["_id"] = str(updated["_id"])
        return Template(**updated)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating template: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating template: {str(e)}")


async def delete_template(template_id: str, user_id: str) -> Dict[str, str]:
    """Delete a user-owned template."""
    try:
        object_id = _parse_template_id(template_id)

        existing = await templates_collection.find_one({"_id": object_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Template not found")

        if existing.get("is_system"):
            raise HTTPException(status_code=403, detail="System templates cannot be deleted")

        if existing.get("user_id") != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to delete this template")

        template_space_id = existing.get("space_id")
        if template_space_id and not await user_in_space(user_id, template_space_id):
            raise HTTPException(status_code=403, detail="Not in space")

        result = await templates_collection.delete_one({"_id": object_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Template not found")

        return {"message": "Template deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting template: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting template: {str(e)}")
