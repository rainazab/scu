# Eden DB Summary

`eden_db` is the geospatial backend for Eden's domestic violence shelter access workflow.

## Included in Phase 1B
- PostGIS schema for `shelters`
- Seed importer for `data/shelters_seed.csv`
- Nearest shelter endpoints
- Pagination + single shelter lookup

## Core Table
- `shelters`
  - `shelter_name`, `address`, `city`, `state`, `zipcode`
  - `intake_phone`, `bed_count`, `available_beds`
  - `accepts_children`, `accepts_pets`, `languages_spoken`
  - `last_verified_at`
  - `coordinates` (`GEOGRAPHY(POINT, 4326)`), `latitude`, `longitude`

## API Endpoints
- `GET /health`
- `GET /api/shelters/nearest?lat=...&lon=...`
- `POST /api/shelters/nearest`
- `GET /api/shelters`
- `GET /api/shelters/:id`


