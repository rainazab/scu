import os
import sys
import subprocess
import csv
import argparse
import tempfile
import numpy as np
import shutil
import glob
from inputs import queries

def parse_float(s: str):
    try:
        return float(s), True
    except Exception:
        return None, False

def values_close(a: str, b: str, abs_tol: float = 1e-6, rel_tol: float = 1e-9) -> bool:
    av, a_is_num = parse_float(a)
    bv, b_is_num = parse_float(b)
    if a_is_num and b_is_num:
        # Both values numeric: compare with tolerance
        return abs(av - bv) <= max(abs_tol, rel_tol * max(abs(av), abs(bv)))
    # Fallback to exact string match
    return a == b

def rows_equal(row, expected_row) -> bool:
    if len(row) != len(expected_row):
        return False
    for i in range(len(row)):
        if not values_close(row[i], expected_row[i]):
            return False
    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run benchmark and validate results")
    parser.add_argument("mode", choices=["lite", "full"], help="Which dataset to run against")
    parser.add_argument("--runs", type=int, default=1, help="How many runs to perform")
    parser.add_argument("--skip-preprocessing", action="store_true", help="Skip the first run's preprocessing (e.g. if the code hasn't changed since last benchmark)")
    args = parser.parse_args()

    data_type = args.mode
    
    data_dir = f"../data-{data_type}"
    
    # Create tmp directory
    tmp_dir = "tmp"

    all_times = []
    for run in range(1, args.runs + 1):
        # Execute queries in main.py
        if args.skip_preprocessing or run > 1:
            pattern = "tmp/*.csv"
            files_to_delete = glob.glob(pattern)
            for file_path in files_to_delete:
                os.remove(file_path)
            maybe_skip_preprocessing = ["--skip-preprocessing"]
        else:
            print("Running preprocessing")
            shutil.rmtree(tmp_dir, ignore_errors=True)
            os.mkdir(tmp_dir)
            maybe_skip_preprocessing = []
        process = subprocess.run(
            ["python3", "main.py", "--data-dir", data_dir, "--out-dir", tmp_dir] + maybe_skip_preprocessing,
            check=True,
            capture_output=True,
            text=True)
        main_output = process.stdout.splitlines()
        # Remove "\nSummary:\n" and "Total time: ..."
        times = [float(line.split(' ')[1][:-1]) for line in main_output[2:-1]]
        all_times.append(times)

        # Check results
        for i in range(1, len(queries) + 1):
            tmp_dir_csv = f"{tmp_dir}/q{i}.csv"
            expected_csv = f"../results-{data_type}/q{i}.csv"

            with open(tmp_dir_csv, "r") as f:
                with open(expected_csv, "r") as expected:
                    reader = csv.reader(f)
                    expected_reader = csv.reader(expected)

                    # This would not catch a bug where we didn't respect ORDER BY,
                    # but queries with ORDER BY are still tolerant to some reordering
                    # (between rows with the same value for the ORDER BY column) and
                    # that is annoying to check.

                    # Remove the first row since it is the column names before sorting
                    all_rows = [row for row in reader]
                    all_expected_rows = [row for row in expected_reader]
                    rows = sorted(all_rows[1:])
                    expected_rows = sorted(all_expected_rows[1:])

                    if len(rows) == len(expected_rows):
                        for idx, (row, exp_row) in enumerate(zip(rows, expected_rows)):
                            if not rows_equal(row, exp_row):
                                print(f"Query {i} Row {idx} failed: Mismatch at row {idx}:\n  got     = {row}\n  expected= {exp_row}")
                                raise Exception("Row mismatch")
                    else:
                        print(f"Query {i} failed: row count {len(rows)} != expected {len(expected_rows)}")
                        raise Exception("Row number mismatch")
        print(f"Run {run} passed, total {np.sum(times):.3f}s")

    print(f"Results from {args.runs} {"run" if args.runs == 1 else "runs"}:")
    for i in range(len(queries)):
        this_query_times = np.array([run_times[i] for run_times in all_times])
        avg = np.mean(this_query_times)
        min = this_query_times.min()
        max = this_query_times.max()
        print(f"Q{i}: average {avg:.3f}s\tmin {min:.3f}s\tmax {max:.3f}s")
    total_times = np.sum(all_times, axis=1)
    avg = np.mean(total_times)
    min = total_times.min()
    max = total_times.max()
    print(f"Stats of the total times: average {avg:.3f}s\tmin {min:.3f}s\tmax {max:.3f}s")
