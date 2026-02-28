#!/usr/bin/env python3
"""
Script to import pizza location data from CSV into PostgreSQL database
"""

import csv
import psycopg2
import re
import os
from decimal import Decimal

# Database connection parameters
DB_CONFIG = {
    'dbname': os.getenv('DB_NAME', 'pizza_db'),
    'user': os.getenv('DB_USER', 'postgres'),
    'password': os.getenv('DB_PASSWORD', 'postgres'),
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': os.getenv('DB_PORT', '5432')
}

def parse_address(address_str):
    """Parse address string into components"""
    if not address_str or address_str.strip() == '':
        return None, None, None, None
    
    # Address format: "2680 22nd St | San Francisco | CA | 94110"
    # Sometimes has extra text after zipcode, so we need to clean it
    parts = [p.strip() for p in address_str.split('|')]
    
    street = parts[0] if len(parts) > 0 else None
    city = parts[1] if len(parts) > 1 else None
    state = parts[2] if len(parts) > 2 else None
    zipcode_raw = parts[3] if len(parts) > 3 else None
    
    # Clean zipcode - take only the first word/number
    if zipcode_raw:
        # Split by whitespace or newline and take first part
        zipcode = zipcode_raw.split()[0] if zipcode_raw.split() else None
    else:
        zipcode = None
    
    full_address = f"{street}, {city}, {state} {zipcode}" if all([street, city, state, zipcode]) else address_str
    
    return full_address, city, state, zipcode

def parse_coordinates(coord_str):
    """Parse coordinates string into latitude and longitude"""
    if not coord_str or coord_str.strip() == '':
        return None, None
    
    # Coordinates format: "37.6879, -122.4702"
    parts = [p.strip() for p in coord_str.split(',')]
    
    if len(parts) == 2:
        try:
            lat = float(parts[0])
            lon = float(parts[1])
            return lat, lon
        except ValueError:
            return None, None
    
    return None, None

def parse_price(price_str):
    """Parse price string into decimal"""
    if not price_str or price_str.strip() == '':
        return None
    
    # Remove dollar sign and any whitespace
    price_str = price_str.replace('$', '').strip()
    
    try:
        return Decimal(price_str)
    except:
        return None

def parse_rating(rating_str):
    """Parse rating string into decimal"""
    if not rating_str or rating_str.strip() == '':
        return None
    
    try:
        return Decimal(rating_str)
    except:
        return None

def import_csv_to_db(csv_file):
    """Import CSV data into PostgreSQL database"""
    
    conn = None
    try:
        # Connect to database
        print(f"Connecting to database {DB_CONFIG['dbname']}...")
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # Read CSV file
        print(f"Reading CSV file: {csv_file}")
        with open(csv_file, 'r', encoding='utf-8') as f:
            csv_reader = csv.DictReader(f)
            
            insert_count = 0
            skip_count = 0
            
            for row in csv_reader:
                try:
                    # Extract data from CSV columns
                    url = row.get('URL', '').strip()
                    name = row.get('Title', '').strip()
                    description = row.get('Description', '').strip()
                    
                    # Check if it's a chain
                    is_chain_str = row.get('business is a pizza chain with at least one physical location in san francisco (Criterion)', '').strip().lower()
                    is_chain = is_chain_str == 'yes'
                    
                    # Parse price
                    price_str = row.get('Cheese Pizza Price (Result)', '').strip()
                    cheese_pizza_price = parse_price(price_str)
                    
                    # Parse address
                    address_str = row.get('Address (Result)', '').strip()
                    full_address, city, state, zipcode = parse_address(address_str)
                    
                    # Parse coordinates
                    coord_str = row.get('Coordinates (Result)', '').strip()
                    latitude, longitude = parse_coordinates(coord_str)
                    
                    # Parse phone - limit to 50 chars
                    phone_number = row.get('Phone Number (Result)', '').strip()
                    if len(phone_number) > 50:
                        phone_number = phone_number[:50]
                    
                    # Parse rating
                    rating_str = row.get('Shop Rating (Result)', '').strip()
                    shop_rating = parse_rating(rating_str)
                    
                    # Skip if no coordinates (required for geospatial queries)
                    if latitude is None or longitude is None:
                        skip_count += 1
                        continue
                    
                    # Insert into database
                    cursor.execute("""
                        INSERT INTO pizza_locations 
                        (url, name, description, is_chain, cheese_pizza_price, 
                         address, city, state, zipcode, coordinates, latitude, longitude,
                         phone_number, shop_rating)
                        VALUES 
                        (%s, %s, %s, %s, %s, %s, %s, %s, %s, ST_GeogFromText(%s), %s, %s, %s, %s)
                    """, (
                        url,
                        name,
                        description,
                        is_chain,
                        cheese_pizza_price,
                        full_address,
                        city,
                        state,
                        zipcode,
                        f'POINT({longitude} {latitude})',  # PostGIS uses lon/lat order
                        latitude,
                        longitude,
                        phone_number,
                        shop_rating
                    ))
                    
                    insert_count += 1
                    
                except Exception as e:
                    print(f"Error processing row for {name}: {e}")
                    print(f"  Address: {address_str[:50] if address_str else 'None'}...")
                    print(f"  Zipcode: {zipcode}")
                    conn.rollback()  # Rollback the failed transaction
                    skip_count += 1
                    continue
            
            # Commit changes
            conn.commit()
            print(f"\nImport complete!")
            print(f"Inserted: {insert_count} records")
            print(f"Skipped: {skip_count} records")
            
            # Display sample data
            cursor.execute("SELECT COUNT(*) FROM pizza_locations")
            total = cursor.fetchone()[0]
            print(f"Total records in database: {total}")
            
            cursor.close()
            
    except Exception as e:
        print(f"Error: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()

if __name__ == '__main__':
    csv_file = 'webset-companies_sf_pizza_chains_cheese_pizza_price_address_coordinates_phone.csv'
    import_csv_to_db(csv_file)

