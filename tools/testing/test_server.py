"""Server tests against the strict mock of Anvil (tools/testing/mock).

    python tools/testing/test_server.py          (no -I: reads anvil.yaml)          -> prints ALL OK, or the first failure

call(name, ...) runs a server function the way the browser does: by name, with require_user enforced,
and the reply must be JSON (a datetime or a row in a reply fails here, like it would break the page).
Add tests for every new server function: the happy path, bad input, and someone who isn't allowed.
"""
import datetime as dt
import importlib
import json
import os
import pathlib
import shutil
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
_tmp = pathlib.Path(tempfile.mkdtemp())
shutil.copytree(PROJECT / "server_code", _tmp / "app")
(_tmp / "app" / "__init__.py").write_text("")
os.environ["ANVIL_APP_YAML"] = str(PROJECT / "anvil.yaml")  # the mock's tables follow the app's own schema
sys.path[:0] = [str(HERE / "mock"), str(_tmp)]
import anvil.server  # noqa: E402
import anvil.users  # noqa: E402
import anvil.email  # noqa: E402
import anvil.http  # noqa: E402
import anvil.secrets  # noqa: E402
from anvil.tables import app_tables as T  # noqa: E402

M = {p.stem: importlib.import_module("app." + p.stem) for p in sorted((PROJECT / "server_code").glob("*.py"))}
now = dt.datetime.now(dt.timezone.utc)


def call(name, *args):
    r = anvil.server.call(name, *args)
    json.dumps(r)  # strict: must be JSON-able
    return r


def as_user(row):
    anvil.users.CURRENT[0] = row
    anvil.server.session.use(row.get_id() if row is not None else None)


def denied(name, *args):
    try:
        call(name, *args)
    except anvil.server.PermissionDenied:
        return True
    return False


def ok(r, msg=""):
    assert isinstance(r, dict) and r.get("ok"), (msg, r)
    return r


def bad(r, msg=""):
    assert isinstance(r, dict) and r.get("ok") is False and r.get("error"), (msg, r)
    return r


def person(email, name=None, **kw):
    return T.users.add_row(email=email, enabled=True, signed_up=now, display_name=name, **kw)


# ---------------------------------------------------------------------------------- accounts
admin = person("arkulinskis@gmail.com", "The Admin")
ana = person("ana@example.com", "Ana")
bob = person("bob@example.com")

as_user(None)
assert call("get_me") is None
assert denied("update_profile", "X")
as_user(admin)
assert call("get_me")["is_admin"] is True, "ADMIN_EMAILS become admins on first sign-in"
as_user(ana)
me = call("get_me")
assert me["name"] == "Ana" and me["is_admin"] is False
assert ana["last_seen"] is not None
as_user(bob)
assert call("get_me")["name"] == "Bob", "a name comes from the email when none is set"
bad(call("update_profile", " x "))
assert ok(call("update_profile", "  Bob   Stone "))["me"]["name"] == "Bob Stone"

# ---------------------------------------------------------------------------------- feedback
as_user(None)
bad(call("submit_feedback", "bug", "hi"))
ok(call("submit_feedback", "bug", "The button is broken", "guest@example.com", {"page": "#home", "evil": "x" * 9999}))
fb = T.feedback.search()[0]
assert fb["name"] == "Guest" and fb["email"] == "guest@example.com" and "evil" not in fb["context"] and fb["status"] == "new"
for i in range(4):
    ok(call("submit_feedback", "idea", "Idea number %d" % i))
bad(call("submit_feedback", "idea", "One too many this hour"), "rate limit")
as_user(ana)
ok(call("submit_feedback", "nonsense-kind", "Signed-in feedback"))
assert T.feedback.get(message="Signed-in feedback")["kind"] == "other"
assert denied("list_feedback")
as_user(admin)
lst = call("list_feedback")
assert lst["counts"]["new"] == 6 and len(lst["items"]) == 6
fid = lst["items"][0]["id"]
ok(call("set_feedback_status", fid, "done", "Fixed it"))
assert call("list_feedback", "done")["items"][0]["note"] == "Fixed it"
bad(call("set_feedback_status", fid, "weird"))
bad(call("set_feedback_status", "nope", "done"))
ok(call("delete_feedback", fid))
assert len(call("list_feedback")["items"]) == 5

# ---------------------------------------------------------------------------------- admin
as_user(ana)
for fn, args in [("admin_overview", ()), ("list_users", ()), ("set_admin", (bob.get_id(), True)), ("demo_load", ()), ("demo_remove", ())]:
    assert denied(fn, *args), fn
as_user(admin)
ov = call("admin_overview")
assert ov["users"] == 3 and ov["admins"] == 1 and ov["feedback_new"] == 5
assert len(call("list_users")["users"]) == 3 and len(call("list_users", "bob")["users"]) == 1
ok(call("set_admin", bob.get_id(), True))
assert bob["is_admin"] is True
bad(call("set_admin", admin.get_id(), False), "can't remove your own admin")
ok(call("set_enabled", bob.get_id(), False))
assert bob["enabled"] is False
bad(call("set_enabled", admin.get_id(), False))
ok(call("set_enabled", bob.get_id(), True))
ok(call("set_admin", bob.get_id(), False))
assert bob["is_admin"] is False

# ---------------------------------------------------------------------------------- the studio
as_user(None)
assert denied("get_workspace") and denied("save_post", {"text": "x"}) and denied("li_post", "x")
as_user(ana)
wsd = call("get_workspace")
assert len(wsd["posts"]) == 1 and wsd["posts"][0]["status"] == "draft", "a welcome draft on the first visit"
assert len(wsd["ideas"]) == 4 and len(wsd["profile"]["pillars"]) == 4 and wsd["profile"]["cadence"] == 3
assert wsd["linkedin"] == {"configured": False, "connected": False} and wsd["analytics"] is None
assert len(call("get_workspace")["posts"]) == 1, "the starter kit is added only once"
bad(call("save_post", {"text": "   ", "status": "draft"}))
bad(call("save_post", {"text": "Hello", "status": "scheduled"}), "scheduling needs a time")
p1 = ok(call("save_post", {"text": "My hook\n\nBody", "pillar": "story", "format": "weird", "status": "nonsense",
                           "metrics": {"impressions": "1200", "reactions": -5, "bogus": 3}, "url": "https://evil.example.com"}))["post"]
assert p1["format"] == "text" and p1["status"] == "draft" and p1["metrics"] == {"impressions": 1200, "reactions": 0} and p1["url"] == ""
when = (now + dt.timedelta(days=2)).isoformat()
p1 = ok(call("save_post", dict(p1, status="scheduled", scheduled_at=when)))["post"]
assert p1["status"] == "scheduled" and p1["scheduled_at"].startswith(when[:16])
bad(call("save_post", {"id": "nope", "text": "x"}))
as_user(bob)
bad(call("save_post", dict(p1, text="hijack")), "can't edit someone else's post")
bad(call("delete_post", p1["id"]))
bad(call("mark_posted", p1["id"]))
bad(call("save_metrics", p1["id"], {"impressions": 1}))
as_user(ana)
mp = ok(call("mark_posted", p1["id"], "https://www.linkedin.com/feed/update/urn:li:activity:7200000000000000999/"))["post"]
assert mp["status"] == "posted" and mp["posted_at"] and mp["url"].startswith("https://www.linkedin.com/")
mm = ok(call("save_metrics", p1["id"], {"impressions": 900, "comments": 4}))["post"]
assert mm["metrics"]["impressions"] == 900 and mm["metrics"]["comments"] == 4
big = ok(call("save_post", {"text": "x" * 5000}))["post"]
assert len(big["text"]) == 3000, "posts are capped at LinkedIn's 3,000 characters"
ok(call("delete_post", big["id"]))

# ideas
bad(call("save_idea", "x"))
idea = ok(call("save_idea", "A lesson from my first client", "lesson", "story"))["idea"]
assert idea["kind"] == "lesson" and not idea["used"]
assert ok(call("set_idea_used", idea["id"], True))["idea"]["used"]
assert len(ok(call("save_ideas", [{"text": "Idea one"}, {"text": "x"}, "junk", {"text": "Idea two", "kind": "story"}]))["ideas"]) == 2
as_user(bob)
bad(call("set_idea_used", idea["id"], False))
bad(call("delete_idea", idea["id"]))
as_user(ana)
ok(call("delete_idea", idea["id"]))

# voice, pillars, rhythm
pr = ok(call("save_profile", {"about": "UX designer", "samples": ["Post one is here", 7, "  "], "banned": ["synergy", ""], "tone": {"bold": 150, "evil": 3},
                              "card": {"summary": "Short and warm", "traits": ["direct", 5]}, "stats": {"chars": 600, "bad": "x"}},
                        [{"name": "Craft", "color": "#123456", "target": 60}, {"name": "Craft", "color": "red", "target": 400}, {"name": ""}], 30, False, "America/Toronto"))["profile"]
v = pr["voice"]
assert v["samples"] == ["Post one is here"] and v["banned"] == ["synergy"] and v["tone"] == {"bold": 100} and v["card"]["traits"] == ["direct"]
assert v["stats"] == {"chars": 600}
assert [x["id"] for x in pr["pillars"]] == ["craft", "craftx"] and pr["pillars"][1]["color"] == "#1e3a5f" and pr["pillars"][1]["target"] == 100
assert pr["cadence"] == 14 and pr["reminders"] is False and pr["timezone"] == "America/Toronto"
bad(call("save_profile", None, None, "lots"))

# ---------------------------------------------------------------------------------- reminders (never posts)
ok(call("save_profile", None, None, None, True))
due = ok(call("save_post", {"text": "Due soon hook\n\nbody", "status": "scheduled", "scheduled_at": (now + dt.timedelta(minutes=2)).isoformat()}))["post"]
later = ok(call("save_post", {"text": "Later hook", "status": "scheduled", "scheduled_at": (now + dt.timedelta(days=3)).isoformat()}))["post"]
anvil.email.OUTBOX[:] = []
sent = anvil.server.launch_background_task("send_reminders").get_return_value()
assert sent == 1 and anvil.email.OUTBOX[0]["to"] == "ana@example.com" and "Due soon hook" in anvil.email.OUTBOX[0]["text"]
assert anvil.server.launch_background_task("send_reminders").get_return_value() == 0, "one reminder per post"
assert T.posts.get_by_id(due["id"])["status"] == "scheduled", "reminders never post anything"
ok(call("save_post", dict(due, scheduled_at=(now + dt.timedelta(minutes=1)).isoformat())))
assert anvil.server.launch_background_task("send_reminders").get_return_value() == 1, "rescheduling re-arms the reminder"

# ---------------------------------------------------------------------------------- LinkedIn (official API, button only)
L = M["LinkedIn"]
bad(call("li_auth_url"), "not set up yet")
bad(call("li_post", later["id"]), "not connected")
anvil.secrets.SECRETS.update({"linkedin_client_id": "cid", "linkedin_client_secret": "csec"})
assert call("li_status")["configured"] is True
url = ok(call("li_auth_url"))["url"]
assert url.startswith(L.AUTH_URL) and "w_member_social" in anvil.http.url_encode(url) or "w_member_social" in url
state = T.li_links.get(user=ana)["state"]
assert L.li_callback(code="c", state="wrong").status == 200 and not T.li_links.get(user=ana)["token"]
anvil.http.REPLIES[L.TOKEN_URL] = {"access_token": "tok123", "expires_in": 5184000}
anvil.http.REPLIES[L.USERINFO_URL] = {"sub": "abc123", "name": "Ana Lima", "picture": "https://media.example.com/a.jpg"}
page = L.li_callback(code="c", state=state)
assert "Connected" in page.body and T.li_links.get(user=ana)["token"] == "tok123"
assert L.li_callback(code="c", state=state).body.find("expired") > 0, "a state works once"
st = call("li_status")
assert st["connected"] and st["name"] == "Ana Lima" and st["days_left"] >= 59
assert "token" not in json.dumps(st) or "tok123" not in json.dumps(st), "the token never goes to the browser"
assert L.little_text("Hi (you) #design_ops @x") == "Hi \\(you\\) {hashtag|\\#|design\\_ops} \\@x"
anvil.http.CALLS[:] = []
anvil.http.REPLIES[L.POSTS_URL] = ""
lp = ok(call("li_post", later["id"]))["post"]
assert lp["status"] == "posted" and lp["posted_via_api"]
sent_req = anvil.http.CALLS[-1]
body = json.loads(sent_req["data"])
assert body["author"] == "urn:li:person:abc123" and body["commentary"] == "Later hook" and sent_req["headers"]["LinkedIn-Version"] == L.api_version()
assert sent_req["headers"]["Authorization"] == "Bearer tok123"
bad(call("li_post", later["id"]), "can't post twice")
as_user(bob)
bad(call("li_post", due["id"]), "can't post someone else's post")
assert call("li_status")["connected"] is False
as_user(ana)
anvil.http.REPLIES[L.POSTS_URL] = lambda u, m, d: anvil.http.HttpError(401, "expired")
p3 = ok(call("save_post", {"text": "Another"}))["post"]
r401 = bad(call("li_post", p3["id"]))
assert "expired" in r401["error"] and call("li_status")["connected"] is False
ok(call("li_disconnect"))
assert T.li_links.get(user=ana) is None
assert denied("li_admin") and denied("li_set_version", "202609")
as_user(admin)
assert call("li_admin")["configured"] is True
bad(call("li_set_version", "nope"))
ok(call("li_set_version", "202609"))
assert L.api_version() == "202609"

# ---------------------------------------------------------------------------------- analytics import
as_user(ana)
bad(call("import_analytics", {"daily": [], "top": []}))
imp = ok(call("import_analytics", {"daily": [{"date": "2026-10-01", "impressions": "120", "engagements": 5}, {"date": "bad"}],
                                   "top": [{"url": "https://www.linkedin.com/posts/ana_ux-activity-7200000000000000999-abcd", "date": "2026-10-01", "impressions": 4321, "engagements": 99}],
                                   "followers": [{"date": "2026-10-01", "new": 3}], "followers_total": "5000",
                                   "demographics": [{"category": "Job titles", "value": "Designer", "pct": 140}]}))
assert imp["matched"] == 1, "export rows match posts by their activity id, whatever the URL shape"
assert T.posts.get_by_id(p1["id"])["metrics"]["impressions"] == 4321
an = call("get_workspace")["analytics"]
assert len(an["daily"]) == 1 and an["followers_total"] == 5000 and an["demographics"][0]["pct"] == 100.0
ok(call("clear_analytics"))
assert call("get_workspace")["analytics"] is None

# ---------------------------------------------------------------------------------- carousel as a PDF document post
import anvil  # noqa: E402
as_user(ana)
T.li_links.add_row(user=ana, sub="abc123", name="Ana Lima", picture="", token="tok456", expires_at=now + dt.timedelta(days=30), state="")
car = ok(call("save_post", {"text": "Good forms ask fewer questions.\n\nSwipe for the breakdown.", "format": "carousel",
                            "carousel": {"theme": "navy", "slides": [{"title": "Good forms", "body": "ask fewer questions"}]}}))["post"]
pdf = anvil.BlobMedia("application/pdf", b"%PDF-1.3 fake carousel", name="c.pdf")
bad(call("li_post_document", anvil.BlobMedia("text/plain", b"hello", name="x.txt"), car["id"]), "only PDFs")
bad(call("li_post_document", anvil.BlobMedia("application/pdf", b"%PDF" + b"x" * (21 * 1024 * 1024), name="big.pdf"), car["id"]), "size cap")
anvil.http.REPLIES["https://api.linkedin.com/rest/documents"] = {"value": {"uploadUrl": "https://www.linkedin.com/dms-uploads/abc", "document": "urn:li:document:D123"}}
anvil.http.REPLIES["https://www.linkedin.com/dms-uploads/"] = ""
anvil.http.REPLIES[L.POSTS_URL] = ""
anvil.http.CALLS[:] = []
as_user(bob)
bad(call("li_post_document", pdf, car["id"]), "can't post someone else's carousel")
as_user(ana)
done = ok(call("li_post_document", pdf, car["id"], "Good forms"))["post"]
assert done["status"] == "posted" and done["posted_via_api"] and done["format"] == "carousel"
init, put, post = anvil.http.CALLS[-3:]
assert init["url"] == L.DOCS_INIT_URL and json.loads(init["data"]) == {"initializeUploadRequest": {"owner": "urn:li:person:abc123"}}
assert put["method"] == "PUT" and put["url"] == "https://www.linkedin.com/dms-uploads/abc" and put["data"] is pdf and put["headers"]["Authorization"] == "Bearer tok456"
pb = json.loads(post["data"])
assert pb["content"] == {"media": {"title": "Good forms", "id": "urn:li:document:D123"}} and pb["commentary"].startswith("Good forms ask fewer")
bad(call("li_post_document", pdf, car["id"]), "already posted")
car2 = ok(call("save_post", {"text": "Another carousel", "format": "carousel"}))["post"]
anvil.http.REPLIES["https://www.linkedin.com/dms-uploads/"] = lambda u, m, d: anvil.http.HttpError(401, "expired")
r = bad(call("li_post_document", pdf, car2["id"]))
assert "expired" in r["error"] and call("li_status")["connected"] is False and T.posts.get_by_id(car2["id"])["status"] == "draft"
anvil.http.REPLIES["https://www.linkedin.com/dms-uploads/"] = ""
ok(call("li_disconnect"))

# ---------------------------------------------------------------------------------- examples in your own workspace
n_before = len(call("get_workspace")["posts"])
assert ok(call("add_examples"))["added"] == 26
wsx = call("get_workspace")
assert wsx["has_examples"] and len(wsx["posts"]) == n_before + 26 and wsx["analytics"]["example"]
assert ok(call("add_examples"))["added"] == 0, "examples load once"
as_user(bob)
assert len(call("get_workspace")["posts"]) == 1, "examples stay in Ana's workspace"
as_user(ana)
ok(call("remove_examples"))
wsr = call("get_workspace")
assert not wsr["has_examples"] and len(wsr["posts"]) == n_before and wsr["analytics"] is None

# ---------------------------------------------------------------------------------- admin demo data
as_user(admin)
ok(call("demo_load"))
ok(call("demo_load"))
assert M["DemoData"].counts()["posts"] == 26 and M["DemoData"].counts()["users"] == 1, "reloading replaces instead of doubling"
ov = call("admin_overview")
assert ov["posts"] >= 3 and ov["linkedin"] == 0
ok(call("demo_remove"))
assert M["DemoData"].state() == "removed" and not T.posts.search(is_demo=True) and not T.users.search(is_demo=True)
assert T.posts.get_by_id(p1["id"]) is not None, "removing demo data keeps real posts"

# ---------------------------------------------------------------------------------- Privacy & Terms
if "legal_server" in M:
    as_user(ana)
    st = call("legal_state")
    assert st["signedIn"] and st["accepted_version"] is None
    ok(call("legal_accept", st["version"], "signup"))
    assert ana["legal_source"] == "signup" and call("legal_state")["accepted_version"] == st["version"]

# ---------------------------------------------------------------------------------- every callable is covered by a permission check
# A callable that changes data without require_user / a C.require_* check is a security hole. List the public ones here.
PUBLIC = {"session_ping", "get_me", "submit_feedback", "legal_state", "legal_accept"}
for name, (f, need) in sorted(anvil.server.CALLABLES.items()):
    if name in PUBLIC:
        continue
    assert need, "%s is callable by anyone: add require_user=True (or list it in PUBLIC in test_server.py)" % name

print("ALL OK (%d server functions)" % len(anvil.server.CALLABLES))
