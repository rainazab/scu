# Eden Shelter API Quickstart

## Prerequisites
- PostgreSQL + PostGIS
- Node.js 18+
- Python 3.10+

## Setup
```bash
cp env.template .env
npm install
pip3 install psycopg2-binary
./setup.sh
```

## Run
```bash
npm run dev
```

## Verify
```bash
curl http://localhost:3000/health
curl "http://localhost:3000/api/shelters/nearest?lat=37.7749&lon=-122.4194&limit=5"
```

## API Endpoints
- `GET /health`
- `GET /api/shelters/nearest?lat=X&lon=Y&limit=N`
- `POST /api/shelters/nearest`
- `GET /api/shelters?page=1&limit=20`
- `GET /api/shelters/:id`


