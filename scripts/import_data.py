#!/usr/bin/env python3
"""
Import WL raw.xlsx into PostgreSQL.
Extracts keyword, affiliate, utm fields, and other derived columns from landing page URLs.

Usage:
  python3 scripts/import_data.py
"""

import sys
import re
import datetime
from urllib.parse import urlparse, parse_qs

import openpyxl
import psycopg2
import psycopg2.extras

XLSX_PATH = "WL raw.xlsx"
DB_DSN = "host=localhost port=5434 dbname=wl_marketing user=wl_user password=wl_pass"


def parse_ts(val):
    """Convert unix timestamp (int or float) to datetime."""
    if val is None:
        return None
    try:
        return datetime.datetime.fromtimestamp(float(val), tz=datetime.timezone.utc)
    except Exception:
        return None


def safe_int(val):
    if val is None:
        return None
    try:
        return int(float(str(val).replace(",", "")))
    except Exception:
        return None


def safe_float(val):
    if val is None:
        return None
    try:
        return float(val)
    except Exception:
        return None


def extract_affiliate(conversion_type: str | None) -> str | None:
    """Extract affiliate name from conversion_type string."""
    if not conversion_type:
        return None
    affiliates = ["Medvi", "Ro", "SkinnyRX", "Sprout", "Eden", "Hers", "Remedy"]
    for a in affiliates:
        if a.lower() in conversion_type.lower():
            return a
    return None


def extract_funnel_step(raw_funnel: str | None, conversion_type: str | None) -> str | None:
    """Normalize funnel_step values."""
    if raw_funnel and str(raw_funnel).strip().lower() not in ("none", "other", "null"):
        fs = str(raw_funnel).strip()
        # Map common values
        mapping = {
            "quiz complete": "Quiz Complete",
            "purchase": "Purchase",
            "add to cart": "Add to Cart",
        }
        return mapping.get(fs.lower(), fs)
    # Infer from conversion_type
    if conversion_type:
        ct_lower = conversion_type.lower()
        if "quiz start" in ct_lower:
            return "Quiz Start"
        if "quiz complete" in ct_lower:
            return "Quiz Complete"
        if "purchase" in ct_lower:
            return "Purchase"
        if "add to cart" in ct_lower:
            return "Add to Cart"
        if "lead" in ct_lower:
            return "Lead"
    return "Other"


def parse_url_fields(landing_page: str | None) -> dict:
    """Extract keyword and utm fields from a landing page URL."""
    result = {
        "keyword": None,
        "utm_campaign": None,
        "utm_source": None,
        "utm_medium": None,
        "utm_term": None,
        "utm_content": None,
        "landing_page_path": None,
    }
    if not landing_page:
        return result
    try:
        parsed = urlparse(str(landing_page))
        result["landing_page_path"] = parsed.path or None
        qs = parse_qs(parsed.query)

        result["keyword"] = (
            qs.get("ap_keyword", [None])[0]
            or qs.get("keyword", [None])[0]
        )
        result["utm_campaign"] = qs.get("utm_campaign", [None])[0]
        result["utm_source"] = qs.get("utm_source", [None])[0]
        result["utm_medium"] = qs.get("utm_medium", [None])[0]
        result["utm_term"] = qs.get("utm_term", [None])[0]
        result["utm_content"] = qs.get("utm_content", [None])[0]
    except Exception:
        pass
    return result


def main():
    print(f"Loading {XLSX_PATH}...")
    wb = openpyxl.load_workbook(XLSX_PATH, read_only=True, data_only=True)
    ws = wb["Sheet1"]
    rows = list(ws.iter_rows(values_only=True))
    headers = list(rows[0])
    data = rows[1:]
    print(f"Loaded {len(data)} rows, {len(headers)} columns")

    # Build column index map
    col = {h: i for i, h in enumerate(headers)}

    print(f"Connecting to PostgreSQL...")
    conn = psycopg2.connect(DB_DSN)
    cur = conn.cursor()

    cur.execute("TRUNCATE TABLE conversions RESTART IDENTITY")
    conn.commit()

    INSERT_SQL = """
    INSERT INTO conversions (
      value, affiliate_value,
      conversion_at, entered_at,
      visit_id, edgetrackerid, gclid, msclkid, gbraid, wbraid, fbclid,
      analytics_id, fbc, fbp, seperia_id_rel,
      campaign_id, adgroup_id, target_id, creative, placement, extension_id, adtype,
      platform_id, network, device, device_model, carrier, match_type,
      loc_physical_ms, user_country, user_ip,
      conversion_type, funnel_step, affiliate,
      landing_page, landing_page_path, lpurl, lpurl_2, lpurl_3, dti, dbi,
      test_id, test_variant, edgetail,
      keyword, utm_campaign, utm_source, utm_medium, utm_term, utm_content,
      site_id, site_name, user_agent
    ) VALUES %s
    """

    batch = []
    BATCH_SIZE = 500
    inserted = 0

    for i, row in enumerate(data):
        def g(col_name):
            idx = col.get(col_name)
            return row[idx] if idx is not None else None

        landing_page = g("landing_page")
        url_fields = parse_url_fields(landing_page)
        conversion_type = g("conversion_type")
        raw_funnel = g("funnel_step")

        funnel_step = extract_funnel_step(str(raw_funnel) if raw_funnel else None, conversion_type)
        affiliate = extract_affiliate(conversion_type)

        # Parse funnel_step from the list string like "['quiz_start']"
        if raw_funnel and str(raw_funnel).startswith("["):
            items = re.findall(r"'([^']+)'", str(raw_funnel))
            if items:
                step_map = {
                    "quiz_start": "Quiz Start",
                    "quiz_complete": "Quiz Complete",
                    "purchase": "Purchase",
                    "add_to_cart": "Add to Cart",
                    "lead": "Lead",
                }
                funnel_step = step_map.get(items[-1].lower(), items[-1].title())

        record = (
            safe_float(g("value")),
            safe_float(g("affiliate_value")),
            parse_ts(g("conversion_at")),
            parse_ts(g("entered_at")),
            str(g("visit_id")) if g("visit_id") else None,
            safe_int(g("edgetrackerid")),
            str(g("gclid")) if g("gclid") else None,
            str(g("msclkid")) if g("msclkid") else None,
            str(g("gbraid")) if g("gbraid") else None,
            str(g("wbraid")) if g("wbraid") else None,
            str(g("fbclid")) if g("fbclid") else None,
            str(g("analytics_id")) if g("analytics_id") else None,
            str(g("fbc")) if g("fbc") else None,
            str(g("fbp")) if g("fbp") else None,
            str(g("seperia_id_rel")) if g("seperia_id_rel") else None,
            safe_int(g("campaign_id")),
            safe_int(g("adgroup_id")),
            str(g("target_id")) if g("target_id") else None,
            safe_int(g("creative")),
            str(g("placement")) if g("placement") else None,
            str(g("extension_id")) if g("extension_id") else None,
            str(g("adtype")) if g("adtype") else None,
            str(g("platform_id")) if g("platform_id") else None,
            str(g("network")) if g("network") else None,
            str(g("device")) if g("device") else None,
            str(g("device_model")) if g("device_model") else None,
            str(g("carrier")) if g("carrier") else None,
            str(g("match_type")) if g("match_type") else None,
            safe_int(g("loc_physical_ms")),
            str(g("user_country")) if g("user_country") else None,
            str(g("user_ip")) if g("user_ip") else None,
            str(conversion_type) if conversion_type else None,
            funnel_step,
            affiliate,
            str(landing_page) if landing_page else None,
            url_fields["landing_page_path"],
            str(g("lpurl")) if g("lpurl") else None,
            str(g("lpurl_2")) if g("lpurl_2") else None,
            str(g("lpurl_3")) if g("lpurl_3") else None,
            str(g("dti")) if g("dti") else None,
            str(g("dbi")) if g("dbi") else None,
            str(g("test_id")) if g("test_id") else None,
            str(g("test_variant")) if g("test_variant") else None,
            str(g("edgetail")) if g("edgetail") else None,
            url_fields["keyword"],
            url_fields["utm_campaign"],
            url_fields["utm_source"],
            url_fields["utm_medium"],
            url_fields["utm_term"],
            url_fields["utm_content"],
            str(g("site_id")) if g("site_id") else None,
            str(g("site_name")) if g("site_name") else None,
            str(g("user_agent")) if g("user_agent") else None,
        )
        batch.append(record)

        if len(batch) >= BATCH_SIZE:
            psycopg2.extras.execute_values(cur, INSERT_SQL, batch)
            conn.commit()
            inserted += len(batch)
            print(f"  Inserted {inserted}/{len(data)} rows...")
            batch = []

    if batch:
        psycopg2.extras.execute_values(cur, INSERT_SQL, batch)
        conn.commit()
        inserted += len(batch)

    print(f"Done! Inserted {inserted} rows total.")

    # Quick summary
    cur.execute("SELECT COUNT(*), SUM(value), COUNT(*) FILTER (WHERE funnel_step = 'Purchase') FROM conversions")
    total, revenue, purchases = cur.fetchone()
    print(f"Summary: {total} events, ${revenue:,.0f} revenue, {purchases} purchases")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
