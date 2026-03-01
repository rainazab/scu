#!/usr/bin/env python3
"""Import DV shelter seed data from CSV into Eden PostgreSQL."""

import csv
import os
from datetime import datetime

import psycopg2

DB_CONFIG = {
    "dbname": os.getenv("DB_NAME", "eden_db"),
    "user": os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD", "postgres"),
    "host": os.getenv("DB_HOST", "localhost"),
    "port": os.getenv("DB_PORT", "5432"),
}


def parse_bool(value: str) -> bool:
    return str(value).strip().lower() in {"true", "1", "yes", "y"}


def parse_languages(value: str) -> list[str]:
    if not value:
        return ["English"]
    return [v.strip() for v in value.split("|") if v.strip()]


def parse_timestamp(value: str):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def import_csv_to_db(csv_file: str) -> None:
    conn = None
    inserted = 0
    skipped = 0

    try:
        print(f"Connecting to database {DB_CONFIG['dbname']}...")
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()

        print(f"Reading CSV file: {csv_file}")
        with open(csv_file, "r", encoding="utf-8") as f:
            rows = csv.DictReader(f)
            for row in rows:
                try:
                    shelter_name = row.get("shelter_name", "").strip()
                    city = row.get("city", "").strip()
                    state = row.get("state", "").strip()
                    latitude = float(row.get("latitude", ""))
                    longitude = float(row.get("longitude", ""))

                    if not shelter_name or not city or not state:
                        skipped += 1
                        continue

                    cursor.execute(
                        """
                        INSERT INTO shelters (
                            url, shelter_name, description, address, city, state, zipcode,
                            intake_phone, bed_count, available_beds, accepts_children,
                            accepts_pets, languages_spoken, last_verified_at,
                            coordinates, latitude, longitude
                        )
                        VALUES (
                            %s, %s, %s, %s, %s, %s, %s,
                            %s, %s, %s, %s,
                            %s, %s, %s,
                            ST_GeogFromText(%s), %s, %s
                        )
                        """,
                        (
                            row.get("url", "").strip() or None,
                            shelter_name,
                            row.get("description", "").strip() or None,
                            row.get("address", "").strip() or None,
                            city,
                            state,
                            row.get("zipcode", "").strip() or None,
                            row.get("intake_phone", "").strip() or None,
                            int(row.get("bed_count", "0") or 0),
                            int(row.get("available_beds", "0") or 0),
                            parse_bool(row.get("accepts_children", "")),
                            parse_bool(row.get("accepts_pets", "")),
                            parse_languages(row.get("languages_spoken", "")),
                            parse_timestamp(row.get("last_verified_at", "")),
                            f"POINT({longitude} {latitude})",
                            latitude,
                            longitude,
                        ),
                    )
                    inserted += 1
                except Exception as row_error:
                    print(f"Skipping row due to error: {row_error}")
                    skipped += 1

        conn.commit()
        cursor.execute("SELECT COUNT(*) FROM shelters")
        total = cursor.fetchone()[0]
        cursor.close()

        print("\nImport complete.")
        print(f"Inserted: {inserted}")
        print(f"Skipped: {skipped}")
        print(f"Total rows in shelters table: {total}")

    except Exception as error:
        print(f"Error: {error}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    csv_file = "data/shelters_seed.csv"
    # import_csv_to_db(csv_file)  # Commented out for testing - use EDEN_TEST_SHELTER_PHONE instead

