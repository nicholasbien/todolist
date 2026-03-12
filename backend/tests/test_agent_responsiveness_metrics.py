"""Tests for openclaw agent responsiveness metrics."""

from bson import ObjectId
import pytest

import chat_sessions
from chat_sessions import (
    _distribution_summary,
    _postback_summary,
    append_message,
    create_session,
)
from tests.conftest import get_token


def test_distribution_and_postback_summaries():
    """Distribution and completeness summaries should include counts, percentiles, and SLA breaches."""
    distribution = _distribution_summary(
        [100, 200, 300, 400, 500], breach_threshold=300
    )
    assert distribution == {
        "count": 5,
        "p50": 300,
        "p90": 500,
        "p95": 500,
        "sla_breach_count": 2,
    }

    postback = _postback_summary(
        expected_count=10,
        completed_count=8,
        min_completeness_ratio=0.9,
    )
    assert postback["expected_count"] == 10
    assert postback["completed_count"] == 8
    assert postback["incomplete_count"] == 2
    assert postback["completeness_ratio"] == 0.8
    assert postback["sla_breach_count"] == 1


@pytest.mark.asyncio
async def test_append_message_records_openclaw_metrics_state_and_events(client):
    """Openclaw sessions should persist per-session state and event rows for responsiveness metrics."""
    user_id = "metrics_user"
    space_id = "metrics_space"
    session_id = await create_session(
        user_id,
        space_id,
        "Metrics test",
        todo_id="todo_metrics",
        agent_id="openclaw",
    )

    await append_message(session_id, user_id, "user", "First request")
    await append_message(
        session_id,
        user_id,
        "assistant",
        "Working on this",
        agent_id="openclaw",
        interim=True,
    )
    await append_message(
        session_id,
        user_id,
        "assistant",
        "Final response",
        agent_id="openclaw",
    )

    await append_message(session_id, user_id, "user", "Follow-up request")
    await append_message(
        session_id,
        user_id,
        "assistant",
        "Follow-up final response",
        agent_id="openclaw",
    )

    session_doc = await chat_sessions.sessions_collection.find_one(
        {"_id": ObjectId(session_id)}
    )
    assert session_doc is not None
    metrics = session_doc.get("openclaw_metrics")
    assert metrics is not None
    assert metrics["first_user_message_at"] is not None
    assert metrics["first_agent_response_at"] is not None
    assert metrics["first_final_agent_response_at"] is not None
    assert metrics["postbacks_expected"] == 2
    assert metrics["postbacks_completed"] == 2

    events = await chat_sessions.agent_responsiveness_events_collection.find(
        {"session_id": session_id}
    ).to_list(length=50)
    metric_names = [event["metric_name"] for event in events]

    assert metric_names.count("time_to_first_agent_response_ms") == 1
    assert metric_names.count("time_to_final_agent_response_ms") == 1
    assert metric_names.count("followup_response_latency_ms") == 1
    assert metric_names.count("postback_expected") == 2
    assert metric_names.count("postback_completed") == 2


@pytest.mark.asyncio
async def test_responsiveness_metrics_endpoint_daily_and_rolling(client, test_email):
    """Metrics endpoint should return daily rows and a rolling-7d summary for openclaw."""
    token = await get_token(client, test_email)
    headers = {"Authorization": f"Bearer {token}"}

    create_resp = await client.post(
        "/agent/sessions",
        json={
            "space_id": "metrics_space_api",
            "title": "Openclaw metrics endpoint",
            "agent_id": "openclaw",
            "initial_role": "user",
            "initial_message": "Please handle this task",
        },
        headers=headers,
    )
    assert create_resp.status_code == 200
    session_id = create_resp.json()["session_id"]

    pending_resp = await client.get(
        "/agent/sessions/pending",
        params={"space_id": "metrics_space_api", "agent_id": "openclaw"},
        headers=headers,
    )
    assert pending_resp.status_code == 200

    first_reply = await client.post(
        f"/agent/sessions/{session_id}/messages",
        json={"role": "assistant", "content": "Initial final", "agent_id": "openclaw"},
        headers=headers,
    )
    assert first_reply.status_code == 200

    followup_user = await client.post(
        f"/agent/sessions/{session_id}/messages",
        json={"role": "user", "content": "One more thing"},
        headers=headers,
    )
    assert followup_user.status_code == 200

    pending_followup = await client.get(
        "/agent/sessions/pending",
        params={"space_id": "metrics_space_api", "agent_id": "openclaw"},
        headers=headers,
    )
    assert pending_followup.status_code == 200

    followup_reply = await client.post(
        f"/agent/sessions/{session_id}/messages",
        json={
            "role": "assistant",
            "content": "Follow-up final",
            "agent_id": "openclaw",
        },
        headers=headers,
    )
    assert followup_reply.status_code == 200

    metrics_resp = await client.get(
        "/agent/metrics/responsiveness",
        params={"space_id": "metrics_space_api", "agent_id": "openclaw", "days": 7},
        headers=headers,
    )
    assert metrics_resp.status_code == 200

    payload = metrics_resp.json()
    assert payload["agent_id"] == "openclaw"
    assert len(payload["daily"]) == 7

    rolling = payload["rolling_7d"]
    assert rolling["time_to_first_agent_response_ms"]["count"] >= 1
    assert rolling["time_to_final_agent_response_ms"]["count"] >= 1
    assert rolling["followup_response_latency_ms"]["count"] >= 1
    assert rolling["pending_backlog_count"]["count"] >= 1
    assert rolling["postback_completeness"]["expected_count"] >= 2
    assert rolling["postback_completeness"]["completed_count"] >= 2
