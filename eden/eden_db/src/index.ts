import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  database: process.env.DB_NAME || "eden_db",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
});

pool.on("connect", () => {
  console.log("Connected to PostgreSQL database");
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
  process.exit(-1);
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", message: "Eden shelter API is running" });
});

function validateCoordinates(lat: number, lon: number): string | null {
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return "lat and lon must be valid numbers";
  }
  if (lat < -90 || lat > 90) {
    return "Latitude must be between -90 and 90";
  }
  if (lon < -180 || lon > 180) {
    return "Longitude must be between -180 and 180";
  }
  return null;
}

app.get("/api/shelters/nearest", async (req: Request, res: Response) => {
  try {
    const { lat, lon, limit = "10", max_distance_miles } = req.query;
    if (!lat || !lon) {
      return res.status(400).json({
        error: "Missing required parameters",
        message: "Please provide lat and lon query parameters",
        example: "/api/shelters/nearest?lat=37.7749&lon=-122.4194&limit=5",
      });
    }

    const latitude = parseFloat(lat as string);
    const longitude = parseFloat(lon as string);
    const coordError = validateCoordinates(latitude, longitude);
    if (coordError) {
      return res.status(400).json({ error: "Invalid coordinates", message: coordError });
    }

    const resultLimit = Math.max(1, Math.min(parseInt(limit as string, 10) || 10, 100));
    const maxDistanceMeters = max_distance_miles
      ? parseFloat(max_distance_miles as string) * 1609.34
      : null;

    const values: Array<number | null> = [longitude, latitude];
    let query = `
      SELECT
        id,
        shelter_name,
        description,
        address,
        city,
        state,
        zipcode,
        intake_phone,
        bed_count,
        available_beds,
        accepts_children,
        accepts_pets,
        languages_spoken,
        last_verified_at,
        latitude,
        longitude,
        ST_Distance(coordinates, ST_GeogFromText('POINT($1 $2)')) AS distance_meters
      FROM shelters
      WHERE coordinates IS NOT NULL
    `;

    if (maxDistanceMeters !== null && !Number.isNaN(maxDistanceMeters)) {
      values.push(maxDistanceMeters);
      query += ` AND ST_DWithin(coordinates, ST_GeogFromText('POINT($1 $2)'), $3)`;
    }

    query += ` ORDER BY distance_meters ASC LIMIT ${resultLimit}`;

    const result = await pool.query(query, values);
    const shelters = result.rows.map((row) => ({
      id: row.id,
      shelter_name: row.shelter_name,
      description: row.description,
      address: row.address,
      city: row.city,
      state: row.state,
      zipcode: row.zipcode,
      intake_phone: row.intake_phone,
      bed_count: row.bed_count,
      available_beds: row.available_beds,
      accepts_children: row.accepts_children,
      accepts_pets: row.accepts_pets,
      languages_spoken: row.languages_spoken,
      last_verified_at: row.last_verified_at,
      coordinates: {
        latitude: parseFloat(row.latitude),
        longitude: parseFloat(row.longitude),
      },
      distance: {
        meters: Math.round(parseFloat(row.distance_meters)),
        miles: (parseFloat(row.distance_meters) * 0.000621371).toFixed(2),
      },
    }));

    return res.json({
      success: true,
      query: {
        latitude,
        longitude,
        limit: resultLimit,
        max_distance_miles: max_distance_miles ? parseFloat(max_distance_miles as string) : null,
      },
      count: shelters.length,
      shelters,
    });
  } catch (error) {
    console.error("Error fetching nearest shelters:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post("/api/shelters/nearest", async (req: Request, res: Response) => {
  req.query = {
    lat: String(req.body.latitude),
    lon: String(req.body.longitude),
    limit: String(req.body.limit ?? 10),
    ...(req.body.max_distance_miles !== undefined && {
      max_distance_miles: String(req.body.max_distance_miles),
    }),
  };
  return app._router.handle({ ...req, method: "GET", url: "/api/shelters/nearest" }, res, () => {});
});

app.get("/api/shelters", async (req: Request, res: Response) => {
  try {
    const pageNum = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const limitNum = Math.max(1, Math.min(parseInt((req.query.limit as string) || "20", 10), 100));
    const offset = (pageNum - 1) * limitNum;

    const countResult = await pool.query("SELECT COUNT(*) FROM shelters");
    const total = parseInt(countResult.rows[0].count, 10);

    const result = await pool.query(
      `
      SELECT
        id, shelter_name, description, address, city, state, zipcode,
        intake_phone, bed_count, available_beds, accepts_children, accepts_pets,
        languages_spoken, last_verified_at, latitude, longitude, url
      FROM shelters
      ORDER BY available_beds DESC, shelter_name ASC
      LIMIT $1 OFFSET $2
      `,
      [limitNum, offset]
    );

    return res.json({
      success: true,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
      shelters: result.rows,
    });
  } catch (error) {
    console.error("Error fetching shelters:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.get("/api/shelters/:id", async (req: Request, res: Response) => {
  try {
    const result = await pool.query("SELECT * FROM shelters WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Not found",
        message: `Shelter with ID ${req.params.id} not found`,
      });
    }
    return res.json({ success: true, shelter: result.rows[0] });
  } catch (error) {
    console.error("Error fetching shelter:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.listen(port, () => {
  console.log(`Eden shelter API running on http://localhost:${port}`);
  console.log(`Nearest shelters: http://localhost:${port}/api/shelters/nearest?lat=37.7749&lon=-122.4194`);
});

process.on("SIGTERM", async () => {
  await pool.end();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await pool.end();
  process.exit(0);
});


