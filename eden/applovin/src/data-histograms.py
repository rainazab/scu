import duckdb
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np

def histogram_events_by_time_block(time_block):
    con = duckdb.connect(database='tmp/baseline.duckdb')
    con.execute("SET timezone = 'America/Los_Angeles';")

    # Get the histogram data
    histogram_data = con.execute(f"WITH counts AS (SELECT COUNT(*) AS count FROM events GROUP BY {time_block}) SELECT HISTOGRAM(count) FROM counts;").fetchone()[0]

    # Extract bins and counts for plotting
    bins = list(histogram_data.keys())
    counts = list(histogram_data.values())

    # Sort by bin value for correct plotting order
    sorted_data = sorted(zip(bins, counts))
    sorted_bins = [item[0] for item in sorted_data]
    sorted_counts = [item[1] for item in sorted_data]

    # Plot the histogram
    plt.bar(sorted_bins, sorted_counts, width=0.8, align='center')
    plt.xlabel("Number of events")
    plt.ylabel(f"Number of {time_block}s with that many events")
    plt.title(f"Histogram of Counts in each {time_block}")
    plt.savefig(f"plots/frequencies_of_{time_block}s_by_event_count.png")
    plt.close()

    con.close()


def histogram_events_over_time(time_block):
    con = duckdb.connect(database='tmp/baseline.duckdb')
    con.execute("SET timezone = 'America/Los_Angeles';")
    query = f"""
    SELECT
        {time_block} AS which,
        COUNT(*) AS count
    FROM
        events
    GROUP BY
        {time_block}
    ORDER BY
        {time_block};
    """
    df = con.execute(query).fetchdf()
    con.close()

    # Plotting with Seaborn and Matplotlib
    plt.figure(figsize=(10, 6))
    sns.lineplot(x='which', y='count', data=df)
    plt.title('Number of Events Over Time')
    plt.xlabel(time_block)
    plt.ylabel('Number of events')
    plt.xticks(rotation=45)
    plt.tight_layout()
    plt.savefig(f"plots/events_over_each_{time_block}.png")
    plt.close()

histogram_events_by_time_block("minute")
histogram_events_by_time_block("hour")

histogram_events_over_time("week")
histogram_events_over_time("day")
histogram_events_over_time("hour")
