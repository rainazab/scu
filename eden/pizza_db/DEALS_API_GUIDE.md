# Pizza Deals API - Quick Reference

## 🎯 What's New

Your API now has endpoints to save and retrieve pizza deals from Google Sheets!

**Features:**
- ✅ Save deals with restaurant name, location, prices
- ✅ Auto-calculates savings and percentage
- ✅ Timestamps each deal automatically
- ✅ Retrieve all deals
- ✅ Optional notes field

## 📋 Setup Checklist

Before using the deals endpoints:

- [ ] Enable Google Sheets API in Google Cloud Console
- [ ] Create service account credentials
- [ ] Download `google-credentials.json` file
- [ ] Create a Google Sheet
- [ ] Share sheet with service account email
- [ ] Add credentials to `.env` file
- [ ] Restart the server

**See [GOOGLE_SHEETS_SETUP.md](GOOGLE_SHEETS_SETUP.md) for detailed setup instructions.**

## 🚀 Quick Start

### 1. Save a Deal

```bash
curl -X POST http://localhost:3000/api/deals/save \
  -H "Content-Type: application/json" \
  -d '{
    "restaurant_name": "Baiano Pizzeria",
    "restaurant_location": "100 Gough St, San Francisco, CA 94102",
    "original_price": 20.70,
    "bartered_price": 18.00,
    "notes": "Asked for student discount"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Deal saved to Google Sheets!",
  "data": {
    "restaurant_name": "Baiano Pizzeria",
    "restaurant_location": "100 Gough St, San Francisco, CA 94102",
    "original_price": "20.70",
    "bartered_price": "18.00",
    "savings": "2.70",
    "savings_percent": "13.0%",
    "timestamp": "2025-10-25T19:30:00.000Z"
  },
  "sheets_response": {
    "updated_range": "Sheet1!A2:H2",
    "updated_rows": 1
  }
}
```

### 2. Get All Deals

```bash
curl http://localhost:3000/api/deals
```

**Response:**
```json
{
  "success": true,
  "count": 3,
  "deals": [
    {
      "timestamp": "2025-10-25T19:30:00.000Z",
      "restaurant_name": "Baiano Pizzeria",
      "restaurant_location": "100 Gough St, San Francisco, CA",
      "original_price": "20.70",
      "bartered_price": "18.00",
      "savings": "2.70",
      "savings_percent": "13.0%",
      "notes": "Asked for student discount"
    }
  ]
}
```

## 📊 Google Sheet Format

Your sheet will have these columns:

| Column | Description | Example |
|--------|-------------|---------|
| A | Timestamp | 2025-10-25T19:30:00.000Z |
| B | Restaurant Name | Baiano Pizzeria |
| C | Restaurant Location | 100 Gough St, San Francisco |
| D | Original Price | 20.70 |
| E | Bartered Price | 18.00 |
| F | Savings | 2.70 |
| G | Savings % | 13.0% |
| H | Notes | Asked for student discount |

**Header Row (Row 1):**
```
Timestamp | Restaurant Name | Restaurant Location | Original Price | Bartered Price | Savings | Savings % | Notes
```

## 🔗 Workflow: Find + Save Deal

Combine the nearest pizza endpoint with deals endpoint:

```bash
#!/bin/bash

# 1. Find nearest pizza
echo "Finding nearest pizza..."
PIZZA=$(curl -s "http://localhost:3000/api/nearest?lat=37.7749&lon=-122.4194&limit=1")

# Extract details (requires jq)
NAME=$(echo $PIZZA | jq -r '.locations[0].name')
ADDRESS=$(echo $PIZZA | jq -r '.locations[0].address')
ORIGINAL=$(echo $PIZZA | jq -r '.locations[0].cheese_pizza_price')

echo "Found: $NAME"
echo "Address: $ADDRESS"
echo "Original Price: \$$ORIGINAL"
echo ""

# 2. You negotiate a deal...
BARTERED_PRICE=15.00

# 3. Save the deal
echo "Saving deal to Google Sheets..."
curl -X POST http://localhost:3000/api/deals/save \
  -H "Content-Type: application/json" \
  -d "{
    \"restaurant_name\": \"$NAME\",
    \"restaurant_location\": \"$ADDRESS\",
    \"original_price\": $ORIGINAL,
    \"bartered_price\": $BARTERED_PRICE,
    \"notes\": \"Negotiated successfully!\"
  }" | jq '.'

echo ""
echo "✅ Deal saved! Check your Google Sheet."
```

## 💻 Code Examples

### JavaScript/TypeScript

```javascript
// Save a deal
async function savePizzaDeal(name, location, originalPrice, barteredPrice) {
  const response = await fetch('http://localhost:3000/api/deals/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      restaurant_name: name,
      restaurant_location: location,
      original_price: originalPrice,
      bartered_price: barteredPrice,
      notes: 'Great deal!'
    })
  });
  return await response.json();
}

// Get all deals
async function getAllDeals() {
  const response = await fetch('http://localhost:3000/api/deals');
  return await response.json();
}

// Usage
const result = await savePizzaDeal(
  "Baiano Pizzeria",
  "100 Gough St, SF",
  20.70,
  18.00
);
console.log(`Saved! You saved $${result.data.savings}`);
```

### Python

```python
import requests

def save_deal(restaurant, location, original, bartered, notes=""):
    url = "http://localhost:3000/api/deals/save"
    data = {
        "restaurant_name": restaurant,
        "restaurant_location": location,
        "original_price": original,
        "bartered_price": bartered,
        "notes": notes
    }
    response = requests.post(url, json=data)
    return response.json()

def get_all_deals():
    url = "http://localhost:3000/api/deals"
    response = requests.get(url)
    return response.json()

# Usage
result = save_deal(
    "Baiano Pizzeria",
    "100 Gough St, SF",
    20.70,
    18.00,
    "Student discount"
)
print(f"Saved! You saved ${result['data']['savings']}")

# Get all deals
deals = get_all_deals()
print(f"Total deals: {deals['count']}")
```

### React Component Example

```tsx
import { useState } from 'react';

function DealSaver() {
  const [deal, setDeal] = useState({
    restaurant_name: '',
    restaurant_location: '',
    original_price: '',
    bartered_price: '',
    notes: ''
  });
  const [result, setResult] = useState(null);

  const saveDeal = async () => {
    const response = await fetch('http://localhost:3000/api/deals/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deal)
    });
    const data = await response.json();
    setResult(data);
  };

  return (
    <div>
      <h2>Save Pizza Deal</h2>
      <input
        placeholder="Restaurant Name"
        value={deal.restaurant_name}
        onChange={(e) => setDeal({...deal, restaurant_name: e.target.value})}
      />
      <input
        placeholder="Location"
        value={deal.restaurant_location}
        onChange={(e) => setDeal({...deal, restaurant_location: e.target.value})}
      />
      <input
        type="number"
        placeholder="Original Price"
        value={deal.original_price}
        onChange={(e) => setDeal({...deal, original_price: e.target.value})}
      />
      <input
        type="number"
        placeholder="Bartered Price"
        value={deal.bartered_price}
        onChange={(e) => setDeal({...deal, bartered_price: e.target.value})}
      />
      <input
        placeholder="Notes (optional)"
        value={deal.notes}
        onChange={(e) => setDeal({...deal, notes: e.target.value})}
      />
      <button onClick={saveDeal}>Save Deal</button>
      
      {result && result.success && (
        <div className="success">
          <p>✅ Deal saved!</p>
          <p>You saved ${result.data.savings} ({result.data.savings_percent})</p>
        </div>
      )}
    </div>
  );
}
```

## 🧪 Testing

### Quick Test

```bash
cd /Users/sophiasharif/projects/calhacks/pizza_db
./test_deals.sh
```

### Manual Test

```bash
# Test saving
curl -X POST http://localhost:3000/api/deals/save \
  -H "Content-Type: application/json" \
  -d '{
    "restaurant_name": "Test Pizza",
    "restaurant_location": "Test Address",
    "original_price": 10.00,
    "bartered_price": 8.00
  }'

# Test retrieving
curl http://localhost:3000/api/deals
```

## ❗ Required Fields

When saving a deal, these fields are **required**:
- `restaurant_name` (string)
- `restaurant_location` (string)
- `original_price` (number)
- `bartered_price` (number)

Optional:
- `notes` (string)

## 🔧 Configuration

In your `.env` file:

```bash
# Spreadsheet ID from the URL
GOOGLE_SHEET_ID=1a2b3c4d5e6f7g8h9i0j

# Range (sheet name + columns)
GOOGLE_SHEET_RANGE=Sheet1!A:H

# Credentials file path
GOOGLE_KEY_FILE=./google-credentials.json
```

## 📈 Analytics Ideas

With your deals in Google Sheets, you can:

1. **Track Total Savings**
   - Use `=SUM(F:F)` to total all savings

2. **Average Discount**
   - Use `=AVERAGE(G:G)` (after removing % with formula)

3. **Best Deals**
   - Sort by Savings % column
   - Create a pivot table

4. **Charts**
   - Create a line chart of savings over time
   - Bar chart of best restaurants

5. **Conditional Formatting**
   - Highlight deals with >20% savings in green
   - Highlight deals with <10% savings in yellow

## 🚨 Troubleshooting

### "GOOGLE_SHEET_ID not configured"

**Fix:** Add to `.env`:
```bash
GOOGLE_SHEET_ID=your_sheet_id_here
```
Then restart: `./server.sh restart`

### "The caller does not have permission"

**Fix:** 
1. Open your Google Sheet
2. Click "Share"
3. Add your service account email (from `google-credentials.json`)
4. Give "Editor" permissions

### "Unable to parse range"

**Fix:** Check your sheet name matches the range in `.env`:
```bash
GOOGLE_SHEET_RANGE=Sheet1!A:H  # If your sheet is named "Sheet1"
```

### Test endpoint returns error

**Fix:**
1. Verify Google Sheets API is enabled
2. Check credentials file exists: `ls google-credentials.json`
3. Restart server: `./server.sh restart`
4. Check server logs

## 📚 Related Documentation

- **[GOOGLE_SHEETS_SETUP.md](GOOGLE_SHEETS_SETUP.md)** - Complete setup guide
- **[API_EXAMPLES.md](API_EXAMPLES.md)** - All API endpoints
- **[DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md)** - Development workflow

## 🎯 API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/deals/save` | Save a new deal to Google Sheets |
| GET | `/api/deals` | Get all deals from Google Sheets |
| GET | `/api/nearest` | Find nearest pizza locations |
| GET | `/api/locations` | Get all pizza locations |

---

**Ready to save your first deal?** Follow [GOOGLE_SHEETS_SETUP.md](GOOGLE_SHEETS_SETUP.md) to get started! 🍕

