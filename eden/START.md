# Eden Quick Start

```bash
cd /Users/rainazab/Desktop/scu/eden
docker-compose up -d
cd eden_db && npm run init-db && npm run import-data
```

Verify:
- `http://localhost:3000/health`
- Open `intake/index.html` in browser

Demo command:

```bash
curl -X POST "http://localhost:3000/api/intake" \
  -H "Content-Type: application/json" \
  -d '{
    "needs": ["shelter"],
    "people_count": 1,
    "has_children": false,
    "has_pets": false,
    "location": "SoMa, San Francisco",
    "notes": "urgent",
    "callback_number": "+1YOUR_PHONE_HERE"
  }'
```
