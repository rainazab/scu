# Eden Agent (Stage 1)

`eden_agent` is the first milestone for **Eden**, an assistant that helps contact domestic violence shelters.

This stage focuses on a safe, testable foundation:

- Load and validate shelter directory data
- Search shelters by state, city, and language
- Generate a prioritized call plan
- Expose API endpoints for later UI + telephony integration

No outbound phone calls are made in this stage.

## Roadmap

### Stage 1 (this commit)
- Base project structure
- Shelter directory API
- Rule-based call planner (`/agent/next-calls`)

### Stage 2
- Integrate LLM reasoning for call scripting and fallback responses
- Add safety constraints + escalation policy
- Track conversation state per outreach session

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
