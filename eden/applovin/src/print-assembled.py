#!/usr/bin/env python3
from assembler import assemble_sql
from inputs import queries

def main():
    for i, q in enumerate(queries, 1):
        print(f"--- Query {i} ---")
        print(assemble_sql(q))
        print()

if __name__ == "__main__":
    main()