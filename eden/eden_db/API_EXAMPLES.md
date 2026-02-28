# Eden Shelter API Examples

Base URL: `http://localhost:3000`

## Health
```bash
curl "http://localhost:3000/health"
```

## Nearest shelters (GET)
```bash
curl "http://localhost:3000/api/shelters/nearest?lat=37.7749&lon=-122.4194&limit=3"
```

## Nearest shelters (POST)
```bash
curl -X POST "http://localhost:3000/api/shelters/nearest" \
  -H "Content-Type: application/json" \
  -d '{
    "latitude": 37.7749,
    "longitude": -122.4194,
    "limit": 5,
    "max_distance_miles": 20
  }'
```

## List shelters (paginated)
```bash
curl "http://localhost:3000/api/shelters?page=1&limit=10"
```

## Get shelter by id
```bash
curl "http://localhost:3000/api/shelters/1"
```


