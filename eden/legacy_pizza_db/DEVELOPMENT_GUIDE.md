# Development Guide

## Current Status

✅ Your Pizza Finder API is **running** on `http://localhost:3000`

## How It's Running

The server was started in the background using:
```bash
npm run dev
```

This command runs **ts-node-dev** which:
- Automatically compiles TypeScript on the fly
- Watches for file changes
- Auto-restarts when you save changes to files

## Making Changes & Restarting

### Option 1: Auto-Restart (Recommended for Development)

The server is already running with **auto-restart enabled**! Just:

1. **Edit the file** you want to change (e.g., `src/index.ts`)
2. **Save the file** (Cmd+S / Ctrl+S)
3. The server will **automatically restart** within 1-2 seconds

**Example: Let's add a new endpoint**

Edit `src/index.ts` and add:
```typescript
// Add this anywhere after the existing endpoints
app.get('/api/hello', (req: Request, res: Response) => {
  res.json({ message: 'Hello from your custom endpoint!' });
});
```

Save the file, and within seconds you can test it:
```bash
curl http://localhost:3000/api/hello
```

### Option 2: Manual Restart

If you want to manually restart:

```bash
# 1. Stop the server
lsof -ti:3000 | xargs kill

# 2. Start it again
cd /Users/sophiasharif/projects/calhacks/pizza_db
npm run dev
```

Or use this one-liner:
```bash
cd /Users/sophiasharif/projects/calhacks/pizza_db && \
  lsof -ti:3000 | xargs kill && \
  npm run dev
```

### Option 3: Restart in Foreground (See Logs)

If you want to see all the logs in real-time:

```bash
# 1. Stop background server
lsof -ti:3000 | xargs kill

# 2. Start in foreground (you'll see all logs)
cd /Users/sophiasharif/projects/calhacks/pizza_db
npm run dev
```

Press **Ctrl+C** to stop it when you're done.

## Common Development Tasks

### 1. Check if Server is Running
```bash
lsof -i :3000
```

If you see output, it's running. If not, start it with `npm run dev`.

### 2. Stop the Server
```bash
lsof -ti:3000 | xargs kill
```

### 3. View Real-Time Logs
```bash
# Stop background server first
lsof -ti:3000 | xargs kill

# Start in foreground to see logs
cd /Users/sophiasharif/projects/calhacks/pizza_db
npm run dev
```

### 4. Test Your Changes
```bash
# Health check
curl http://localhost:3000/health

# Test nearest endpoint
curl "http://localhost:3000/api/nearest?lat=37.7749&lon=-122.4194&limit=3"
```

### 5. Build for Production
```bash
cd /Users/sophiasharif/projects/calhacks/pizza_db
npm run build
```

This creates optimized JavaScript files in the `dist/` folder.

### 6. Run Production Build
```bash
npm start
```

This runs the compiled JavaScript (faster, but no auto-restart).

## File Structure for Editing

```
pizza_db/
├── src/
│   └── index.ts          ← Main API code - EDIT THIS
├── package.json          ← Dependencies and scripts
├── tsconfig.json         ← TypeScript config
├── init_db.sql           ← Database schema
└── import_data.py        ← Data import script
```

## Common Changes You Might Want to Make

### Add a New Endpoint

Edit `src/index.ts`:
```typescript
app.get('/api/custom', async (req: Request, res: Response) => {
  res.json({ message: 'Your custom endpoint!' });
});
```

### Modify the Nearest Endpoint

Find this code in `src/index.ts` (around line 50):
```typescript
app.get('/api/nearest', async (req: Request, res: Response) => {
  // Modify query logic here
  const { lat, lon, limit = 10, max_distance_miles } = req.query;
  // ...
});
```

### Change the Port

Edit `src/index.ts` (line ~6):
```typescript
const port = process.env.PORT || 3001;  // Change to 3001
```

Or set it temporarily:
```bash
PORT=3001 npm run dev
```

### Add Database Columns

1. Edit `init_db.sql` to add new columns
2. Recreate the schema:
   ```bash
   psql -U postgres -d pizza_db -f init_db.sql
   ```
3. Re-import data:
   ```bash
   /opt/homebrew/Caskroom/miniconda/base/bin/python import_data.py
   ```

## TypeScript Tips

### Check for Type Errors
```bash
cd /Users/sophiasharif/projects/calhacks/pizza_db
npx tsc --noEmit
```

### Format Code
```bash
# Install prettier (optional)
npm install --save-dev prettier

# Format all files
npx prettier --write "src/**/*.ts"
```

## Debugging

### Server Won't Start
```bash
# Check if port 3000 is already in use
lsof -i :3000

# If something else is using it, kill it
lsof -ti:3000 | xargs kill

# Or use a different port
PORT=3001 npm run dev
```

### Can't Connect to Database
```bash
# Check PostgreSQL is running
pg_isready

# If not, start it
brew services start postgresql

# Test connection manually
psql -U postgres -d pizza_db -c "SELECT COUNT(*) FROM pizza_locations;"
```

### Import Script Issues
```bash
# Make sure to use conda's Python
/opt/homebrew/Caskroom/miniconda/base/bin/python import_data.py

# Or add it to your PATH
export PATH="/opt/homebrew/Caskroom/miniconda/base/bin:$PATH"
python import_data.py
```

## Development Workflow

**Recommended workflow:**

1. **Keep server running** with `npm run dev` (auto-restart enabled)
2. **Edit files** in your IDE
3. **Save** (server auto-restarts)
4. **Test** with curl or browser
5. **Repeat**

**Terminal Setup:**

I recommend opening 2 terminals:

**Terminal 1:** Server (foreground)
```bash
cd /Users/sophiasharif/projects/calhacks/pizza_db
npm run dev
```

**Terminal 2:** Testing/Commands
```bash
cd /Users/sophiasharif/projects/calhacks/pizza_db

# Test endpoints
curl "http://localhost:3000/api/nearest?lat=37.7749&lon=-122.4194&limit=3"

# Run other commands
npm run build
psql -U postgres -d pizza_db
```

## Quick Reference Commands

| Task | Command |
|------|---------|
| Start dev server | `npm run dev` |
| Stop server | `lsof -ti:3000 \| xargs kill` |
| Check if running | `lsof -i :3000` |
| Build for production | `npm run build` |
| Start production | `npm start` |
| Test endpoint | `curl http://localhost:3000/health` |
| Check DB | `psql -U postgres -d pizza_db` |
| Re-import data | `/opt/homebrew/Caskroom/miniconda/base/bin/python import_data.py` |

## Example: Adding a Search Endpoint

Let's say you want to search pizza places by name. Here's how:

1. **Open** `src/index.ts` in your editor

2. **Add** this new endpoint (around line 220, after existing endpoints):

```typescript
// Search pizza locations by name
app.get('/api/search', async (req: Request, res: Response) => {
  try {
    const { query, limit = 20 } = req.query;

    if (!query) {
      return res.status(400).json({
        error: 'Missing query parameter',
        message: 'Please provide a search query'
      });
    }

    const result = await pool.query(
      `SELECT 
        id, name, description, address, city, state, zipcode,
        latitude, longitude, phone_number, cheese_pizza_price,
        shop_rating, url
      FROM pizza_locations
      WHERE name ILIKE $1 OR description ILIKE $1
      ORDER BY shop_rating DESC NULLS LAST
      LIMIT $2`,
      [`%${query}%`, limit]
    );

    res.json({
      success: true,
      query: query,
      count: result.rows.length,
      locations: result.rows
    });

  } catch (error) {
    console.error('Error searching locations:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
```

3. **Save** the file (Cmd+S / Ctrl+S)

4. **Test** it (the server auto-restarted):

```bash
curl "http://localhost:3000/api/search?query=pizza"
curl "http://localhost:3000/api/search?query=tony"
```

That's it! 🎉

## Need Help?

- **API not responding?** Check if it's running: `lsof -i :3000`
- **Database issues?** Check PostgreSQL: `pg_isready`
- **TypeScript errors?** Run: `npx tsc --noEmit`
- **See all docs:** Check `README.md`, `QUICKSTART.md`, `API_EXAMPLES.md`

---

**Current Status:** Server is running on `http://localhost:3000` ✅

