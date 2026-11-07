"""The writing studio: your workspace (voice, pillars, cadence), posts (idea -> draft -> scheduled -> posted),
the idea bank, and metrics you log by hand. Everything is private to its owner.

AI writing happens in the browser with the user's own Anthropic key (web/pages/_ai.html): this server never
sees the key or calls an AI model.
"""
import datetime as dt
import re

import anvil.server
from anvil.tables import app_tables
import anvil.tables as tables

from . import common as C
from . import DemoData

STATUSES = ("idea", "draft", "scheduled", "posted")
FORMATS = ("text", "image", "carousel", "video", "poll", "article")
METRICS = ("impressions", "reactions", "comments", "reposts", "saves", "clicks", "followers", "engagements")
COLORS = re.compile(r"^#[0-9a-fA-F]{6}$")
DEFAULT_PILLARS = [
    {"id": "expertise", "name": "Expertise", "color": "#1e3a5f", "target": 40},
    {"id": "story", "name": "Stories", "color": "#c9a227", "target": 30},
    {"id": "opinion", "name": "Opinions", "color": "#7a5cff", "target": 20},
    {"id": "offer", "name": "Offers", "color": "#1f7a52", "target": 10},
]


def _dt(v):
    """ISO string from the browser -> aware datetime, or None."""
    if not v:
        return None
    try:
        d = dt.datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=dt.timezone.utc)


def profile_for(user, create=True):
    p = app_tables.profiles.get(user=user)
    if p is None and create:
        p = app_tables.profiles.add_row(user=user, voice={}, pillars=[dict(x) for x in DEFAULT_PILLARS], cadence=3,
                                        reminders=True, timezone="", starter=False, updated=C.now())
    return p


def _profile(p):
    return {"voice": p["voice"] or {}, "pillars": p["pillars"] or [], "cadence": p["cadence"] or 3,
            "reminders": p["reminders"] is not False, "timezone": p["timezone"] or "", "updated": C.iso(p["updated"])}


def post_dict(r):
    return {"id": r.get_id(), "text": r["text"] or "", "first_comment": r["first_comment"] or "", "pillar": r["pillar"] or "",
            "format": r["format"] or "text", "status": r["status"] or "draft", "scheduled_at": C.iso(r["scheduled_at"]),
            "posted_at": C.iso(r["posted_at"]), "url": r["url"] or "", "posted_via_api": bool(r["li_urn"]),
            "metrics": r["metrics"] or {}, "carousel": r["carousel"] or None, "notes": r["notes"] or "",
            "created": C.iso(r["created"]), "updated": C.iso(r["updated"]), "example": bool(r["is_demo"])}


def idea_dict(r):
    return {"id": r.get_id(), "text": r["text"], "kind": r["kind"] or "", "pillar": r["pillar"] or "", "used": bool(r["used"]),
            "created": C.iso(r["created"]), "example": bool(r["is_demo"])}


def starter_kit(user, p):
    """First visit: a welcome draft and a few ideas, so the studio isn't empty."""
    if p["starter"]:
        return
    p["starter"] = True
    now = C.now()
    app_tables.posts.add_row(owner=user, status="draft", format="text", pillar="story", created=now, updated=now, is_demo=False,
                             metrics={}, reminded=False, notes="Welcome draft: edit it, or delete it.", text=(
        "I almost didn't post this.\n\n"
        "For two years I wrote LinkedIn posts in my head and never pressed Publish.\n\n"
        "What changed wasn't confidence. It was a system:\n\n"
        "1. One idea a day, written down the moment it shows up.\n"
        "2. A hook I'd stop scrolling for.\n"
        "3. A fixed day to publish, so it's a habit, not a mood.\n\n"
        "The first post was clumsy. The tenth was mine.\n\n"
        "What's the post you keep not writing?"))
    for kind, text in [("lesson", "The mistake that taught me the most this year"), ("opinion", "A common advice in my field I disagree with"),
                       ("howto", "The 3-step checklist I use before every client kickoff"), ("story", "The first time a customer said no, and what I learned")]:
        app_tables.ideas.add_row(owner=user, text=text, kind=kind, pillar="", used=False, created=now, is_demo=False)


@anvil.server.callable(require_user=True)
def get_workspace():
    """Everything the studio pages need, in one call."""
    me = C.require_user()
    p = profile_for(me)
    starter_kit(me, p)
    posts = app_tables.posts.search(tables.order_by("updated", ascending=False), owner=me)
    ideas = app_tables.ideas.search(tables.order_by("created", ascending=False), owner=me)
    from . import LinkedIn, Insights
    return {"profile": _profile(p), "posts": [post_dict(r) for r in posts], "ideas": [idea_dict(r) for r in ideas],
            "linkedin": LinkedIn.status_for(me), "analytics": Insights.latest_for(me),
            "has_examples": len(app_tables.posts.search(owner=me, is_demo=True)) > 0}


def _clean_metrics(m):
    out = {}
    for k in METRICS:
        v = (m or {}).get(k) if isinstance(m, dict) else None
        if v in (None, ""):
            continue
        try:
            out[k] = max(0, int(float(v)))
        except (TypeError, ValueError):
            continue
    return out


def _clean_carousel(c):
    if not isinstance(c, dict):
        return None
    slides = []
    for s in (c.get("slides") if isinstance(c.get("slides"), list) else [])[:20]:
        if isinstance(s, dict):
            slides.append({"title": C.text(s.get("title"), 140), "body": C.text(s.get("body"), 600, multiline=True)})
    return {"theme": C.text(c.get("theme"), 20) or "navy", "handle": C.text(c.get("handle"), 60), "slides": slides}


@anvil.server.callable(require_user=True)
def save_post(post):
    """Create (no id) or update one of your posts. Returns the saved post."""
    me = C.require_user()
    if not isinstance(post, dict):
        return C.fail("Nothing to save.")
    text = C.text(post.get("text"), 3000, multiline=True)
    status = post.get("status") if post.get("status") in STATUSES else "draft"
    fmt = post.get("format") if post.get("format") in FORMATS else "text"
    when = _dt(post.get("scheduled_at"))
    if status == "scheduled" and when is None:
        return C.fail("Pick a date and time to schedule it.")
    if status in ("draft", "scheduled", "posted") and not text.strip():
        return C.fail("Write something first.")
    fields: dict = dict(text=text, first_comment=C.text(post.get("first_comment"), 1250, multiline=True),
                  pillar=C.text(post.get("pillar"), 40), format=fmt, status=status, scheduled_at=when,
                  notes=C.text(post.get("notes"), 1000, multiline=True), url=_url(post.get("url")),
                  metrics=_clean_metrics(post.get("metrics")), carousel=_clean_carousel(post.get("carousel")), updated=C.now())
    if status == "posted":
        fields["posted_at"] = _dt(post.get("posted_at")) or C.now()
    pid = post.get("id")
    if pid:
        r = C.row_by_id(app_tables.posts, pid)
        if r is None or r["owner"] != me:
            return C.fail("That post no longer exists.")
        if r["scheduled_at"] != when:
            fields["reminded"] = False
        if status != "posted":
            fields["posted_at"] = None
        r.update(**fields)
    else:
        if C.rate_limited("save_post", 200, 3600):
            return C.fail("That's a lot of new posts in an hour. Take a breath and try again soon.")
        r = app_tables.posts.add_row(owner=me, created=C.now(), reminded=False, is_demo=False, li_urn="", **fields)
    return C.ok(post=post_dict(r))


def _url(v):
    v = C.text(v, 400)
    return v if re.match(r"^https://(www\.)?linkedin\.com/", v) else ""


@anvil.server.callable(require_user=True)
def delete_post(post_id):
    me = C.require_user()
    r = C.row_by_id(app_tables.posts, post_id)
    if r is None:
        return C.ok()
    if r["owner"] != me:
        return C.fail("You can only delete your own posts.")
    r.delete()
    return C.ok()


@anvil.server.callable(require_user=True)
def mark_posted(post_id, url=None, posted_at=None):
    me = C.require_user()
    r = C.row_by_id(app_tables.posts, post_id)
    if r is None or r["owner"] != me:
        return C.fail("That post no longer exists.")
    r.update(status="posted", posted_at=_dt(posted_at) or C.now(), url=_url(url) or r["url"] or "", updated=C.now())
    return C.ok(post=post_dict(r))


@anvil.server.callable(require_user=True)
def save_metrics(post_id, metrics, url=None):
    me = C.require_user()
    r = C.row_by_id(app_tables.posts, post_id)
    if r is None or r["owner"] != me:
        return C.fail("That post no longer exists.")
    m = dict(r["metrics"] or {})
    m.update(_clean_metrics(metrics))
    r.update(metrics=m, updated=C.now(), url=_url(url) or r["url"] or "")
    return C.ok(post=post_dict(r))


# ------------------------------------------------------------------------------------------- ideas
@anvil.server.callable(require_user=True)
def save_idea(text, kind="", pillar="", idea_id=None):
    me = C.require_user()
    text = C.text(text, 600, multiline=True)
    if len(text) < 3:
        return C.fail("Write a few words.")
    if idea_id:
        r = C.row_by_id(app_tables.ideas, idea_id)
        if r is None or r["owner"] != me:
            return C.fail("That idea no longer exists.")
        r.update(text=text, kind=C.text(kind, 20), pillar=C.text(pillar, 40))
    else:
        if C.rate_limited("save_idea", 200, 3600):
            return C.fail("That's a lot of ideas in an hour. Try again soon.")
        r = app_tables.ideas.add_row(owner=me, text=text, kind=C.text(kind, 20), pillar=C.text(pillar, 40), used=False,
                                     created=C.now(), is_demo=False)
    return C.ok(idea=idea_dict(r))


@anvil.server.callable(require_user=True)
def save_ideas(items):
    """Several at once (from the AI idea generator or the guided prompts)."""
    me = C.require_user()
    out = []
    for it in (items if isinstance(items, list) else [])[:20]:
        if isinstance(it, dict) and len(C.text(it.get("text"), 600)) >= 3:
            out.append(idea_dict(app_tables.ideas.add_row(owner=me, text=C.text(it.get("text"), 600, multiline=True),
                                                          kind=C.text(it.get("kind"), 20), pillar=C.text(it.get("pillar"), 40),
                                                          used=False, created=C.now(), is_demo=False)))
    return C.ok(ideas=out)


@anvil.server.callable(require_user=True)
def set_idea_used(idea_id, used=True):
    me = C.require_user()
    r = C.row_by_id(app_tables.ideas, idea_id)
    if r is None or r["owner"] != me:
        return C.fail("That idea no longer exists.")
    r["used"] = bool(used)
    return C.ok(idea=idea_dict(r))


@anvil.server.callable(require_user=True)
def delete_idea(idea_id):
    me = C.require_user()
    r = C.row_by_id(app_tables.ideas, idea_id)
    if r is not None and r["owner"] != me:
        return C.fail("You can only delete your own ideas.")
    if r is not None:
        r.delete()
    return C.ok()


# ------------------------------------------------------------------------------------------- voice, pillars, cadence
@anvil.server.callable(require_user=True)
def save_profile(voice=None, pillars=None, cadence=None, reminders=None, timezone=None):
    me = C.require_user()
    p = profile_for(me)
    if isinstance(voice, dict):
        samples = [C.text(s, 3000, multiline=True) for s in (voice.get("samples") or []) if isinstance(s, str) and s.strip()][:30]
        card = voice.get("card") if isinstance(voice.get("card"), dict) else {}
        clean_card = {"summary": C.text(card.get("summary"), 600, multiline=True)}
        for k in ("traits", "do", "dont", "moves"):
            clean_card[k] = [C.text(x, 160) for x in (card.get(k) or []) if isinstance(x, str)][:8]
        stats = voice.get("stats") if isinstance(voice.get("stats"), dict) else {}
        p["voice"] = {
            "samples": samples, "card": clean_card,
            "stats": {k: v for k, v in stats.items() if isinstance(k, str) and isinstance(v, (int, float))} if stats else {},
            "about": C.text(voice.get("about"), 600, multiline=True), "audience": C.text(voice.get("audience"), 300),
            "banned": [C.text(x, 60) for x in (voice.get("banned") or []) if isinstance(x, str) and x.strip()][:40],
            "tone": {k: max(0, min(100, int(v))) for k, v in (voice.get("tone") or {}).items()
                     if k in ("formal", "playful", "bold", "warm") and isinstance(v, (int, float))},
            "language": C.text(voice.get("language"), 30) or "English",
        }
    if isinstance(pillars, list):
        clean, seen = [], set()
        for x in pillars[:6]:
            if not isinstance(x, dict) or not C.text(x.get("name"), 30):
                continue
            pid = re.sub(r"[^a-z0-9]+", "", C.text(x.get("id"), 20).lower()) or re.sub(r"[^a-z0-9]+", "", x["name"].lower())[:20] or "p"
            while pid in seen:
                pid += "x"
            seen.add(pid)
            clean.append({"id": pid, "name": C.text(x.get("name"), 30),
                          "color": x.get("color") if COLORS.match(str(x.get("color") or "")) else "#1e3a5f",
                          "target": max(0, min(100, int(x.get("target") or 0)))})
        p["pillars"] = clean
    if cadence is not None:
        try:
            p["cadence"] = max(1, min(14, int(cadence)))
        except (TypeError, ValueError):
            return C.fail("Posts per week should be a number from 1 to 14.")
    if reminders is not None:
        p["reminders"] = bool(reminders)
    if timezone is not None:
        p["timezone"] = C.text(timezone, 60)
    p["updated"] = C.now()
    return C.ok(profile=_profile(p))


# ------------------------------------------------------------------------------------------- examples
@anvil.server.callable(require_user=True)
def add_examples():
    """Fill your workspace with example past posts and analytics (flagged, removable) to explore Insights."""
    me = C.require_user()
    if len(app_tables.posts.search(owner=me, is_demo=True)):  # a SearchIterator is always truthy: count it
        return C.ok(added=0)
    n = DemoData.examples_for(me)
    return C.ok(added=n)


@anvil.server.callable(require_user=True)
def remove_examples():
    me = C.require_user()
    n = 0
    for t in (app_tables.posts, app_tables.ideas, app_tables.imports):
        for r in t.search(owner=me, is_demo=True):
            r.delete()
            n += 1
    return C.ok(removed=n)


# ------------------------------------------------------------------------------------------- reminders
@anvil.server.background_task
def send_reminders():
    """Scheduled task (every 15 minutes): email people whose scheduled post is due. Never posts anything."""
    import anvil.email
    now = C.now()
    sent = 0
    for r in app_tables.posts.search(status="scheduled", reminded=False):
        when = r["scheduled_at"]
        if when is None or when > now + dt.timedelta(minutes=5) or r["is_demo"]:
            continue
        r["reminded"] = True
        p = app_tables.profiles.get(user=r["owner"])
        if p is not None and p["reminders"] is False:
            continue
        first = (r["text"] or "").strip().split("\n")[0][:120]
        try:
            anvil.email.send(to=r["owner"]["email"], subject="Time to post: " + (first[:60] or "your LinkedIn post"),
                             text="Your post is ready to go:\n\n\"%s\"\n\nOpen Hookline, check it one last time, then post it "
                                  "(one click if LinkedIn is connected, or copy and paste).\n\nYou get this because you scheduled it. "
                                  "Turn reminders off in Hookline -> Voice & settings." % first)
            sent += 1
        except Exception as e:
            print("reminder failed: %r" % e)
    return sent
