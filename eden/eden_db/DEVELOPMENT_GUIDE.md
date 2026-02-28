# Eden DB Development Guide

## Scope
Phase 1B converts the backend to a DV shelter geospatial API.

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

## Notes
- `analytics_benchmarks` remains for benchmarking experiments only.
- Twilio calling, transcript parsing, and warm transfer are later phases.
