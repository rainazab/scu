# Quick Start Guide

Get up and running with the Pizza Finder API in 5 minutes!

## Prerequisites

1. **PostgreSQL with PostGIS** installed and running
2. **Node.js** (v18+) and npm installed
3. **Python 3** installed

## Quick Setup (Automated)

### Option 1: Using the Setup Script (Recommended)

```bash
# 1. Create a .env file (copy from template)
cp env.template .env

# 2. Edit .env with your PostgreSQL credentials
nano .env

# 3. Run the automated setup script
./setup.sh
```

### Option 2: Manual Setup

```bash
# 1. Copy environment template
cp env.template .env

# 2. Edit .env with your credentials
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=pizza_db
# DB_USER=postgres
# DB_PASSWORD=your_password
# PORT=3000

# 3. Install Node dependencies
npm install

# 4. Install Python dependencies
pip3 install psycopg2-binary

# 5. Create database
psql -U postgres -c "CREATE DATABASE pizza_db;"

# 6. Initialize schema
psql -U postgres -d pizza_db -f init_db.sql

# 7. Import data
python3 import_data.py

# 8. Build TypeScript
npm run build
```

## Start the Server

### Development Mode (with auto-reload)
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

## Test It Out!

Once the server is running, try these commands:

### 1. Health Check
```bash
curl http://localhost:3000/health
```

### 2. Find Nearest Pizza Locations
```bash
# Find 5 nearest pizzas to San Francisco downtown
curl "http://localhost:3000/api/nearest?lat=37.7749&lon=-122.4194&limit=5"
```

### 3. Or Open in Browser
```
http://localhost:3000/api/nearest?lat=37.7749&lon=-122.4194&limit=5
```

## Example Response

```json
{
  "success": true,
  "query": {
    "latitude": 37.7749,
    "longitude": -122.4194,
    "limit": 5
  },
  "count": 5,
  "locations": [
    {
      "id": 1,
      "name": "Tony's Pizza Napoletana",
      "address": "1570 Stockton St, San Francisco, CA 94133",
      "coordinates": {
        "latitude": 37.8008,
        "longitude": -122.4098
      },
      "phone_number": "+1 (415) 835-9888",
      "cheese_pizza_price": 18.00,
      "shop_rating": 4.5,
      "distance": {
        "meters": 2850,
        "miles": "1.77",
        "kilometers": "2.85"
      }
    }
  ]
}
```

## Common Issues

### PostgreSQL Not Running
```bash
# macOS
brew services start postgresql

# Linux
sudo systemctl start postgresql
```

### PostGIS Not Installed
```bash
# macOS
brew install postgis

# Ubuntu/Debian
sudo apt-get install postgis

# Then enable it:
psql -U postgres -d pizza_db -c "CREATE EXTENSION postgis;"
```

### Port Already in Use
Edit `.env` and change the PORT to something else (e.g., 3001):
```
PORT=3001
```

## Next Steps

- See [README.md](README.md) for full API documentation
- Try different coordinates around San Francisco
- Add max distance filters
- Explore pagination endpoints

## API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/nearest?lat=X&lon=Y` | Find nearest locations |
| POST | `/api/nearest` | Find nearest (JSON body) |
| GET | `/api/locations` | Get all locations (paginated) |
| GET | `/api/locations/:id` | Get specific location |

## Support

For detailed documentation, see [README.md](README.md)

Happy pizza finding! 🍕


