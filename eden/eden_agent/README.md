# Eden Agent

`eden_agent` is the first milestone for **Eden**, an assistant that helps contact domestic violence shelters.

This project focuses on a safe, testable foundation for shelter outreach:

- Load and validate shelter directory data
- Search shelters by state, city, and language
- Generate a prioritized call plan
- Expose API endpoints for later UI + telephony integration

No outbound phone calls are made yet.

## Roadmap

### Stage 1 (this commit)
- Base project structure
- Shelter directory API
- Rule-based call planner (`/agent/next-calls`)

### Stage 2 (this commit)
- LLM-backed call script generation with safe fallback
- Safety constraints + escalation policy checks
- In-memory session state tracking

### Stage 3
- Integrate phone provider (e.g., Twilio) for automated outbound calls
- Add call status webhooks and retries
- Add human handoff + audit logs

## Quick Start

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn src.eden_agent.main:app --reload --port 8080
```

Open:
- `http://localhost:8080/health`
- `http://localhost:8080/docs`

## Notes

- Sample data is in `data/shelters.sample.json`.
- Configure `.env` from `.env.example`.
- If `EDEN_OPENAI_API_KEY` is not set, script generation uses a deterministic fallback template.

## Stage 2 Endpoints

- `POST /agent/session/start`
- `GET /agent/session/{session_id}`
- `POST /agent/session/{session_id}/events`
- `POST /agent/generate-script`

### Example Flow

1) Start a session:

```bash
curl -X POST http://localhost:8080/agent/session/start \
  -H "Content-Type: application/json" \
  -d '{"caller_name":"Ana","organization":"Eden","notes":"Family with 1 child needs rapid placement"}'
```

2) Build call plan:

```bash
curl -X POST http://localhost:8080/agent/next-calls \
  -H "Content-Type: application/json" \
  -d '{"state":"CA","needs_child_support":true,"max_calls":3}'
```

3) Generate a script:

```bash
curl -X POST http://localhost:8080/agent/generate-script \
  -H "Content-Type: application/json" \
  -d '{"session_id":"<SESSION_ID>","shelter_id":"sf-safe-harbor","survivor_needs":"Needs multilingual intake and safe same-day placement"}'
```
