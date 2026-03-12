# Openclaw Agent Responsiveness Metrics

This document describes how responsiveness metrics are persisted and how to query summaries.

## Scope

Metrics are currently computed for `agent_id=openclaw` only.

## Persisted State

Session documents (`chat_sessions`) now store an `openclaw_metrics` object:

- `first_user_message_at`
- `first_agent_response_at`
- `first_final_agent_response_at`
- `current_pending_started_at`
- `last_user_message_at`
- `last_agent_response_at`
- `postbacks_expected`
- `postbacks_completed`
- `updated_at`

This state is updated in `append_message()`.

## Persisted Events

Latency and completeness units are persisted to `agent_responsiveness_events`:

- `metric_name = time_to_first_agent_response_ms`
- `metric_name = time_to_final_agent_response_ms`
- `metric_name = followup_response_latency_ms`
- `metric_name = postback_expected`
- `metric_name = postback_completed`

Each event includes `user_id`, `space_id`, `session_id`, `agent_id`, `metric_value`, and `created_at`.

Pending queue snapshots are persisted to `agent_backlog_snapshots` (deduplicated per minute):

- `pending_backlog_count`
- `snapshot_minute`
- `user_id`, `space_id`, `agent_id`

Snapshots are recorded when `GET /agent/sessions/pending?agent_id=openclaw` is called.

## Metric Formulas

For a session handled by openclaw:

- `time_to_first_agent_response_ms = first_agent_response_at - first_user_message_at`
- `time_to_final_agent_response_ms = first_final_agent_response_at - first_user_message_at`
- `followup_response_latency_ms = final_followup_reply_at - current_pending_started_at`
- `postback_completeness = postback_completed_count / postback_expected_count`

Backlog metric:

- `pending_backlog_count` is the pending-session count captured at each snapshot.

## Summary Endpoint

`GET /agent/metrics/responsiveness`

### Query Params

- `agent_id` (default: `openclaw`, only supported value)
- `space_id` (optional)
- `days` (daily window length, default `7`, max `30`)
- `first_response_sla_ms` (default `300000`)
- `final_response_sla_ms` (default `900000`)
- `followup_response_sla_ms` (default `600000`)
- `pending_backlog_sla_count` (default `5`)
- `postback_completeness_sla_ratio` (default `0.95`)

### Response Shape

- `daily`: one row per day with counts, `p50/p90/p95`, and SLA breach counts
- `rolling_7d`: aggregate summary over the last 7 days

## Example Usage

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/agent/metrics/responsiveness?agent_id=openclaw&days=7&first_response_sla_ms=180000"
```

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/agent/metrics/responsiveness?agent_id=openclaw&space_id=<space_id>&pending_backlog_sla_count=3"
```
