# Asbemble JSON query to SQL
# Note -- your solution may or may
# not need to use something similar depending on how you
# do query scheduling

def optimize_bid_price_or_impression_count_query_prefixes(q):
    """
    Constructs queries that only aggregate on bid_price or counts impressions
    for prefix sum optimization.
    """
    raise NotImplementedError 

    select = q.get("select", [])
    where = q.get("where", [])
    group_by = q.get("group_by", [])
    order_by = q.get("order_by", [])
    temporals = ["minute", "hour", "day", "week"]

    has_only_impression_and_temporal_filter = False
    optimized_where = []
    for cond in where:
        if cond.get("col") == "type" and cond.get("op") == "eq" and cond.get("val") == "impression":
            has_only_impression_and_temporal_filter = True
        elif cond.get("col") in temporals:
            optimized_where.append(cond)    
            # Check that the condition
            if cond.get("op") == "between":
                pass
            elif cond.get("op") == "neq":
                pass
            elif cond.get("op") == "eq":
                pass
            elif cond.get("op") == "gt":
                pass
            elif cond.get("op") == "gte":
                pass
            elif cond.get("op") == "lt":
                pass
            elif cond.get("op") == "lte":
                pass
            else:
                has_only_impression_and_temporal_filter = False
                break
        else:
            has_only_impression_and_temporal_filter = False
            break

    if not has_only_impression_and_temporal_filter:
        # print("WHERE clause must filter for impressions and nothing else except optionally temporal columns")
        return False

    # GROUP BY must either be a temporal column or absent
    has_temporal_or_absent_group_by = (
        len(group_by) == 0 or
        (len(group_by) == 1 and group_by[0] in temporals)
    )
    if not has_temporal_or_absent_group_by:
        # print("GROUP BY must either be a temporal column or absent")
        return False

    # ORDER BY must be on a temporal column or absent
    has_temporal_or_no_order_by = (
        len(order_by) == 0 or
        (len(order_by) == 1 and order_by[0].get("col") in temporals)
    )
    if not has_temporal_or_no_order_by:
        # print("ORDER BY must be on a temporal column or absent")
        return False

    # Check aggregations in SELECT
    # Only aggregations (AVG or SUM) on bid_price or COUNT(*) or temporals
    optimized_select = []
    for item in select:
        if isinstance(item, dict):
            for func, col in item.items():
                # We can answer COUNT(*) since we know we are filtering for impressions only
                if col == "*" and func.upper() == "COUNT":
                    optimized_select.append('COUNT(count_impressions) AS "count_star()"')

                # Allow any aggregation on bid_price
                elif col == "bid_price" and func.upper() == "SUM":
                    optimized_select.append('SUM(sum_bid_price) AS "sum(bid_price)"')
                elif col == "bid_price" and func.upper() == "AVG":
                    optimized_select.append('SUM(sum_bid_price) / SUM(count_impressions) AS "avg(bid_price)"')

                # Reject other aggregations
                else:
                    # print("SELECT must be a single aggregation on bid_price or COUNT(*) or a temporal column")
                    return False
        elif isinstance(item, str):
            if item in temporals:
                optimized_select.append(item)
            else:
                # print("SELECT must be a single aggregation on bid_price or COUNT(*) or a temporal column")
                return False

    # If we get here, the query can be executed with our optimized path
    select_sql = _select_to_sql(optimized_select)
    specialized_tbl = "events_bids_minutes"
    where_sql = _where_to_sql(optimized_where)
    group_by_sql = _group_by_to_sql(group_by)
    order_by_sql = _order_by_to_sql(order_by)
    sql = f"SELECT {select_sql} FROM {specialized_tbl} {where_sql} {group_by_sql} {order_by_sql}"
    if q.get("limit"):
        sql += f" LIMIT {q['limit']}"
    return sql.strip()


def optimize_bid_price_or_impression_count_query(q):
    """
    Constructs queries that only aggregate on bid_price or counts impressions
    for optimization.
    """
    select = q.get("select", [])
    where = q.get("where", [])
    group_by = q.get("group_by", [])
    order_by = q.get("order_by", [])
    temporals = ["minute", "hour", "day", "week"]

    has_only_impression_and_temporal_filter = False
    optimized_where = []
    for cond in where:
        if cond.get("col") == "type" and cond.get("op") == "eq" and cond.get("val") == "impression":
            has_only_impression_and_temporal_filter = True
        elif cond.get("col") in temporals:
            optimized_where.append(cond)
        else:
            has_only_impression_and_temporal_filter = False
            break

    if not has_only_impression_and_temporal_filter:
        # print("WHERE clause must filter for impressions and nothing else except optionally temporal columns")
        return False

    # GROUP BY must either be a temporal column or absent
    has_temporal_or_absent_group_by = (
        len(group_by) == 0 or
        (len(group_by) == 1 and group_by[0] in temporals)
    )
    if not has_temporal_or_absent_group_by:
        # print("GROUP BY must either be a temporal column or absent")
        return False

    # ORDER BY must be on a temporal column or absent
    has_temporal_or_no_order_by = (
        len(order_by) == 0 or
        (len(order_by) == 1 and order_by[0].get("col") in temporals)
    )
    if not has_temporal_or_no_order_by:
        # print("ORDER BY must be on a temporal column or absent")
        return False

    # Check aggregations in SELECT
    # Only aggregations (AVG or SUM) on bid_price or COUNT(*) or temporals
    optimized_select = []
    for item in select:
        if isinstance(item, dict):
            for func, col in item.items():
                # We can answer COUNT(*) since we know we are filtering for impressions only
                if col == "*" and func.upper() == "COUNT":
                    optimized_select.append('SUM(count_impressions) AS "count_star()"')

                # Allow any aggregation on bid_price
                elif col == "bid_price" and func.upper() == "SUM":
                    optimized_select.append('SUM(sum_bid_price) AS "sum(bid_price)"')
                elif col == "bid_price" and func.upper() == "AVG":
                    optimized_select.append('SUM(sum_bid_price) / SUM(count_impressions) AS "avg(bid_price)"')

                # Reject other aggregations
                else:
                    # print("SELECT must be a single aggregation on bid_price or COUNT(*) or a temporal column")
                    return False
        elif isinstance(item, str):
            if item in temporals:
                optimized_select.append(item)
            else:
                # print("SELECT must be a single aggregation on bid_price or COUNT(*) or a temporal column")
                return False

    # If we get here, the query can be executed with our optimized path
    select_sql = _select_to_sql(optimized_select)
    specialized_tbl = "events_bids_minutes"
    where_sql = _where_to_sql(optimized_where)
    group_by_sql = _group_by_to_sql(group_by)
    order_by_sql = _order_by_to_sql(order_by)
    sql = f"SELECT {select_sql} FROM {specialized_tbl} {where_sql} {group_by_sql} {order_by_sql}"
    return sql.strip()


def assemble_sql(q, dark_launch=False):
    # check if query is optimized
    if dark_launch:
        optimized_sql = optimize_bid_price_or_impression_count_query(q)
        if optimized_sql:
            return optimized_sql.strip()

    select_sql = _select_to_sql(q.get("select", []))
    from_tbl = q["from"]
    where_sql = _where_to_sql(q.get("where"))
    group_by_sql = _group_by_to_sql(q.get("group_by"))
    order_by_sql = _order_by_to_sql(q.get("order_by"))
    sql = f"SELECT {select_sql} FROM {from_tbl} {where_sql} {group_by_sql} {order_by_sql}"
    return sql.strip()


def _val_to_sql(col, op, val):
    def quote(val):
        if col == "type":
            return f"'{val}'::event_type"
        elif col == "country":
            return f"COUNTRY_TO_INT('{val}')"
        else:
            return f"'{val}'"
    match op:
        case "eq" | "neq":
            return quote(val)
        case "lt" | "lte" | "gt" | "gte":
            if col == "type":
                # This is a deviation from the baseline. If you gave the baseline
                # one of these ops it would put val directly into the SQL. But this
                # was a bug anyway for col == "type" since type *was* a VARCHAR and
                # its vals needed to be quoted.
                return quote(val)
            return val
        case "between":
            low, high = val
            return quote(low) + " AND " + quote(high)
        case "in":
            comma_separated = ", ".join(quote(v) for v in val)
            return f"({comma_separated})"


def _where_to_sql(where):
    if not where:
        return ""
    parts = []
    for cond in where:
        col, op, val = cond["col"], cond["op"], cond["val"]
        val_sql = _val_to_sql(col, op, val)
        if op == "eq":
            parts.append(f"{col} = {val_sql}")
        if op == "neq":
            parts.append(f"{col} != {val_sql}")
        elif op in ("lt", "lte", "gt", "gte"):
            sym = {"lt": "<", "lte": "<=", "gt": ">", "gte": ">="}[op]
            parts.append(f"{col} {sym} {val_sql}")
        elif op == "between":
            parts.append(f"{col} BETWEEN {val_sql}")
        elif op == "in":
            parts.append(f"{col} IN {val_sql}")
    return "WHERE " + " AND ".join(parts)


def _select_to_sql(select):
    parts = []
    for item in select:
        if isinstance(item, str):
            if item == "minute":
                parts.append("STRFTIME(minute, '%Y-%m-%d %H:%M') AS minute")
            elif item == "country":
                parts.append("INT_TO_COUNTRY(country) AS country")
            else:
                parts.append(item)
        elif isinstance(item, dict):
            for func, col in item.items():
                parts.append(f"{func.upper()}({col})")
    return ", ".join(parts)


def _group_by_to_sql(group_by):
    if not group_by: return ""
    return "GROUP BY " + ", ".join(group_by)


def _order_by_to_sql(order_by):
    if not order_by: return ""
    parts = [f"{o['col']} {o.get('dir', 'asc').upper()}" for o in order_by]
    return "ORDER BY " + ", ".join(parts)
