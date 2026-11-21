"""Hookline's engine, reached from Python.

    window.HL       theme/assets/hl.js: the post checker, hook score, "see more" fold, formulas, structures, prompts,
                    voice statistics (unchanged from the JavaScript version). HL.py = JSON text in/out, so Python gets dicts.
    window.HL.ai    theme/assets/hl-ai.js: AI with the person's OWN Claude API key. The browser calls Anthropic directly;
                    the key stays only in this browser's localStorage ("hookline.ai") and never reaches our server.
                    Python only passes prompts' inputs in and gets the text back. Never print, log or store the key.
    window.HLC/HLI  theme/assets/hl-media.js: carousel canvas + PDF, analytics file reader + line chart.
Also the workspace cache (get_workspace: one call for every page), copy-to-clipboard and dates in the browser's locale.
"""
import json

import anvil.js
from anvil.js import window

from . import state

_c: dict = {}


def js(value):
    """A Python dict/list as a plain JS object (for the engines)."""
    return window.JSON.parse(json.dumps(value))


def py(value):
    """A JS object/array from an engine as Python dicts/lists."""
    return json.loads(window.JSON.stringify(value))


def loose(x):
    return x


# ---------------------------------------------------------------- constants (formats, structures, prompts ...)
def consts():
    if "consts" not in _c:
        _c["consts"] = json.loads(window.HL.py.consts())
    return _c["consts"]


def formats():
    return consts()["FORMATS"]


def format_label(key):
    return (formats().get(key) or [key or "Text"])[0]


def status_label(key):
    return consts()["STATUS"].get(key, key or "")


# ---------------------------------------------------------------- text analysis
def hook(text):
    t = (text or "").strip()
    return t.split("\n")[0].strip() if t else ""


def check(text, first_comment=""):
    return json.loads(window.HL.py.check(text or "", first_comment or ""))


def hook_score(line):
    return json.loads(window.HL.py.hookScore(line or ""))


def fold_cut(text, mode="mobile"):
    return json.loads(window.HL.py.foldCut(text or "", mode))


def plain(text):
    return str(window.HL.plain(text or ""))


def structure_text(key):
    return str(window.HL.structureText(key))


def sentences(text):
    return json.loads(window.HL.py.sentences(text or ""))


def fancy_count(text):
    return int(window.HL.py.fancyCount(text or ""))


def voice_stats(samples):
    return json.loads(window.HL.py.voiceStats(json.dumps(samples or [])))


def voice_summary(stats):
    return str(window.HL.py.voiceSummary(json.dumps(stats))) if stats else ""


def voice_match(text, voice):
    """'Sounds like you': the draft against the person's past posts and banned words, plus AI-ish patterns.
    {score, ready (3+ samples saved), samples, items: [{level, title, text}]}"""
    return json.loads(window.HL.py.voiceMatch(text or "", json.dumps(voice or {})))


# ---------------------------------------------------------------- numbers and dates (browser locale, like before)
def fmt_num(n):
    return str(window.HL.fmtNum(n or 0))


def engagements(m):
    m = m or {}
    return m.get("engagements") or ((m.get("reactions") or 0) + (m.get("comments") or 0) + (m.get("reposts") or 0))


def rate(m):
    m = m or {}
    return 100.0 * engagements(m) / m["impressions"] if m.get("impressions") else None


def when(p):
    return p.get("posted_at") if p.get("status") == "posted" else p.get("scheduled_at")


def fmt_date(iso, opts=None):
    return str(window.HL.py.fmtDate(iso or "", json.dumps(opts) if opts else ""))


def fmt_datetime(iso):
    return str(window.HL.py.fmtDateTime(iso or ""))


def ago(iso):
    return str(window.HL.py.ago(iso or ""))


def local_input(iso):
    """ISO -> 'YYYY-MM-DDTHH:MM' for a datetime-local input, in the browser's time zone."""
    return str(window.HL.py.localInput(iso)) if iso else ""


def from_local(value):
    return str(window.HL.py.fromLocal(value)) if value else None


def day_key(iso):
    return str(window.HL.py.dayKey(iso))


def time_ms(iso):
    return float(window.Date.parse(iso)) if iso else 0.0


def now_ms():
    return float(window.Date.now())


def due(ws, but=None):
    """Scheduled posts due now (or within 15 minutes)."""
    limit = now_ms() + 15 * 60000
    return [p for p in ws["posts"] if p.get("status") == "scheduled" and p.get("scheduled_at")
            and time_ms(p["scheduled_at"]) <= limit and p.get("id") != but]


def week_key(iso):
    """The Monday (local, 'YYYY-MM-DD') of the week an ISO time falls in."""
    d = window.Date(iso)
    monday = window.Date(d.getFullYear(), d.getMonth(), int(d.getDate()) - (int(d.getDay()) + 6) % 7, 12)
    return day_key(monday.toISOString())


def rhythm(ws_):
    """The weekly rhythm (2026-11-20): weeks in a row that hit the posting target, where one missed week in any four
    is a free rest week (daily streaks burn people out). The current week never breaks it: it isn't over yet.
    {streak, rests, target, this_week, any, counts: {monday: n}, dots: [{key, state: on|rest|off|now}] oldest first}"""
    target = max(1, int((ws_.get("profile") or {}).get("cadence") or 3))
    counts: dict = {}
    first = None
    for p in ws_.get("posts") or []:
        if p.get("status") == "posted" and p.get("posted_at"):
            k = week_key(p["posted_at"])
            counts[k] = counts.get(k, 0) + 1
            first = k if first is None or k < first else first
    now = window.Date()
    start = window.Date(now.getFullYear(), now.getMonth(), int(now.getDate()) - (int(now.getDay()) + 6) % 7, 12)

    def key(i):
        return day_key(window.Date(start.getFullYear(), start.getMonth(), int(start.getDate()) - 7 * i, 12).toISOString())

    streak, rest_weeks, pending, last_rest = 0, [], None, None
    for i in range(104):
        k = key(i)
        if counts.get(k, 0) >= target:
            streak += 1
            if pending is not None:
                rest_weeks.append(pending)
                last_rest, pending = pending, None
            continue
        if i == 0:
            continue
        if pending is not None or first is None or k < first:
            break
        if last_rest is None or i - last_rest >= 4:
            pending = i
            continue
        break
    dots = []
    for i in range(7, -1, -1):
        k = key(i)
        met = counts.get(k, 0) >= target
        state_ = "on" if met else "now" if i == 0 else "rest" if i in rest_weeks else "off"
        dots.append({"key": k, "state": state_, "n": counts.get(k, 0)})
    return {"streak": streak, "rests": len(rest_weeks), "target": target, "this_week": counts.get(key(0), 0),
            "any": first is not None, "counts": counts, "dots": dots}


def pillar(ws, pid):
    p: dict
    for p in (ws.get("profile") or {}).get("pillars") or []:
        if p.get("id") == pid:
            return p
    return None


def readable_color(color):
    """A pillar colour used as text: mixed toward the ink so it stays readable on light and dark."""
    return "color-mix(in srgb, %s 65%%, var(--c-ink))" % (color or "var(--c-brand)")


# ---------------------------------------------------------------- the workspace (profile, posts, ideas, analytics, linkedin)
def load():
    ws: dict = state.call("get_workspace") or {}
    if ws:
        _c["ws"] = ws
    return ws


def ws():
    w: dict = _c.get("ws") or {}
    return w


def put_post(post):
    """Keep the cached workspace in step after a save."""
    w = _c.get("ws")
    if not w or not post:
        return
    for i, p in enumerate(w["posts"]):
        if p["id"] == post["id"]:
            w["posts"][i] = post
            return
    w["posts"].insert(0, post)


def headline(ws_):
    v = (ws_.get("profile") or {}).get("voice") or {}
    text = v.get("about") or "Your headline"
    for sep in (".", "\n"):
        text = text.split(sep)[0]
    return text[:70]


# ---------------------------------------------------------------- copy and open LinkedIn (the no-API route)
def copy(text, msg="Copied"):
    try:
        window.navigator.clipboard.writeText(text)
        state.toast(msg, "ok")
    except Exception:
        window.prompt("Copy this:", text)


def open_linkedin(text):
    copy(text, "Copied. Paste it into LinkedIn (Ctrl+V).")
    window.open("https://www.linkedin.com/feed/?shareActive=true&text=" + str(window.encodeURIComponent(text)), "_blank", "noopener")


# ---------------------------------------------------------------- AI with the person's own key (hl-ai.js does the work)
def ai_has():
    return bool(window.HL.ai.has())


def ai_model_name():
    return str(window.HL.ai.modelName())


def ai_model():
    return str(window.HL.ai.model())


def ai_models():
    return py(window.HL.ai.MODELS)


def ai_settings():
    """{key, model} as saved in this browser (shown back in the Voice > AI form, nowhere else)."""
    return py(window.HL.ai.get())


def ai_save(key, model):
    window.HL.ai.set(js({"key": key, "model": model}))


def ai_clear():
    window.HL.ai.clear()


def ai_error(e):
    """The friendly message hl-ai.js put on a failed request."""
    try:
        return str(loose(e).original_error.message)
    except Exception:
        return str(e) or "The AI request failed."


def ai_call(name, *args, on_text=None):
    """Run HL.ai.<name>(ws, me, ...) and return Python values. Raises with the engine's friendly message."""
    fn = window.HL.ai[name]
    w = ws() or {"profile": {}, "posts": []}
    full = [js(w), js(state.me() or {})] + [a for a in args]
    if on_text is not None:
        full.append(on_text)
    r = fn(*full)
    if isinstance(r, str):
        return r
    return py(r)


# ---------------------------------------------------------------- carousel as a LinkedIn document post (asks first)
def carousel_for(post):
    """The saved carousel, or slides made from the post's paragraphs."""
    car = post.get("carousel") or {}
    if car.get("slides"):
        return car
    return {"theme": "navy", "handle": "", "slides": json.loads(window.HLC.fromPost(post.get("text") or ""))}


def post_carousel(post, car=None):
    """Make the PDF in the browser (hl-media.js) and post it through LinkedIn's official Documents API, only after
    the person says yes. Returns the posted post, or None."""
    from anvil import confirm
    car = car or carousel_for(post)
    n = len(car.get("slides") or [])
    if not confirm("Hookline makes the %d-slide PDF and posts it on LinkedIn as a document, with your post text above it. "
                   "This publishes right away." % n, title="Post with the carousel?",
                   buttons=[("Cancel", False), ("Post now", True)], role="app-dialog"):
        return None
    state.toast("Making the PDF and uploading it to LinkedIn…")
    me = state.me() or {}
    f = window.HLC.pdf(json.dumps(post), json.dumps(car), me.get("name") or "")
    media = anvil.js.to_media(f)
    r = state.call("li_post_document", media, post["id"], hook(post.get("text"))[:120])
    if not r:
        return None
    state.toast("Posted on LinkedIn, with the carousel.", "ok")
    if post.get("first_comment"):
        copy(post["first_comment"], "First comment copied: paste it under your post.")
    put_post(r["post"])
    return r["post"]
