# Eden DB Development Guide

## Scope
Phase 2A adds an outbound call queue skeleton and Twilio webhook handling in addition to the shelter geospatial API.
Phase 2B adds AI-assisted call script generation and transcript parsing with a deterministic fallback.
Phase 3A adds warm transfer orchestration and dashboard endpoints for operations visibility.

## Local Development
```bash
cp env.template .env
npm install
pip3 install psycopg2-binary
./setup.sh
npm run dev
```

## Schema
`init_db.sql` creates:
- `shelters` table
- PostGIS extension + spatial index
- shelter-specific availability fields

## Seed Data
- File: `data/shelters_seed.csv`
- Importer: `import_data.py`
- Manual import:
```bash
python3 import_data.py
```

## API Endpoints
- `GET /health`
- `GET /api/shelters/nearest`
- `POST /api/shelters/nearest`
- `GET /api/shelters`
- `GET /api/shelters/:id`
- `POST /api/calls/jobs`
- `POST /api/calls/script-preview`
- `GET /api/calls/jobs`
- `GET /api/calls/jobs/:job_id`
- `POST /api/calls/parse-transcript`
- `POST /api/warm-transfers`
- `GET /api/warm-transfers`
- `GET /api/warm-transfers/:transfer_id`
- `POST /webhooks/twilio/status`
- `POST /webhooks/twilio/transcript`
- `POST /webhooks/twilio/warm-transfer-status`
- `GET /api/dashboard/overview`
- `GET /api/dashboard/activity`

## Notes
- `analytics_benchmarks` remains for benchmarking experiments only.
- Default mode is `EDEN_CALL_MODE=dry_run` to avoid accidental outbound calls.
- Twilio live calls require `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER`.
- Optional `TWILIO_WARM_TRANSFER_STATUS_CALLBACK_URL` can route transfer-leg status updates separately.
- AI features use `OPENAI_API_KEY` when configured; otherwise fallback logic remains active.
- Warm transfers are conference-bridge based. In dry-run mode, transfers are simulated.
