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

## Create call job (dry-run)
```bash
curl -X POST "http://localhost:3000/api/calls/jobs" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "dry_run",
    "shelter_ids": [1, 2, 3],
    "survivor_context": "Adult survivor with one child needs same-day intake options.",
    "callback_number": "+14155550199",
    "anonymous_mode": false
  }'
```

## Preview AI call script
```bash
curl -X POST "http://localhost:3000/api/calls/script-preview" \
  -H "Content-Type: application/json" \
  -d '{
    "shelter_name": "Safe Harbor SF",
    "survivor_context": "Adult survivor with one child needs same-day intake options.",
    "callback_number": "+14155550199"
  }'
```

## List call jobs
```bash
curl "http://localhost:3000/api/calls/jobs"
```

## Get call job by id
```bash
curl "http://localhost:3000/api/calls/jobs/<job_id>"
```

## Parse transcript into structured outcomes
```bash
curl -X POST "http://localhost:3000/api/calls/parse-transcript" \
  -H "Content-Type: application/json" \
  -d '{
    "transcript": "We have 2 beds available tonight. Please send ID and intake paperwork."
  }'
```

## Start intake request
```bash
curl -X POST "http://localhost:3000/api/intake" \
  -H "Content-Type: application/json" \
  -d '{
    "needs": ["shelter", "food"],
    "people_count": 2,
    "has_children": true,
    "has_pets": false,
    "location": "Mission District, SF",
    "notes": "need wheelchair access",
    "callback_number": "+14155550199"
  }'
```

## Poll intake status
```bash
curl "http://localhost:3000/api/intake/status/<job_id>"
```

## Start warm transfer (dry-run)
```bash
curl -X POST "http://localhost:3000/api/warm-transfers" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "dry_run",
    "job_id": "<job_id>",
    "attempt_id": "<attempt_id>",
    "survivor_phone": "+14155550199",
    "survivor_name": "Jane Doe",
    "anonymous_mode": true
  }'
```

## List warm transfers
```bash
curl "http://localhost:3000/api/warm-transfers"
```

## Dashboard overview
```bash
curl "http://localhost:3000/api/dashboard/overview"
```

## Dashboard activity
```bash
curl "http://localhost:3000/api/dashboard/activity"
```

## Safety: add blocked number
```bash
curl -X POST "http://localhost:3000/api/safety/no-callback-numbers" \
  -H "Content-Type: application/json" \
  -d '{"number":"+14155550199"}'
```

## Safety: list blocked numbers
```bash
curl "http://localhost:3000/api/safety/no-callback-numbers"
```

## Safety: list escalation events
```bash
curl "http://localhost:3000/api/safety/escalations"
```

## Reset demo state
```bash
curl -X POST "http://localhost:3000/api/demo/reset"
```


