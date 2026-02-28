# EDEN Rebuild Plan

This repo is being rebuilt from the original CalHacks code in short phases so each phase can be committed independently.

## Phase 1A (current)
- Create `eden/eden_db` from `pizza_db`
- Rebrand core database + API terms (`pizza_*` -> `shelter_*`)
- Ship nearest-shelter geospatial endpoints:
  - `GET /api/shelters/nearest`
  - `POST /api/shelters/nearest`
  - `GET /api/shelters`
  - `GET /api/shelters/:id`
- Add shelter-focused schema fields (`available_beds`, `accepts_children`, etc.)

## Next Short Phases
- **Phase 1B:** Replace sample pizza CSV with a DV shelter dataset and importer mapping
- **Phase 2A:** Add outbound call job queue + Twilio integration skeleton (no live calls)
- **Phase 2B:** Add AI call script generation + transcript parsing
- **Phase 3A:** Warm transfer flow + status dashboard endpoints
