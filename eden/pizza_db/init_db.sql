-- Create database (run this separately if needed)
-- CREATE DATABASE pizza_db;

-- Connect to the database and enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create the pizza_locations table
DROP TABLE IF EXISTS pizza_locations;

CREATE TABLE pizza_locations (
    id SERIAL PRIMARY KEY,
    url TEXT,
    name VARCHAR(255),
    description TEXT,
    is_chain BOOLEAN,
    cheese_pizza_price DECIMAL(10, 2),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(10),
    zipcode VARCHAR(20),
    coordinates GEOGRAPHY(POINT, 4326),
    latitude DECIMAL(10, 7),
    longitude DECIMAL(11, 7),
    phone_number VARCHAR(50),
    shop_rating DECIMAL(3, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create a spatial index for efficient geospatial queries
CREATE INDEX idx_pizza_locations_coordinates ON pizza_locations USING GIST(coordinates);

-- Create additional indexes for common queries
CREATE INDEX idx_pizza_locations_name ON pizza_locations(name);
CREATE INDEX idx_pizza_locations_rating ON pizza_locations(shop_rating DESC);

