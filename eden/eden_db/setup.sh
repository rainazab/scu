#!/bin/bash

# Eden Shelter API Setup Script
# This script sets up the database and imports shelter seed data

set -e

echo "Eden Shelter API Setup"
echo "======================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Load environment variables if .env exists
if [ -f .env ]; then
    echo "Loading environment variables from .env..."
    export $(cat .env | grep -v '^#' | xargs)
else
    echo -e "${YELLOW}Warning: .env file not found. Using defaults.${NC}"
    export DB_NAME=eden_db
    export DB_USER=postgres
    export DB_HOST=localhost
    export DB_PORT=5432
fi

echo ""
echo "Step 1: Installing Node.js dependencies..."
npm install

echo ""
echo "Step 2: Checking PostgreSQL connection..."
if ! pg_isready -h ${DB_HOST:-localhost} -p ${DB_PORT:-5432} > /dev/null 2>&1; then
    echo -e "${RED}Error: PostgreSQL is not running or not accessible.${NC}"
    echo "Please start PostgreSQL and try again."
    exit 1
fi
echo -e "${GREEN}✓ PostgreSQL is running${NC}"

echo ""
echo "Step 3: Creating database (if it doesn't exist)..."
psql -h ${DB_HOST:-localhost} -p ${DB_PORT:-5432} -U ${DB_USER:-postgres} -tc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME:-eden_db}'" | grep -q 1 || \
psql -h ${DB_HOST:-localhost} -p ${DB_PORT:-5432} -U ${DB_USER:-postgres} -c "CREATE DATABASE ${DB_NAME:-eden_db};"
echo -e "${GREEN}✓ Database ready${NC}"

echo ""
echo "Step 4: Initializing database schema..."
psql -h ${DB_HOST:-localhost} -p ${DB_PORT:-5432} -U ${DB_USER:-postgres} -d ${DB_NAME:-eden_db} -f init_db.sql
echo -e "${GREEN}✓ Schema initialized${NC}"

echo ""
echo "Step 5: Importing CSV data..."
python3 import_data.py
echo -e "${GREEN}✓ Data imported${NC}"

echo ""
echo "Step 6: Building TypeScript..."
npm run build
echo -e "${GREEN}✓ Build complete${NC}"

echo ""
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo "To start the server in development mode:"
echo "  npm run dev"
echo ""
echo "To start the server in production mode:"
echo "  npm start"
echo ""
echo "The API will be available at: http://localhost:${PORT:-3000}"
echo ""
echo "Example API call:"
echo "  curl \"http://localhost:${PORT:-3000}/api/shelters/nearest?lat=37.7749&lon=-122.4194&limit=5\""
echo ""


