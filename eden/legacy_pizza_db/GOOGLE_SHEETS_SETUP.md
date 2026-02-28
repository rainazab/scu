# Google Sheets Integration Setup

This guide will help you set up Google Sheets API integration to save pizza deals.

## Quick Overview

The API can now save pizza deals to Google Sheets with:
- Restaurant name
- Restaurant location
- Original price
- Bartered price
- Savings (calculated automatically)
- Savings percentage (calculated automatically)
- Timestamp
- Optional notes

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **"Create Project"** or select an existing project
3. Give it a name (e.g., "Pizza Deals Tracker")
4. Click **"Create"**

## Step 2: Enable Google Sheets API

1. In your project, go to **"APIs & Services"** > **"Library"**
2. Search for **"Google Sheets API"**
3. Click on it and press **"Enable"**

## Step 3: Create Service Account Credentials

1. Go to **"APIs & Services"** > **"Credentials"**
2. Click **"Create Credentials"** > **"Service Account"**
3. Enter a name (e.g., "pizza-sheets-writer")
4. Click **"Create and Continue"**
5. For role, select **"Editor"** or **"Owner"**
6. Click **"Continue"** and then **"Done"**

## Step 4: Generate and Download Key File

1. In the **"Credentials"** page, find your service account
2. Click on the service account email
3. Go to the **"Keys"** tab
4. Click **"Add Key"** > **"Create new key"**
5. Choose **"JSON"** format
6. Click **"Create"** - this downloads the key file
7. **Rename** the downloaded file to `google-credentials.json`
8. **Move** it to your project directory:
   ```bash
   mv ~/Downloads/your-project-xyz-123abc.json /Users/sophiasharif/projects/calhacks/pizza_db/google-credentials.json
   ```

## Step 5: Create Your Google Sheet

1. Go to [Google Sheets](https://sheets.google.com/)
2. Create a new spreadsheet
3. Name it (e.g., "Pizza Deals Tracker")
4. **Add headers in Row 1:**
   ```
   A1: Timestamp
   B1: Restaurant Name
   C1: Restaurant Location
   D1: Original Price
   E1: Bartered Price
   F1: Savings
   G1: Savings %
   H1: Notes
   ```

5. **Get the Spreadsheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_HERE/edit
   ```
   Copy the `SPREADSHEET_ID_HERE` part

## Step 6: Share Sheet with Service Account

**IMPORTANT:** You must share the sheet with your service account!

1. Open your Google Sheet
2. Click the **"Share"** button (top right)
3. Paste your **service account email** (looks like: `pizza-sheets-writer@your-project.iam.gserviceaccount.com`)
   - Find this in the `google-credentials.json` file under `"client_email"`
4. Give it **"Editor"** permissions
5. Click **"Send"** (or "Share" - don't send email notification)

## Step 7: Configure Environment Variables

Create or update your `.env` file:

```bash
# Copy template if you haven't already
cp env.template .env
```

Edit `.env` and add:

```bash
# Google Sheets Configuration
GOOGLE_SHEET_ID=your_actual_spreadsheet_id
GOOGLE_SHEET_RANGE=Sheet1!A:H
GOOGLE_KEY_FILE=./google-credentials.json
```

**Replace:**
- `your_actual_spreadsheet_id` with the ID from Step 5
- Adjust the range if your sheet has a different name

## Step 8: Restart the Server

The server auto-restarts when you save files, but if you updated `.env`:

```bash
cd /Users/sophiasharif/projects/calhacks/pizza_db
./server.sh restart
```

Or manually:
```bash
lsof -ti:3000 | xargs kill
npm run dev
```

## Testing the Endpoint

### Save a Deal

```bash
curl -X POST http://localhost:3000/api/deals/save \
  -H "Content-Type: application/json" \
  -d '{
    "restaurant_name": "Tonys Pizza",
    "restaurant_location": "123 Main St, San Francisco, CA",
    "original_price": 18.99,
    "bartered_price": 15.00,
    "notes": "Asked nicely, got 20% off!"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Deal saved to Google Sheets!",
  "data": {
    "restaurant_name": "Tonys Pizza",
    "restaurant_location": "123 Main St, San Francisco, CA",
    "original_price": "18.99",
    "bartered_price": "15.00",
    "savings": "3.99",
    "savings_percent": "21.0%",
    "timestamp": "2025-10-25T19:30:00.000Z"
  }
}
```

### Get All Deals

```bash
curl http://localhost:3000/api/deals
```

## Using in Your App

### JavaScript/TypeScript

```javascript
async function saveDeal(restaurantName, location, originalPrice, barteredPrice) {
  const response = await fetch('http://localhost:3000/api/deals/save', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      restaurant_name: restaurantName,
      restaurant_location: location,
      original_price: originalPrice,
      bartered_price: barteredPrice,
      notes: 'Great deal!'
    })
  });
  
  const result = await response.json();
  return result;
}

// Usage
await saveDeal("Uncle Vito's", "700 Bush St, SF", 12.99, 10.00);
```

### Python

```python
import requests

def save_deal(restaurant_name, location, original_price, bartered_price, notes=""):
    url = "http://localhost:3000/api/deals/save"
    data = {
        "restaurant_name": restaurant_name,
        "restaurant_location": location,
        "original_price": original_price,
        "bartered_price": bartered_price,
        "notes": notes
    }
    response = requests.post(url, json=data)
    return response.json()

# Usage
result = save_deal("Uncle Vito's", "700 Bush St, SF", 12.99, 10.00)
print(result)
```

### cURL with variables

```bash
#!/bin/bash

RESTAURANT="Baiano Pizzeria"
LOCATION="100 Gough St, San Francisco, CA"
ORIGINAL=20.70
BARTERED=18.00
NOTES="Student discount applied"

curl -X POST http://localhost:3000/api/deals/save \
  -H "Content-Type: application/json" \
  -d "{
    \"restaurant_name\": \"$RESTAURANT\",
    \"restaurant_location\": \"$LOCATION\",
    \"original_price\": $ORIGINAL,
    \"bartered_price\": $BARTERED,
    \"notes\": \"$NOTES\"
  }"
```

## Integrated Workflow Example

Save a deal after finding nearby pizza:

```bash
# 1. Find nearest pizza
NEAREST=$(curl -s "http://localhost:3000/api/nearest?lat=37.7749&lon=-122.4194&limit=1")

# Extract details (using jq)
NAME=$(echo $NEAREST | jq -r '.locations[0].name')
ADDRESS=$(echo $NEAREST | jq -r '.locations[0].address')
ORIGINAL_PRICE=$(echo $NEAREST | jq -r '.locations[0].cheese_pizza_price')

# 2. Save your deal
curl -X POST http://localhost:3000/api/deals/save \
  -H "Content-Type: application/json" \
  -d "{
    \"restaurant_name\": \"$NAME\",
    \"restaurant_location\": \"$ADDRESS\",
    \"original_price\": $ORIGINAL_PRICE,
    \"bartered_price\": 15.00,
    \"notes\": \"Successfully negotiated!\"
  }"
```

## Troubleshooting

### Error: "GOOGLE_SHEET_ID not configured"

**Solution:** Make sure `.env` has:
```bash
GOOGLE_SHEET_ID=your_spreadsheet_id
```

Restart the server after adding it.

### Error: "The caller does not have permission"

**Solution:** 
1. Share the Google Sheet with your service account email
2. The email is in `google-credentials.json` under `"client_email"`
3. Give it "Editor" permissions

### Error: "Unable to parse range"

**Solution:** 
- Make sure your sheet is named "Sheet1" or update `GOOGLE_SHEET_RANGE` in `.env`
- Format: `SheetName!A:H`

### Error: "Error initializing Google Sheets"

**Solution:**
1. Check that `google-credentials.json` exists in the project directory
2. Verify the JSON file is valid
3. Make sure Google Sheets API is enabled in your Google Cloud project

### Credentials not being read

**Solution:**
```bash
# Verify file exists
ls -la google-credentials.json

# Check .env file
cat .env | grep GOOGLE

# Restart server
./server.sh restart
```

## Security Notes

### DO NOT commit credentials to Git!

The `.gitignore` file already includes:
```
.env
google-credentials.json
```

### For Production/Deployment

Instead of a key file, use the `GOOGLE_CREDENTIALS` environment variable:

```bash
# In your deployment platform (Heroku, Vercel, etc.)
GOOGLE_CREDENTIALS='{"type":"service_account","project_id":"...","private_key":"..."}'
```

The code automatically handles both methods!

## Advanced: Custom Sheet Structure

If you want a different column structure, edit `src/index.ts`:

```typescript
// Around line 360, modify the rowData array:
const rowData = [
  [
    timestamp,
    restaurant_name,
    restaurant_location,
    parseFloat(original_price).toFixed(2),
    parseFloat(bartered_price).toFixed(2),
    savings,
    `${savingsPercent}%`,
    notes || '',
    // Add more columns here
    'Custom field'
  ]
];
```

And update `GOOGLE_SHEET_RANGE` in `.env`:
```bash
GOOGLE_SHEET_RANGE=Sheet1!A:I  # Changed from A:H to A:I for 9 columns
```

## Example Use Cases

### 1. Track Daily Deals
Run this daily to track your best deals:
```bash
./save_deal.sh "Pizza Place" "Address" 20.00 16.00 "Daily special"
```

### 2. Compare Savings
Use the GET endpoint to see all deals:
```bash
curl http://localhost:3000/api/deals | jq '.deals | sort_by(.savings) | reverse'
```

### 3. Analytics
Open your Google Sheet and use built-in charts to visualize:
- Total savings over time
- Best deals by restaurant
- Average discount percentage

## API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/deals/save` | Save a new deal to Google Sheets |
| GET | `/api/deals` | Get all deals from Google Sheets |

---

**Next:** Check out [API_EXAMPLES.md](API_EXAMPLES.md) for more endpoint examples!

