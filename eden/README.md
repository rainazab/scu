# EDEN Rebuild Plan

This repo is being rebuilt from the original CalHacks code in short phases so each phase can be committed independently.

## Phase 1A
- Create `eden/eden_db` from `pizza_db`
- Rebrand core database + API terms (`pizza_*` -> `shelter_*`)
- Ship nearest-shelter geospatial endpoints:
  - `GET /api/shelters/nearest`
  - `POST /api/shelters/nearest`
  - `GET /api/shelters`
  - `GET /api/shelters/:id`
- Add shelter-focused schema fields (`available_beds`, `accepts_children`, etc.)

## Phase 1B
- Removed pizza/deals and Google Sheets docs from `eden_db`
- Added DV shelter seed data at `eden_db/data/shelters_seed.csv`
- Updated importer to load shelter records from DV seed format
- Updated setup/dev docs and scripts to shelter endpoints

## Phase 2A
- Added in-memory outbound call job queue and job status endpoints
- Added Twilio call-initiation skeleton with `dry_run` default
- Added webhook endpoints for call status and transcript snippets

## Phase 2B
- Added AI/fallback call script generation for shelter outreach
- Added transcript parsing into structured availability/intake fields
- Added script preview and transcript parsing endpoints for fast iteration

## Phase 3A
- Added warm transfer orchestration endpoints with dry-run/live support
- Added Twilio conference-bridge skeleton for survivor+shelter connection
- Added dashboard endpoints for shelter/call/transfer operations metrics

## Phase 4A
- Added no-call-back deny list API and enforcement on call/warm-transfer actions
- Added anonymous mode redaction + callback suppression options
- Added escalation policy enforcement for high-risk live operations
- Added safety dashboard signals and escalation event logging

## Phase 5A
- Added Postgres persistence for call jobs and warm transfer sessions
- Added persisted escalation events and blocked numbers
- Added startup bootstrap to load persisted safety state into runtime
- Added persistence schema for operational state tables

## Phase 6A (current)
- Added intake experience end-to-end:
  - `POST /api/intake`
  - `GET /api/intake/status/:job_id`
  - static mobile UI at `intake/index.html`
- Added demo hardening:
  - dry-run staged progression (fail/fail/found)
  - `POST /api/demo/reset`
- Added Twilio recording webhook path and call recording flag gating
- Added SMS delivery helper for found/no-result outcomes
- Added static ops dashboard at `dashboard/index.html`
- Added local container setup:
  - `docker-compose.yml`
  - `eden_db/Dockerfile`
  - `START.md`

## Suggested Commit Sequence
- `phase-6a-recording-and-sms`: `src/twilio_client.ts`, recording webhook in `src/index.ts`, `env.template`
- `phase-6a-intake-api`: intake endpoints and demo reset in `src/index.ts`, updates to `src/call_jobs.ts` and `src/warm_transfer.ts`
- `phase-6a-seed-data`: `data/shelters_seed.csv` replacement
- `phase-6a-intake-ui`: `intake/index.html`
- `phase-6a-dashboard-ui`: `dashboard/index.html`
- `phase-6a-devops`: `docker-compose.yml`, `eden_db/Dockerfile`, `START.md`, docs updates

## Next Short Phases
- **Phase 6B:** auth/role controls for admin/safety endpoints + API key middleware