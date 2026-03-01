# Eden

Eden is an intake + shelter-calling system focused on urgent DV and immigrant-support shelter matching.

It combines:
- geospatial shelter search (`Postgres` + `PostGIS`)
- API-driven intake triage and call orchestration (`Node` + `Express` + `TypeScript`)
- outbound call execution (`Twilio`)
- optional higher-quality voice playback (`ElevenLabs` TTS via Twilio `<Play>`)

## Current Product Behavior

- Intake runs from `intake/index.html` as a **4-step** flow:
  - Situation now (includes immediate safety gate)
  - Group triage (gender/age/children/pregnancy/sobriety)
  - Location + context (language, accessibility, alternate contact)
  - Confirm + start search
- Intake does **not require SMS/texting** to function.
- `POST /api/intake` returns quickly with `job_id`; call setup continues asynchronously.
- `GET /api/intake/status/:job_id` powers the live progress feed.
- Matching is triage-aware with simple eligibility filtering/prioritization (language, sobriety constraints, demographic fit).
- Supports both:
  - `dry_run` demo progression
  - `live` Twilio calling mode

## Key Endpoints

- `GET /health`
- `GET /api/shelters/nearest`
- `GET /api/shelters`
- `GET /api/shelters/:id`
- `POST /api/intake`
- `GET /api/intake/status/:job_id`
- `POST /api/calls/jobs`
- `GET /api/calls/jobs`
- `GET /api/calls/jobs/:job_id`
- `POST /webhooks/twilio/status`
- `POST /webhooks/twilio/recording`
- `POST /api/demo/reset`

## Data

- Shelter seed source: `eden_db/data/shelters_seed.csv`
- Primary table: `shelters` (schema in `eden_db/init_db.sql`)

To reload shelter data:

```bash
cd eden/eden_db
npm run init-db
npm run import-data
```

## Voice Configuration

Twilio is the call transport.

For more natural speech in live mode, set:
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_VOICE_ID`
- `ELEVENLABS_MODEL_ID`
- `NGROK_URL` (public URL Twilio can reach for generated audio)

If ElevenLabs is unavailable, Eden falls back to Twilio Polly `<Say>`.

## Run Notes

- Main backend lives in `eden/eden_db`
- Quick local run instructions: `eden/START.md`
- Keep `ngrok` running in live mode so Twilio can hit webhook/audio endpoints

## Next Phase

- Admin/auth hardening for safety and operations endpoints (role/API key controls)