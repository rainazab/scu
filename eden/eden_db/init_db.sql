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

-- Persistent runtime state tables (Phase 5A)
CREATE TABLE IF NOT EXISTS call_jobs (
    job_id UUID PRIMARY KEY,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    survivor_context TEXT NOT NULL,
    callback_number TEXT,
    anonymous_mode BOOLEAN DEFAULT FALSE,
    escalation_approved BOOLEAN DEFAULT FALSE,
    shelter_ids INTEGER[] NOT NULL,
    attempts JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS warm_transfers (
    transfer_id UUID PRIMARY KEY,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    conference_name TEXT NOT NULL,
    job_id UUID NOT NULL,
    attempt_id UUID NOT NULL,
    shelter_name TEXT NOT NULL,
    shelter_phone TEXT NOT NULL,
    survivor_phone TEXT NOT NULL,
    survivor_name TEXT,
    notes TEXT,
    call_sids JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS escalation_events (
    escalation_id UUID PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL,
    source TEXT NOT NULL,
    reference_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    details TEXT
);

CREATE TABLE IF NOT EXISTS blocked_numbers (
    phone TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_jobs_updated_at ON call_jobs(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_warm_transfers_updated_at ON warm_transfers(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_escalation_events_created_at ON escalation_events(created_at DESC);

