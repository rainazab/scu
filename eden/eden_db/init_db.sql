-- Create database (run this separately if needed)
-- CREATE DATABASE eden_db;

-- Connect to the database and enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create the shelters table
DROP TABLE IF EXISTS shelters;

CREATE TABLE shelters (
    id SERIAL PRIMARY KEY,
    url TEXT,
    shelter_name VARCHAR(255) NOT NULL,
    description TEXT,
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(10),
    zipcode VARCHAR(20),
    intake_phone VARCHAR(50),
    bed_count INTEGER,
    available_beds INTEGER DEFAULT 0,
    accepts_children BOOLEAN DEFAULT FALSE,
    accepts_pets BOOLEAN DEFAULT FALSE,
    languages_spoken TEXT[] DEFAULT ARRAY[]::TEXT[],
    last_verified_at TIMESTAMP,
    coordinates GEOGRAPHY(POINT, 4326),
    latitude DECIMAL(10, 7),
    longitude DECIMAL(11, 7),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create a spatial index for efficient geospatial queries
CREATE INDEX idx_shelters_coordinates ON shelters USING GIST(coordinates);

-- Create additional indexes for common queries
CREATE INDEX idx_shelters_name ON shelters(shelter_name);
CREATE INDEX idx_shelters_available_beds ON shelters(available_beds DESC);
CREATE INDEX idx_shelters_last_verified_at ON shelters(last_verified_at DESC);

