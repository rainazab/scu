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

## Phase 3A (current)
- Added warm transfer orchestration endpoints with dry-run/live support
- Added Twilio conference-bridge skeleton for survivor+shelter connection
- Added dashboard endpoints for shelter/call/transfer operations metrics

## Next Short Phases
- **Phase 4A:** Safety controls (anonymous mode, no-call-back list, escalation policies)
