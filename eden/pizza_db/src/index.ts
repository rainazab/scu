import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { google } from 'googleapis';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'pizza_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

// Test database connection
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Pizza Finder API is running' });
});

// Interface for pizza location
interface PizzaLocation {
  id: number;
  name: string;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  phone_number: string;
  cheese_pizza_price: number;
  shop_rating: number;
  distance_meters: number;
  distance_miles: number;
}

// Main endpoint: Find nearest pizza locations
app.get('/api/nearest', async (req: Request, res: Response) => {
  try {
    const { lat, lon, limit = 10, max_distance_miles } = req.query;

    // Validate required parameters
    if (!lat || !lon) {
      return res.status(400).json({
        error: 'Missing required parameters',
        message: 'Please provide lat and lon query parameters',
        example: '/api/nearest?lat=37.7749&lon=-122.4194&limit=5'
      });
    }

    // Parse and validate coordinates
    const latitude = parseFloat(lat as string);
    const longitude = parseFloat(lon as string);

    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({
        error: 'Invalid coordinates',
        message: 'lat and lon must be valid numbers'
      });
    }

    if (latitude < -90 || latitude > 90) {
      return res.status(400).json({
        error: 'Invalid latitude',
        message: 'Latitude must be between -90 and 90'
      });
    }

    if (longitude < -180 || longitude > 180) {
      return res.status(400).json({
        error: 'Invalid longitude',
        message: 'Longitude must be between -180 and 180'
      });
    }

    // Parse limit
    const resultLimit = Math.min(parseInt(limit as string) || 10, 100);

    // Build query
    let query = `
      SELECT 
        id,
        name,
        description,
        address,
        city,
        state,
        zipcode,
        latitude,
        longitude,
        phone_number,
        cheese_pizza_price,
        shop_rating,
        url,
        ST_Distance(
          coordinates,
          ST_GeogFromText('POINT(${longitude} ${latitude})')
        ) as distance_meters,
        ST_Distance(
          coordinates,
          ST_GeogFromText('POINT(${longitude} ${latitude})')
        ) * 0.000621371 as distance_miles
      FROM pizza_locations
      WHERE coordinates IS NOT NULL
    `;

    // Add distance filter if provided
    if (max_distance_miles) {
      const maxDistanceMeters = parseFloat(max_distance_miles as string) * 1609.34;
      query += `
        AND ST_DWithin(
          coordinates,
          ST_GeogFromText('POINT(${longitude} ${latitude})'),
          ${maxDistanceMeters}
        )
      `;
    }

    // Order by distance and limit results
    query += `
      ORDER BY distance_meters ASC
      LIMIT ${resultLimit}
    `;

    // Execute query
    const result = await pool.query(query);

    // Format response
    const locations = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      address: row.address,
      city: row.city,
      state: row.state,
      zipcode: row.zipcode,
      coordinates: {
        latitude: parseFloat(row.latitude),
        longitude: parseFloat(row.longitude)
      },
      phone_number: row.phone_number,
      cheese_pizza_price: row.cheese_pizza_price ? parseFloat(row.cheese_pizza_price) : null,
      shop_rating: row.shop_rating ? parseFloat(row.shop_rating) : null,
      url: row.url,
      distance: {
        meters: Math.round(parseFloat(row.distance_meters)),
        miles: parseFloat(row.distance_miles).toFixed(2),
        kilometers: (parseFloat(row.distance_meters) / 1000).toFixed(2)
      }
    }));

    res.json({
      success: true,
      query: {
        latitude,
        longitude,
        limit: resultLimit,
        max_distance_miles: max_distance_miles ? parseFloat(max_distance_miles as string) : null
      },
      count: locations.length,
      locations
    });

  } catch (error) {
    console.error('Error fetching nearest locations:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST endpoint for finding nearest pizza locations (alternative)
app.post('/api/nearest', async (req: Request, res: Response) => {
  try {
    const { latitude, longitude, limit = 10, max_distance_miles } = req.body;

    // Validate required parameters
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        error: 'Missing required parameters',
        message: 'Please provide latitude and longitude in request body',
        example: { latitude: 37.7749, longitude: -122.4194, limit: 5 }
      });
    }

    // Redirect to GET endpoint logic by setting query params
    req.query = {
      lat: latitude.toString(),
      lon: longitude.toString(),
      limit: limit.toString(),
      ...(max_distance_miles && { max_distance_miles: max_distance_miles.toString() })
    };

    // Call the GET endpoint handler
    return app._router.handle(
      { ...req, method: 'GET', url: '/api/nearest' },
      res,
      () => {}
    );

  } catch (error) {
    console.error('Error in POST endpoint:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get all locations (paginated)
app.get('/api/locations', async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(parseInt(limit as string) || 20, 100);
    const offset = (pageNum - 1) * limitNum;

    const countResult = await pool.query('SELECT COUNT(*) FROM pizza_locations');
    const total = parseInt(countResult.rows[0].count);

    const result = await pool.query(`
      SELECT 
        id, name, description, address, city, state, zipcode,
        latitude, longitude, phone_number, cheese_pizza_price,
        shop_rating, url
      FROM pizza_locations
      ORDER BY shop_rating DESC NULLS LAST, name ASC
      LIMIT ${limitNum} OFFSET ${offset}
    `);

    res.json({
      success: true,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      },
      locations: result.rows
    });

  } catch (error) {
    console.error('Error fetching locations:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get location by ID
app.get('/api/locations/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM pizza_locations WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: `Location with ID ${id} not found`
      });
    }

    res.json({
      success: true,
      location: result.rows[0]
    });

  } catch (error) {
    console.error('Error fetching location:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Google Sheets Integration
// Initialize Google Sheets API
async function getGoogleSheetsClient() {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: process.env.GOOGLE_CREDENTIALS 
        ? JSON.parse(process.env.GOOGLE_CREDENTIALS)
        : undefined,
      keyFile: process.env.GOOGLE_KEY_FILE,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    return sheets;
  } catch (error) {
    console.error('Error initializing Google Sheets:', error);
    throw error;
  }
}

// Save pizza deal to Google Sheets
app.post('/api/deals/save', async (req: Request, res: Response) => {
  try {
    const { restaurant_name, restaurant_location, original_price, bartered_price, notes } = req.body;

    // Validate required fields
    if (!restaurant_name || !restaurant_location || original_price === undefined || bartered_price === undefined) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Please provide: restaurant_name, restaurant_location, original_price, bartered_price',
        example: {
          restaurant_name: 'Tony\'s Pizza',
          restaurant_location: '123 Main St, San Francisco, CA',
          original_price: 18.99,
          bartered_price: 15.00,
          notes: 'Optional notes about the deal'
        }
      });
    }

    // Get spreadsheet ID from environment
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) {
      return res.status(500).json({
        error: 'Configuration error',
        message: 'GOOGLE_SHEET_ID not configured in environment variables'
      });
    }

    // Initialize Google Sheets
    const sheets = await getGoogleSheetsClient();

    // Prepare row data
    const timestamp = new Date().toISOString();
    const savings = (parseFloat(original_price) - parseFloat(bartered_price)).toFixed(2);
    const savingsPercent = ((savings / parseFloat(original_price)) * 100).toFixed(1);

    const rowData = [
      [
        timestamp,
        restaurant_name,
        restaurant_location,
        parseFloat(original_price).toFixed(2),
        parseFloat(bartered_price).toFixed(2),
        savings,
        `${savingsPercent}%`,
        notes || ''
      ]
    ];

    // Append data to sheet
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: process.env.GOOGLE_SHEET_RANGE || 'Sheet1!A:H',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: rowData
      }
    });

    res.json({
      success: true,
      message: 'Deal saved to Google Sheets!',
      data: {
        restaurant_name,
        restaurant_location,
        original_price: parseFloat(original_price).toFixed(2),
        bartered_price: parseFloat(bartered_price).toFixed(2),
        savings,
        savings_percent: `${savingsPercent}%`,
        timestamp
      },
      sheets_response: {
        updated_range: response.data.updates?.updatedRange,
        updated_rows: response.data.updates?.updatedRows
      }
    });

  } catch (error) {
    console.error('Error saving to Google Sheets:', error);
    res.status(500).json({
      error: 'Failed to save to Google Sheets',
      message: error instanceof Error ? error.message : 'Unknown error',
      hint: 'Make sure GOOGLE_SHEET_ID and credentials are properly configured'
    });
  }
});

// Get all deals from Google Sheets (optional read endpoint)
app.get('/api/deals', async (req: Request, res: Response) => {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) {
      return res.status(500).json({
        error: 'Configuration error',
        message: 'GOOGLE_SHEET_ID not configured'
      });
    }

    const sheets = await getGoogleSheetsClient();
    const range = process.env.GOOGLE_SHEET_RANGE || 'Sheet1!A:H';

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range
    });

    const rows = response.data.values || [];
    
    // Assume first row is headers
    if (rows.length === 0) {
      return res.json({
        success: true,
        count: 0,
        deals: []
      });
    }

    const headers = rows[0];
    const deals = rows.slice(1).map(row => ({
      timestamp: row[0] || '',
      restaurant_name: row[1] || '',
      restaurant_location: row[2] || '',
      original_price: row[3] || '',
      bartered_price: row[4] || '',
      savings: row[5] || '',
      savings_percent: row[6] || '',
      notes: row[7] || ''
    }));

    res.json({
      success: true,
      count: deals.length,
      deals
    });

  } catch (error) {
    console.error('Error reading from Google Sheets:', error);
    res.status(500).json({
      error: 'Failed to read from Google Sheets',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Start server
app.listen(port, () => {
  console.log(`🍕 Pizza Finder API is running on http://localhost:${port}`);
  console.log(`📍 Find nearest pizzas: http://localhost:${port}/api/nearest?lat=37.7749&lon=-122.4194`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing HTTP server');
  await pool.end();
  process.exit(0);
});


