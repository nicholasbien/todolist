"""
Tests for portfolio endpoints.
"""

import pytest
from tests.conftest import get_token


@pytest.mark.asyncio
async def test_portfolio_summary_empty(client, test_email):
    """Test portfolio summary with no holdings returns empty data."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.get("/portfolio/summary", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_value"] == 0
    assert data["total_cost_basis"] == 0
    assert data["total_gain_loss"] == 0
    assert data["sources"] == {}
    assert data["holdings"] == []
    assert data["top_contributors_30d"] == []
    assert data["top_contributors_ytd"] == []


@pytest.mark.asyncio
async def test_portfolio_sources_empty(client, test_email):
    """Test sources endpoint returns empty list when no holdings."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.get("/portfolio/sources", headers=headers)
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_create_and_get_holding(client, test_email):
    """Test creating a holding and retrieving it."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    holding_data = {
        "symbol": "AAPL",
        "name": "Apple Inc.",
        "source": "Robinhood",
        "quantity": 10,
        "cost_basis": 1500.0,
        "current_price": 175.50,
        "price_30d_ago": 170.0,
        "price_ytd_start": 155.0,
        "asset_type": "stock",
    }

    # Create holding
    resp = await client.post("/portfolio/holdings", json=holding_data, headers=headers)
    assert resp.status_code == 200
    created = resp.json()
    assert created["symbol"] == "AAPL"
    assert created["source"] == "Robinhood"
    assert "_id" in created

    # Get holdings
    resp = await client.get("/portfolio/holdings", headers=headers)
    assert resp.status_code == 200
    holdings = resp.json()
    assert len(holdings) == 1
    assert holdings[0]["symbol"] == "AAPL"


@pytest.mark.asyncio
async def test_portfolio_summary_with_holdings(client, test_email):
    """Test portfolio summary computes correct values."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    # Create two holdings in different sources
    await client.post("/portfolio/holdings", json={
        "symbol": "AAPL",
        "name": "Apple Inc.",
        "source": "Robinhood",
        "quantity": 10,
        "cost_basis": 1500.0,
        "current_price": 175.50,
        "price_30d_ago": 170.0,
        "price_ytd_start": 155.0,
    }, headers=headers)

    await client.post("/portfolio/holdings", json={
        "symbol": "BTC",
        "name": "Bitcoin",
        "source": "Coinbase",
        "quantity": 0.5,
        "cost_basis": 20000.0,
        "current_price": 50000.0,
        "price_30d_ago": 45000.0,
        "price_ytd_start": 42000.0,
        "asset_type": "crypto",
    }, headers=headers)

    # Get summary
    resp = await client.get("/portfolio/summary", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    # AAPL: 10 * 175.50 = 1755, BTC: 0.5 * 50000 = 25000
    assert data["total_value"] == 26755.0
    assert data["total_cost_basis"] == 21500.0  # 1500 + 20000
    assert data["total_gain_loss"] == 5255.0  # 26755 - 21500
    assert "Robinhood" in data["sources"]
    assert "Coinbase" in data["sources"]
    assert data["sources"]["Robinhood"]["total_value"] == 1755.0
    assert data["sources"]["Coinbase"]["total_value"] == 25000.0

    # Check contributors
    assert len(data["top_contributors_30d"]) == 2
    assert len(data["top_contributors_ytd"]) == 2


@pytest.mark.asyncio
async def test_portfolio_filter_by_source(client, test_email):
    """Test filtering portfolio by source."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    await client.post("/portfolio/holdings", json={
        "symbol": "AAPL",
        "name": "Apple Inc.",
        "source": "Robinhood",
        "quantity": 10,
        "cost_basis": 1500.0,
        "current_price": 175.50,
    }, headers=headers)

    await client.post("/portfolio/holdings", json={
        "symbol": "BTC",
        "name": "Bitcoin",
        "source": "Coinbase",
        "quantity": 0.5,
        "cost_basis": 20000.0,
        "current_price": 50000.0,
        "asset_type": "crypto",
    }, headers=headers)

    # Filter by Robinhood
    resp = await client.get("/portfolio/holdings?source=Robinhood", headers=headers)
    assert resp.status_code == 200
    holdings = resp.json()
    assert len(holdings) == 1
    assert holdings[0]["symbol"] == "AAPL"

    # Filter summary by Coinbase
    resp = await client.get("/portfolio/summary?source=Coinbase", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_value"] == 25000.0
    assert len(data["holdings"]) == 1


@pytest.mark.asyncio
async def test_portfolio_sources_list(client, test_email):
    """Test getting distinct sources."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    await client.post("/portfolio/holdings", json={
        "symbol": "AAPL",
        "name": "Apple Inc.",
        "source": "Robinhood",
        "quantity": 10,
        "cost_basis": 1500.0,
        "current_price": 175.50,
    }, headers=headers)

    await client.post("/portfolio/holdings", json={
        "symbol": "BTC",
        "name": "Bitcoin",
        "source": "Coinbase",
        "quantity": 0.5,
        "cost_basis": 20000.0,
        "current_price": 50000.0,
    }, headers=headers)

    resp = await client.get("/portfolio/sources", headers=headers)
    assert resp.status_code == 200
    sources = resp.json()
    assert "Coinbase" in sources
    assert "Robinhood" in sources


@pytest.mark.asyncio
async def test_delete_holding(client, test_email):
    """Test deleting a holding."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post("/portfolio/holdings", json={
        "symbol": "AAPL",
        "name": "Apple Inc.",
        "source": "Robinhood",
        "quantity": 10,
        "cost_basis": 1500.0,
        "current_price": 175.50,
    }, headers=headers)
    holding_id = resp.json()["_id"]

    # Delete
    resp = await client.delete(f"/portfolio/holdings/{holding_id}", headers=headers)
    assert resp.status_code == 200

    # Verify empty
    resp = await client.get("/portfolio/holdings", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 0


@pytest.mark.asyncio
async def test_upsert_holding(client, test_email):
    """Test that creating same symbol+source updates existing."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    await client.post("/portfolio/holdings", json={
        "symbol": "AAPL",
        "name": "Apple Inc.",
        "source": "Robinhood",
        "quantity": 10,
        "cost_basis": 1500.0,
        "current_price": 175.50,
    }, headers=headers)

    # Create again with updated values
    await client.post("/portfolio/holdings", json={
        "symbol": "AAPL",
        "name": "Apple Inc.",
        "source": "Robinhood",
        "quantity": 15,
        "cost_basis": 2250.0,
        "current_price": 180.0,
    }, headers=headers)

    # Should still be just 1 holding
    resp = await client.get("/portfolio/holdings", headers=headers)
    assert resp.status_code == 200
    holdings = resp.json()
    assert len(holdings) == 1
    assert holdings[0]["quantity"] == 15
    assert holdings[0]["current_price"] == 180.0


@pytest.mark.asyncio
async def test_create_transaction(client, test_email):
    """Test creating and retrieving transactions."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post("/portfolio/transactions", json={
        "symbol": "AAPL",
        "source": "Robinhood",
        "transaction_type": "buy",
        "quantity": 10,
        "price": 150.0,
    }, headers=headers)
    assert resp.status_code == 200
    txn = resp.json()
    assert txn["symbol"] == "AAPL"
    assert txn["total"] == 1500.0

    # Get transactions
    resp = await client.get("/portfolio/transactions", headers=headers)
    assert resp.status_code == 200
    txns = resp.json()
    assert len(txns) == 1


@pytest.mark.asyncio
async def test_portfolio_requires_auth(client):
    """Test that portfolio endpoints require authentication."""
    resp = await client.get("/portfolio/summary")
    assert resp.status_code == 401

    resp = await client.get("/portfolio/holdings")
    assert resp.status_code == 401

    resp = await client.get("/portfolio/sources")
    assert resp.status_code == 401
