#!/bin/bash

# Pizza Finder API Server Management Script

case "$1" in
  start)
    echo "🚀 Starting Pizza Finder API..."
    cd "$(dirname "$0")"
    npm run dev
    ;;
  
  stop)
    echo "🛑 Stopping Pizza Finder API..."
    lsof -ti:3000 | xargs kill 2>/dev/null && echo "✅ Server stopped" || echo "⚠️  No server running on port 3000"
    ;;
  
  restart)
    echo "🔄 Restarting Pizza Finder API..."
    lsof -ti:3000 | xargs kill 2>/dev/null
    sleep 1
    cd "$(dirname "$0")"
    npm run dev
    ;;
  
  status)
    if lsof -i:3000 > /dev/null 2>&1; then
      echo "✅ Server is running on port 3000"
      lsof -i:3000
    else
      echo "❌ Server is not running"
    fi
    ;;
  
  test)
    echo "🧪 Testing API endpoints..."
    echo ""
    echo "1. Health Check:"
    curl -s http://localhost:3000/health | python3 -m json.tool
    echo ""
    echo ""
    echo "2. Nearest Pizza (SF Downtown):"
    curl -s "http://localhost:3000/api/nearest?lat=37.7749&lon=-122.4194&limit=3" | python3 -m json.tool | head -40
    ;;
  
  logs)
    echo "📋 Viewing server logs (Ctrl+C to exit)..."
    lsof -ti:3000 | xargs kill 2>/dev/null
    cd "$(dirname "$0")"
    npm run dev
    ;;
  
  build)
    echo "🔨 Building for production..."
    cd "$(dirname "$0")"
    npm run build
    echo "✅ Build complete! Run './server.sh prod' to start production server"
    ;;
  
  prod)
    echo "🚀 Starting production server..."
    cd "$(dirname "$0")"
    npm start
    ;;
  
  *)
    echo "Pizza Finder API - Server Management"
    echo ""
    echo "Usage: ./server.sh [command]"
    echo ""
    echo "Commands:"
    echo "  start     - Start the development server"
    echo "  stop      - Stop the server"
    echo "  restart   - Restart the server"
    echo "  status    - Check if server is running"
    echo "  test      - Test API endpoints"
    echo "  logs      - View server logs in real-time"
    echo "  build     - Build for production"
    echo "  prod      - Start production server"
    echo ""
    echo "Examples:"
    echo "  ./server.sh start"
    echo "  ./server.sh status"
    echo "  ./server.sh test"
    echo ""
    ;;
esac

