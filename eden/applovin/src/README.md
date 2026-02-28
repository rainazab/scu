## Usage

Install requirements with `pip install -r requirements.txt`

To change the queries, edit `queries` in `inputs.py` to your desired list.

Run with

```
 python3 main.py --data-dir <data directory> --out-dir <directory to store outputs>
```

You can optionally pass `--skip-preprocessing` to bypass `main.py`'s
preprocessing work. This is useful for averaging query times. For more
full-featured benchmarking we created `benchmark.py`, which you can run with

```
 python3 benchmark.py lite|full [--skip-preprocessing] [--runs N]
```

This reports min, max, and average timing for each query's time distribution,
and also for the total. Preprocessing is automatically skipped for every run
but the first (and the first may be skipped by the presence of
`--skip-preprocessing`).
