# API Examples

## Server Running Successfully! 🍕

Your Pizza Finder API is now running on `http://localhost:3000`

## Quick Test Results

### 1. Health Check ✅
```bash
curl "http://localhost:3000/health"
```

**Response:**
```json
{
    "status": "ok",
    "message": "Pizza Finder API is running"
}
```

### 2. Find Nearest Pizza Locations ✅

**Request:**
```bash
curl "http://localhost:3000/api/nearest?lat=37.7749&lon=-122.4194&limit=3"
```

**Response Example:**
```json
{
    "success": true,
    "query": {
        "latitude": 37.7749,
        "longitude": -122.4194,
        "limit": 3,
        "max_distance_miles": null
    },
    "count": 3,
    "locations": [
        {
            "id": 114,
            "name": "Baiano Pizzeria",
            "address": "100 Gough St, San Francisco, CA 94102",
            "coordinates": {
                "latitude": 37.7741,
                "longitude": -122.4224
            },
            "phone_number": "+1 (415) 621-1401",
            "cheese_pizza_price": 20.7,
            "shop_rating": 4.1,
            "distance": {
                "meters": 279,
                "miles": "0.17",
                "kilometers": "0.28"
            }
        },
        {
            "id": 96,
            "name": "Uncle Vito's Slice of NY",
            "address": "700 Bush St, San Francisco, CA 94108",
            "coordinates": {
                "latitude": 37.779,
                "longitude": -122.4199
            },
            "phone_number": "+1 (916) 382-4419",
            "cheese_pizza_price": 5.25,
            "shop_rating": 4.0,
            "distance": {
                "meters": 457,
                "miles": "0.28",
                "kilometers": "0.46"
            }
        }
    ]
}
```

## More Example Queries

### Find Pizza Within 1 Mile
```bash
curl "http://localhost:3000/api/nearest?lat=37.7749&lon=-122.4194&limit=10&max_distance_miles=1"
```

### Find Nearest to Golden Gate Park
```bash
curl "http://localhost:3000/api/nearest?lat=37.7694&lon=-122.4862&limit=5"
```

### Find Nearest to Mission District
```bash
curl "http://localhost:3000/api/nearest?lat=37.7599&lon=-122.4148&limit=5"
```

### Using POST Method
```bash
curl -X POST http://localhost:3000/api/nearest \
  -H "Content-Type: application/json" \
  -d '{
    "latitude": 37.7749,
    "longitude": -122.4194,
    "limit": 5,
    "max_distance_miles": 2
  }'
```

### Get All Locations (Paginated)
```bash
curl "http://localhost:3000/api/locations?page=1&limit=10"
```

### Get Specific Location by ID
```bash
curl "http://localhost:3000/api/locations/114"
```

## Using in Your Application

### JavaScript/TypeScript
```javascript
async function findNearestPizza(lat, lon, limit = 5) {
  const response = await fetch(
    `http://localhost:3000/api/nearest?lat=${lat}&lon=${lon}&limit=${limit}`
  );
  const data = await response.json();
  return data.locations;
}

// Usage
const pizzas = await findNearestPizza(37.7749, -122.4194);
console.log(`Found ${pizzas.length} nearby pizza places!`);
```

### Python
```python
import requests

def find_nearest_pizza(lat, lon, limit=5):
    url = "http://localhost:3000/api/nearest"
    params = {"lat": lat, "lon": lon, "limit": limit}
    response = requests.get(url, params=params)
    return response.json()["locations"]

# Usage
pizzas = find_nearest_pizza(37.7749, -122.4194)
print(f"Found {len(pizzas)} nearby pizza places!")
```

### cURL Script
```bash
#!/bin/bash

LAT=37.7749
LON=-122.4194
LIMIT=5

curl -s "http://localhost:3000/api/nearest?lat=${LAT}&lon=${LON}&limit=${LIMIT}" \
  | jq '.locations[] | {name, distance: .distance.miles, rating: .shop_rating}'
```

## Database Statistics

- **Total Pizza Locations:** 90
- **Locations with Coordinates:** 68
- **Database:** PostgreSQL with PostGIS
- **Spatial Index:** Enabled for fast geospatial queries

## Common San Francisco Coordinates

| Location | Latitude | Longitude |
|----------|----------|-----------|
| Downtown SF | 37.7749 | -122.4194 |
| Golden Gate Park | 37.7694 | -122.4862 |
| Mission District | 37.7599 | -122.4148 |
| Fisherman's Wharf | 37.8080 | -122.4177 |
| Castro District | 37.7609 | -122.4350 |
| North Beach | 37.8008 | -122.4098 |
| Haight-Ashbury | 37.7695 | -122.4481 |
| SOMA | 37.7749 | -122.3922 |

## Server Management

### Start Server (Development)
```bash
npm run dev
```

### Start Server (Production)
```bash
npm start
```

### Stop Server
```bash
# Find the process
lsof -ti:3000 | xargs kill

# Or if using npm run dev in foreground, just Ctrl+C
```

### Rebuild After Changes
```bash
npm run build
```

## Troubleshooting

### Server Not Starting
```bash
# Check if port 3000 is already in use
lsof -i :3000

# Use a different port
PORT=3001 npm run dev
```

### Database Connection Issues
```bash
# Check PostgreSQL is running
pg_isready

# Restart PostgreSQL
brew services restart postgresql
```

### No Results Returned
- Verify coordinates are valid (lat: -90 to 90, lon: -180 to 180)
- Check that you have data in the database
- Try increasing the max_distance_miles parameter

## Next Steps

1. **Add Authentication:** Protect your endpoints with JWT or API keys
2. **Add Caching:** Use Redis to cache frequent queries
3. **Add Rate Limiting:** Prevent API abuse
4. **Deploy:** Deploy to cloud services (Heroku, AWS, DigitalOcean)
5. **Build Frontend:** Create a web interface with a map

---

**API Documentation:** See [README.md](README.md) for complete API documentation
**Quick Start:** See [QUICKSTART.md](QUICKSTART.md) for setup instructions


