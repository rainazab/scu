# Eden DB Development Guide

## Scope
Phase 2A adds an outbound call queue skeleton and Twilio webhook handling in addition to the shelter geospatial API.

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
- `GET /api/calls/jobs`
- `GET /api/calls/jobs/:job_id`
- `POST /webhooks/twilio/status`
- `POST /webhooks/twilio/transcript`

## Notes
- `analytics_benchmarks` remains for benchmarking experiments only.
- Default mode is `EDEN_CALL_MODE=dry_run` to avoid accidental outbound calls.
- Twilio live calls require `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER`.
