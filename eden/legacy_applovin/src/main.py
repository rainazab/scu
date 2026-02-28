#!/usr/bin/env python3
"""
DuckDB Baseline Benchmark Demo
------------------------------

Reads data from a given folder (CSV or Parquet),
adds derived day/minute columns,
executes JSON queries, and reports timings.

Usage:
  python main.py --data-dir ./data --out-dir ./out
"""

import duckdb
import time
from pathlib import Path
import csv
import argparse
import sys
from assembler import assemble_sql
from inputs import queries, extended_queries, aggregate_test_queries
import numpy as np
# from judges import queries


# -------------------
# Configuration
# -------------------
DB_PATH = Path("tmp/baseline.duckdb")
TABLE_NAME = "events"


# -------------------
# Load Data
# -------------------
def load_one_csv(con, csv_path: Path):
    con.execute(f"""
        WITH raw AS (
          SELECT *
          FROM read_csv(
            '{csv_path}',
            AUTO_DETECT = FALSE,
            HEADER = TRUE,
            union_by_name = TRUE,
            COLUMNS = {{
              'ts': 'VARCHAR',
              'type': 'VARCHAR',
              'auction_id': 'VARCHAR',
              'advertiser_id': 'VARCHAR',
              'publisher_id': 'VARCHAR',
              'bid_price': 'VARCHAR',
              'user_id': 'VARCHAR',
              'total_price': 'VARCHAR',
              'country': 'VARCHAR'
            }}
          )
        ),
        casted AS (
          SELECT
            to_timestamp(TRY_CAST(ts AS DOUBLE) / 1000.0)    AS ts,
            type::event_type                          AS type,
            auction_id::UUID                          AS auction_id,
            TRY_CAST(advertiser_id AS INTEGER)        AS advertiser_id,
            TRY_CAST(publisher_id  AS INTEGER)        AS publisher_id,
            NULLIF(bid_price, '')::DOUBLE             AS bid_price,
            TRY_CAST(user_id AS BIGINT)               AS user_id,
            NULLIF(total_price, '')::DOUBLE           AS total_price,
            COUNTRY_TO_INT(country)                   AS country,
          FROM raw
        )
        INSERT INTO {TABLE_NAME}_unsorted
        SELECT
          ts,
          DATE_TRUNC('week', ts)   AS week,
          DATE(ts)                 AS day,
          DATE_TRUNC('hour', ts)   AS hour,
          DATE_TRUNC('minute', ts) AS minute,
          type,
          auction_id,
          advertiser_id,
          publisher_id,
          bid_price,
          user_id,
          total_price,
          country
        FROM casted;
    """)

def load_data(con, data_dir: Path):
    csv_files = list(data_dir.glob("events_part_*.csv"))

    if csv_files:
        print(f"🟩 Loading {len(csv_files)} CSV parts from {data_dir} ...", file=sys.stderr)
        # Alphabetical order to match VARCHAR comparison/ordering
        con.execute(f"""
            DROP TYPE IF EXISTS event_type;
            CREATE TYPE event_type AS ENUM ('click', 'impression', 'serve', 'purchase');
        """)
        # Custom country code encoding that takes advantage of ISO 3166-1 alpha-2
        con.execute(f"""
            CREATE OR REPLACE MACRO COUNTRY_TO_INT(country) AS (ascii(country[1]) - 65) * 26 + ascii(country[2]) - 65;
            CREATE OR REPLACE MACRO INT_TO_COUNTRY(i) AS CONCAT(chr(i // 26 + 65), chr(i % 26 + 65));
        """)
        # TODO timestamp with tz or not?
        con.execute(f"""
            CREATE OR REPLACE TABLE {TABLE_NAME}_unsorted (
              ts TIMESTAMP,
              week DATE,
              day DATE,
              hour TIMESTAMP,
              minute TIMESTAMP,
              type event_type,
              auction_id UUID,
              advertiser_id INTEGER,
              publisher_id INTEGER,
              bid_price DOUBLE,
              user_id BIGINT,
              total_price DOUBLE,
              country USMALLINT);
        """)
        con.execute("SET preserve_insertion_order = false;")
        for csv_path in sorted(csv_files):
            print(f"  - Loading {csv_path} ...", file=sys.stderr)
            load_one_csv(con, csv_path)
        con.execute("SET preserve_insertion_order = true;")

        print(f"🟩 Loading complete", file=sys.stderr)
        print(f"🟩 Sorting ...", file=sys.stderr)
        # We have thought about ordering by something more granular
        # than ts and secondly sort by something else, but there are
        # no good columns that we think would benefit from being in
        # the zonemap because they are either too common (type) or
        # too random (ids).
        con.execute(f"""
            CREATE OR REPLACE TABLE {TABLE_NAME} AS
            SELECT * FROM {TABLE_NAME}_unsorted
            ORDER BY ts;
        """)
        print(f"🟩 Sorting complete", file=sys.stderr)

        # Create temporally pre-grouped tables for faster queries
        # For queries that match
        # SELECT (aggregation on bid price)
        # FROM events
        # WHERE type = 'impression' AND temporals are coarser than minute granularity
        # GROUP BY (some time interval)
        # ORDER BY (any column in the pre-grouped table)
        con.execute(f"""
            CREATE OR REPLACE TABLE {TABLE_NAME}_bids_minutes AS
            SELECT
                minute,
                ANY_VALUE(hour) as hour,
                ANY_VALUE(day) as day,
                ANY_VALUE(week) as week,
                SUM(bid_price) AS sum_bid_price,
                SUM(CASE WHEN type = 'impression' THEN 1 ELSE 0 END) AS count_impressions,
            FROM {TABLE_NAME}
            GROUP BY minute
            HAVING count_impressions > 0;
        """)

        # Create a prefix sum table for EVEN faster queries brr
        # For queries that match the above condition
        con.execute(f"""
            CREATE OR REPLACE TABLE {TABLE_NAME}_bids_minutes_prefix AS
            WITH base AS (
                SELECT
                    minute,
                    ANY_VALUE(hour) as hour,
                    ANY_VALUE(day) as day,
                    ANY_VALUE(week) as week,
                    SUM(bid_price) AS sum_bid_price,
                    SUM(CASE WHEN type = 'impression' THEN 1 ELSE 0 END) AS count_impressions
                FROM {TABLE_NAME}
                GROUP BY minute
                HAVING count_impressions > 0
            ),
            with_zero AS (
                SELECT TIMESTAMP '1970-01-01 00:00:00' AS minute,
                       TIMESTAMP '1970-01-01 00:00:00' AS hour,
                       TIMESTAMP '1970-01-01 00:00:00' AS day,
                       TIMESTAMP '1970-01-01 00:00:00' AS week,
                       0.0 AS sum_bid_price,
                       0 AS count_impressions
                UNION ALL
                SELECT * FROM base
            )
            SELECT
                minute,
                hour,
                day,
                week,
                SUM(sum_bid_price) OVER (ORDER BY minute ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS prefix_sum_bid_price,
                SUM(count_impressions) OVER (ORDER BY minute ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS prefix_count_impressions,
                sum_bid_price,
                count_impressions
            FROM with_zero
            ORDER BY minute;
        """)

    else:
        raise FileNotFoundError(f"No events_part_*.csv found in {data_dir}")


# -------------------
# Run Queries
# -------------------
def run(queries, data_dir: Path, out_dir: Path, skip_preprocessing):
    # Ensure directories exist
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    out_dir.mkdir(parents=True, exist_ok=True)

    con = duckdb.connect(DB_PATH)
    con.execute("SET timezone = 'America/Los_Angeles';")
    if not skip_preprocessing:
        load_data(con, data_dir)

    con.close()
    con = duckdb.connect(DB_PATH, read_only=True)
    con.execute("SET timezone = 'America/Los_Angeles';")

    # Prevent coldstart by executing some sample queries
    for q in np.random.choice(extended_queries, size=25, replace=False):
        sql = assemble_sql(q)
        con.execute(sql)

    out_dir.mkdir(parents=True, exist_ok=True)
    results = []
    for i, q in enumerate(queries, 1):
        sql = assemble_sql(q, dark_launch=True)
        print(f"\n🟦 Query {i}:\n{q}\n", file=sys.stderr)
        t0 = time.time()
        res = con.execute(sql)
        cols = [d[0] for d in res.description]
        rows = res.fetchall()
        dt = time.time() - t0

        print(f"✅ Rows: {len(rows)} | Time: {dt:.3f}s", file=sys.stderr)

        out_path = out_dir / f"q{i}.csv"
        with out_path.open("w", newline="") as f:
            w = csv.writer(f)
            w.writerow(cols)
            w.writerows(rows)

        results.append({"query": i, "rows": len(rows), "time": dt})
    con.close()

    print("\nSummary:")
    for r in results:
        print(f"Q{r['query']}: {r['time']:.3f}s ({r['rows']} rows)")
    print(f"Total time: {sum(r['time'] for r in results):.3f}s")


# -------------------
# Main Entry Point
# -------------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="DuckDB Baseline Benchmark Demo — runs benchmark queries on input CSV data."
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        required=True,
        help="The folder where the input CSV is provided"
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        required=True,
        help="Where to output query results-full"
    )
    parser.add_argument(
        "--skip-preprocessing",
        action="store_true",
        help="Skip preprocessing and just run the queries"
    )

    args = parser.parse_args()
    run(queries, args.data_dir, args.out_dir, args.skip_preprocessing)
    # run(extended_queries, args.data_dir, args.out_dir, args.skip_preprocessing)
    # run(aggregate_test_queries, args.data_dir, args.out_dir, args.skip_preprocessing)
