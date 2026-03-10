"""
Portfolio management module.

Stores investment holdings with source tracking (Robinhood, Coinbase, etc.)
and computes portfolio metrics including top contributors to performance.
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from bson import ObjectId
from db import db
from fastapi import HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# MongoDB collections
holdings_collection = db.holdings
transactions_collection = db.transactions


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class Holding(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    user_id: str
    symbol: str
    name: str
    source: str  # e.g. "Robinhood", "Coinbase"
    quantity: float
    cost_basis: float  # total cost basis (quantity * avg purchase price)
    current_price: float = 0.0
    previous_close: float = 0.0
    price_30d_ago: float = 0.0
    price_ytd_start: float = 0.0
    asset_type: str = "stock"  # "stock", "crypto", "etf"
    last_updated: Optional[str] = None

    class Config:
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
        populate_by_name = True


class HoldingCreate(BaseModel):
    symbol: str
    name: str
    source: str
    quantity: float
    cost_basis: float
    current_price: float = 0.0
    previous_close: float = 0.0
    price_30d_ago: float = 0.0
    price_ytd_start: float = 0.0
    asset_type: str = "stock"


class HoldingUpdate(BaseModel):
    symbol: Optional[str] = None
    name: Optional[str] = None
    source: Optional[str] = None
    quantity: Optional[float] = None
    cost_basis: Optional[float] = None
    current_price: Optional[float] = None
    previous_close: Optional[float] = None
    price_30d_ago: Optional[float] = None
    price_ytd_start: Optional[float] = None
    asset_type: Optional[str] = None


class Transaction(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    user_id: str
    symbol: str
    source: str
    transaction_type: str  # "buy", "sell"
    quantity: float
    price: float
    total: float
    date: str
    asset_type: str = "stock"

    class Config:
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
        populate_by_name = True


class TransactionCreate(BaseModel):
    symbol: str
    source: str
    transaction_type: str
    quantity: float
    price: float
    date: Optional[str] = None
    asset_type: str = "stock"


# ---------------------------------------------------------------------------
# Database initialization
# ---------------------------------------------------------------------------

async def init_portfolio_indexes() -> None:
    """Create indexes for portfolio queries."""
    try:
        await holdings_collection.create_index("user_id")
        await holdings_collection.create_index([("user_id", 1), ("source", 1)])
        await holdings_collection.create_index(
            [("user_id", 1), ("symbol", 1), ("source", 1)], unique=True
        )
        await transactions_collection.create_index("user_id")
        await transactions_collection.create_index([("user_id", 1), ("date", -1)])
        logger.info("Portfolio indexes created successfully")
    except Exception as e:
        logger.error(f"Error creating portfolio indexes: {e}")


# ---------------------------------------------------------------------------
# Holdings CRUD
# ---------------------------------------------------------------------------

async def get_holdings(user_id: str, source: Optional[str] = None) -> List[dict]:
    """Get all holdings for a user, optionally filtered by source."""
    query: Dict = {"user_id": user_id}
    if source:
        query["source"] = source
    cursor = holdings_collection.find(query)
    results = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        results.append(doc)
    return results


async def create_holding(user_id: str, data: HoldingCreate) -> dict:
    """Create or update a holding (upserts on user_id + symbol + source)."""
    now = datetime.now().isoformat()
    doc = data.model_dump()
    doc["user_id"] = user_id
    doc["last_updated"] = now

    # Upsert: if same user+symbol+source exists, update it
    existing = await holdings_collection.find_one(
        {"user_id": user_id, "symbol": doc["symbol"], "source": doc["source"]}
    )
    if existing:
        await holdings_collection.update_one(
            {"_id": existing["_id"]},
            {"$set": doc},
        )
        doc["_id"] = str(existing["_id"])
    else:
        result = await holdings_collection.insert_one(doc)
        doc["_id"] = str(result.inserted_id)

    return doc


async def update_holding(user_id: str, holding_id: str, data: HoldingUpdate) -> dict:
    """Update specific fields of a holding."""
    update_fields = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    update_fields["last_updated"] = datetime.now().isoformat()

    result = await holdings_collection.update_one(
        {"_id": ObjectId(holding_id), "user_id": user_id},
        {"$set": update_fields},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Holding not found")

    updated = await holdings_collection.find_one({"_id": ObjectId(holding_id)})
    updated["_id"] = str(updated["_id"])
    return updated


async def delete_holding(user_id: str, holding_id: str) -> dict:
    """Delete a holding."""
    result = await holdings_collection.delete_one(
        {"_id": ObjectId(holding_id), "user_id": user_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Holding not found")
    return {"message": "Holding deleted"}


# ---------------------------------------------------------------------------
# Transactions CRUD
# ---------------------------------------------------------------------------

async def get_transactions(
    user_id: str, source: Optional[str] = None, days: Optional[int] = None
) -> List[dict]:
    """Get transactions, optionally filtered by source and time window."""
    query: Dict = {"user_id": user_id}
    if source:
        query["source"] = source
    if days:
        cutoff = (datetime.now() - timedelta(days=days)).isoformat()
        query["date"] = {"$gte": cutoff}
    cursor = transactions_collection.find(query).sort("date", -1)
    results = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        results.append(doc)
    return results


async def create_transaction(user_id: str, data: TransactionCreate) -> dict:
    """Record a transaction."""
    doc = data.model_dump()
    doc["user_id"] = user_id
    doc["total"] = round(data.quantity * data.price, 2)
    if not doc.get("date"):
        doc["date"] = datetime.now().isoformat()

    result = await transactions_collection.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


# ---------------------------------------------------------------------------
# Portfolio analytics
# ---------------------------------------------------------------------------

async def get_portfolio_summary(user_id: str, source: Optional[str] = None) -> dict:
    """
    Compute portfolio summary with values by source and top contributors.

    Returns:
    {
        "total_value": float,
        "total_cost_basis": float,
        "total_gain_loss": float,
        "total_gain_loss_pct": float,
        "sources": { "Robinhood": {...}, "Coinbase": {...} },
        "holdings": [...],
        "top_contributors_30d": [...],
        "top_contributors_ytd": [...]
    }
    """
    holdings = await get_holdings(user_id, source)

    # Group by source
    sources: Dict[str, dict] = {}
    all_contributors_30d = []
    all_contributors_ytd = []
    total_value = 0.0
    total_cost_basis = 0.0

    for h in holdings:
        src = h.get("source", "Unknown")
        current_price = h.get("current_price", 0)
        quantity = h.get("quantity", 0)
        cost_basis = h.get("cost_basis", 0)
        market_value = round(current_price * quantity, 2)
        gain_loss = round(market_value - cost_basis, 2)

        total_value += market_value
        total_cost_basis += cost_basis

        if src not in sources:
            sources[src] = {
                "source": src,
                "total_value": 0,
                "total_cost_basis": 0,
                "total_gain_loss": 0,
                "holdings_count": 0,
            }
        sources[src]["total_value"] = round(sources[src]["total_value"] + market_value, 2)
        sources[src]["total_cost_basis"] = round(sources[src]["total_cost_basis"] + cost_basis, 2)
        sources[src]["total_gain_loss"] = round(sources[src]["total_gain_loss"] + gain_loss, 2)
        sources[src]["holdings_count"] += 1

        # 30-day contribution
        price_30d_ago = h.get("price_30d_ago", 0)
        if price_30d_ago > 0 and quantity > 0:
            price_change_30d = round((current_price - price_30d_ago) * quantity, 2)
        else:
            price_change_30d = 0

        # YTD contribution
        price_ytd_start = h.get("price_ytd_start", 0)
        if price_ytd_start > 0 and quantity > 0:
            price_change_ytd = round((current_price - price_ytd_start) * quantity, 2)
        else:
            price_change_ytd = 0

        contributor_base = {
            "symbol": h.get("symbol", ""),
            "name": h.get("name", ""),
            "source": src,
            "quantity": quantity,
            "current_price": current_price,
            "market_value": market_value,
            "asset_type": h.get("asset_type", "stock"),
        }

        all_contributors_30d.append({
            **contributor_base,
            "gain_loss": price_change_30d,
            "gain_loss_pct": round(((current_price - price_30d_ago) / price_30d_ago * 100) if price_30d_ago > 0 else 0, 2),
            "change_type": "price_change",
        })

        all_contributors_ytd.append({
            **contributor_base,
            "gain_loss": price_change_ytd,
            "gain_loss_pct": round(((current_price - price_ytd_start) / price_ytd_start * 100) if price_ytd_start > 0 else 0, 2),
            "change_type": "price_change",
        })

    # Now check transactions for realized gains (trades) in the last 30 days and YTD
    now = datetime.now()
    ytd_start = datetime(now.year, 1, 1).isoformat()
    thirty_days_ago = (now - timedelta(days=30)).isoformat()

    # Get recent transactions for trade attribution
    txn_query: Dict = {"user_id": user_id}
    if source:
        txn_query["source"] = source
    txn_query["date"] = {"$gte": ytd_start}
    txn_cursor = transactions_collection.find(txn_query).sort("date", -1)

    trade_gains_30d: Dict[str, float] = {}
    trade_gains_ytd: Dict[str, float] = {}

    async for txn in txn_cursor:
        symbol = txn.get("symbol", "")
        txn_date = txn.get("date", "")
        txn_type = txn.get("transaction_type", "")

        # Only count sells as realized gains
        if txn_type == "sell":
            total = txn.get("total", 0)
            # Simplified: for realized gains, we track the sale proceeds
            # In a full implementation, you'd track cost basis per lot
            if txn_date >= thirty_days_ago:
                trade_gains_30d[symbol] = trade_gains_30d.get(symbol, 0) + total
            trade_gains_ytd[symbol] = trade_gains_ytd.get(symbol, 0) + total

    # Mark contributors that also have trade activity
    for c in all_contributors_30d:
        sym = c["symbol"]
        if sym in trade_gains_30d:
            c["has_trades"] = True
            c["trade_proceeds"] = trade_gains_30d[sym]
        else:
            c["has_trades"] = False
            c["trade_proceeds"] = 0

    for c in all_contributors_ytd:
        sym = c["symbol"]
        if sym in trade_gains_ytd:
            c["has_trades"] = True
            c["trade_proceeds"] = trade_gains_ytd[sym]
        else:
            c["has_trades"] = False
            c["trade_proceeds"] = 0

    # Add gain/loss percentage per source
    for src_data in sources.values():
        cb = src_data["total_cost_basis"]
        src_data["total_gain_loss_pct"] = round(
            (src_data["total_gain_loss"] / cb * 100) if cb > 0 else 0, 2
        )

    # Sort contributors by absolute gain/loss (top movers)
    top_30d = sorted(all_contributors_30d, key=lambda x: abs(x["gain_loss"]), reverse=True)[:10]
    top_ytd = sorted(all_contributors_ytd, key=lambda x: abs(x["gain_loss"]), reverse=True)[:10]

    # Enrich holdings for response
    enriched_holdings = []
    for h in holdings:
        current_price = h.get("current_price", 0)
        quantity = h.get("quantity", 0)
        cost_basis = h.get("cost_basis", 0)
        market_value = round(current_price * quantity, 2)
        gain_loss = round(market_value - cost_basis, 2)
        gain_loss_pct = round((gain_loss / cost_basis * 100) if cost_basis > 0 else 0, 2)

        enriched_holdings.append({
            **h,
            "market_value": market_value,
            "gain_loss": gain_loss,
            "gain_loss_pct": gain_loss_pct,
        })

    total_gain_loss = round(total_value - total_cost_basis, 2)

    return {
        "total_value": round(total_value, 2),
        "total_cost_basis": round(total_cost_basis, 2),
        "total_gain_loss": total_gain_loss,
        "total_gain_loss_pct": round(
            (total_gain_loss / total_cost_basis * 100) if total_cost_basis > 0 else 0, 2
        ),
        "sources": sources,
        "holdings": enriched_holdings,
        "top_contributors_30d": top_30d,
        "top_contributors_ytd": top_ytd,
    }


async def get_sources(user_id: str) -> List[str]:
    """Get distinct sources for a user's holdings."""
    sources = await holdings_collection.distinct("source", {"user_id": user_id})
    return sorted(sources)
