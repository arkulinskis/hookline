"""Analytics without scraping: people download their own analytics from LinkedIn (Analytics -> Export) and drop the
file into Hookline. The browser reads the XLSX/CSV (web/pages/insights.html) and sends a small summary here.
LinkedIn's member analytics API needs LinkedIn's approval for companies, so this is the honest route.
"""
import re

import anvil.server
from anvil.tables import app_tables
import anvil.tables as tables

from . import common as C

DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _n(v):
    try:
        return max(0, int(float(v)))
    except (TypeError, ValueError):
        return 0


def latest_for(user):
    rows = app_tables.imports.search(tables.order_by("created", ascending=False), owner=user, kind="linkedin_export")
    if not len(rows):
        return None
    r = rows[0]
    d = dict(r["data"] or {})
    d["imported"] = C.iso(r["created"])
    d["example"] = bool(r["is_demo"])
    return d


def clean_summary(data):
    data = data if isinstance(data, dict) else {}
    daily = []
    for x in (data.get("daily") or [])[:400]:
        if isinstance(x, dict) and DATE.match(str(x.get("date") or "")):
            daily.append({"date": x["date"], "impressions": _n(x.get("impressions")), "engagements": _n(x.get("engagements"))})
    top = []
    for x in (data.get("top") or [])[:100]:
        if not isinstance(x, dict):
            continue
        url = C.text(x.get("url"), 400)
        top.append({"url": url if url.startswith("https://") else "", "date": C.text(x.get("date"), 10),
                    "impressions": _n(x.get("impressions")), "engagements": _n(x.get("engagements"))})
    followers = []
    for x in (data.get("followers") or [])[:400]:
        if isinstance(x, dict) and DATE.match(str(x.get("date") or "")):
            followers.append({"date": x["date"], "new": _n(x.get("new"))})
    demo = []
    for x in (data.get("demographics") or [])[:60]:
        if isinstance(x, dict):
            try:
                pct = max(0.0, min(100.0, float(x.get("pct") or 0)))
            except (TypeError, ValueError):
                pct = 0.0
            demo.append({"category": C.text(x.get("category"), 40), "value": C.text(x.get("value"), 80), "pct": round(pct, 1)})
    return {"daily": sorted(daily, key=lambda x: x["date"]), "top": top, "followers": sorted(followers, key=lambda x: x["date"]),
            "followers_total": _n(data.get("followers_total")), "demographics": demo,
            "source": C.text(data.get("source"), 80)}


@anvil.server.callable(require_user=True)
def import_analytics(data):
    """Save a summary of a LinkedIn analytics export; fill in impressions on matching posts. Returns what matched."""
    me = C.require_user()
    if C.rate_limited("import", 20, 3600):
        return C.fail("Too many imports in an hour. Try again later.")
    s = clean_summary(data)
    if not s["daily"] and not s["top"]:
        return C.fail("That file had no impressions or posts in it. Use LinkedIn's Analytics -> Export (XLSX), or a CSV with dates and impressions.")
    app_tables.imports.add_row(owner=me, kind="linkedin_export", data=s, created=C.now(), is_demo=False)
    matched = 0
    posts = [p for p in app_tables.posts.search(owner=me) if p["url"]]
    for t in s["top"]:
        if not t["url"]:
            continue
        key = _activity(t["url"])
        for p in posts:
            if key and key == _activity(p["url"]):
                m = dict(p["metrics"] or {})
                m["impressions"] = max(m.get("impressions", 0), t["impressions"])
                if t["engagements"]:
                    m["engagements"] = max(m.get("engagements", 0), t["engagements"])
                p["metrics"] = m
                matched += 1
    return C.ok(analytics=latest_for(me), matched=matched)


def _activity(url):
    """The numeric activity id in a LinkedIn post URL (works for /feed/update/urn:li:activity:N and /posts/...-activity-N-xx)."""
    m = re.search(r"activity[:\-](\d{10,})", url or "")
    return m.group(1) if m else (url or "").split("?")[0].rstrip("/")


@anvil.server.callable(require_user=True)
def clear_analytics():
    me = C.require_user()
    for r in app_tables.imports.search(owner=me):
        r.delete()
    return C.ok()
