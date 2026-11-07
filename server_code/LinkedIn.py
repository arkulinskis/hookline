"""Posting to LinkedIn through LinkedIn's official API, only when the person presses "Post now".

LinkedIn's API terms forbid automating posting, so Hookline never publishes on a timer: scheduled posts get a
reminder (Studio.send_reminders) and the person posts them. No cookies, no browser extension, no scraping.

Setup (admin, once): a LinkedIn developer app with the products "Sign In with LinkedIn using OpenID Connect" and
"Share on LinkedIn", its redirect URL set to <app>/_/api/li/callback, and two App Secrets:
linkedin_client_id and linkedin_client_secret. Without them, the app works the same, with "Copy and open LinkedIn".

Tokens last 60 days (self-serve apps get no refresh tokens), so the app shows a reconnect reminder.
"""
import datetime as dt
import json
import re
import secrets
import urllib.parse

import anvil.server
from typing import Any
import anvil.http
from anvil.tables import app_tables

from . import common as C

AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization"
TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
USERINFO_URL = "https://api.linkedin.com/v2/userinfo"
POSTS_URL = "https://api.linkedin.com/rest/posts"
SCOPES = "openid profile w_member_social"
DEFAULT_VERSION = "202608"


def _secret(name):
    try:
        import anvil.secrets
        return anvil.secrets.get_secret(name)
    except Exception:
        return None


def configured():
    return bool(_secret("linkedin_client_id") and _secret("linkedin_client_secret"))


def redirect_uri():
    return anvil.server.get_app_origin() + "/_/api/li/callback"


def api_version():
    v = str(C.get_setting("li_version", DEFAULT_VERSION) or DEFAULT_VERSION)
    return v if re.match(r"^20\d{4}$", v) else DEFAULT_VERSION


def _link(user):
    return app_tables.li_links.get(user=user)


def status_for(user):
    on = configured()
    row = _link(user)
    if row is None or not row["token"]:
        return {"configured": on, "connected": False}
    left = (row["expires_at"] - C.now()).total_seconds() / 86400 if row["expires_at"] else 0
    return {"configured": on, "connected": left > 0, "expired": left <= 0, "name": row["name"] or "", "picture": row["picture"] or "",
            "expires_at": C.iso(row["expires_at"]), "days_left": max(0, int(left))}


@anvil.server.callable(require_user=True)
def li_status():
    return status_for(C.require_user())


@anvil.server.callable(require_user=True)
def li_auth_url():
    me = C.require_user()
    if not configured():
        return C.fail("LinkedIn posting isn't set up on this Hookline yet. Use Copy and open LinkedIn for now.")
    row = _link(me) or app_tables.li_links.add_row(user=me, token="")
    state = secrets.token_urlsafe(24)
    row.update(state=state, state_at=C.now())
    q = urllib.parse.urlencode({"response_type": "code", "client_id": _secret("linkedin_client_id"), "redirect_uri": redirect_uri(),
                                "state": state, "scope": SCOPES})
    return C.ok(url=AUTH_URL + "?" + q)


def _page(ok, message):
    back = anvil.server.get_app_origin() + "/#voice/linkedin?" + ("ok=1" if ok else "error=" + urllib.parse.quote(message[:120]))
    html = ("<!doctype html><meta charset='utf-8'><meta name='viewport' content='width=device-width'><title>Hookline</title>"
            "<body style=\"font:16px system-ui;background:#f5f7fa;color:#0f1b2d;display:grid;place-items:center;height:100vh;margin:0\">"
            "<div style='text-align:center;max-width:420px;padding:24px'><h1 style='font-weight:500'>%s</h1><p>%s</p>"
            "<p><a href='%s' style='color:#1e3a5f'>Back to Hookline</a></p></div>"
            "<script>setTimeout(function(){location.href=%s},1200)</script>" %
            ("Connected" if ok else "Not connected", C.text(message, 200).replace("<", "&lt;"), back, json.dumps(back)))
    return anvil.server.HttpResponse(200, html, headers={"Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store"})


@anvil.server.http_endpoint("/li/callback")
def li_callback(code=None, state=None, error=None, error_description=None, **kw):
    if error:
        return _page(False, error_description or "LinkedIn didn't give permission.")
    row = app_tables.li_links.get(state=C.text(state, 80)) if state else None
    if row is None or row["state_at"] is None or (C.now() - row["state_at"]).total_seconds() > 900:
        return _page(False, "That sign-in link expired. Try Connect again.")
    row.update(state="", state_at=None)
    try:
        tok: Any = anvil.http.request(TOKEN_URL, method="POST", json=True, headers={"Content-Type": "application/x-www-form-urlencoded"},
                                 data=urllib.parse.urlencode({"grant_type": "authorization_code", "code": C.text(code, 2000),
                                                              "redirect_uri": redirect_uri(), "client_id": _secret("linkedin_client_id"),
                                                              "client_secret": _secret("linkedin_client_secret")}))
        info: Any = anvil.http.request(USERINFO_URL, json=True, headers={"Authorization": "Bearer " + tok["access_token"]})
    except Exception as e:
        print("linkedin connect failed: %r" % e)
        return _page(False, "LinkedIn didn't accept the connection. Please try again.")
    row.update(token=tok["access_token"], expires_at=C.now() + dt.timedelta(seconds=int(tok.get("expires_in") or 5184000)),
               sub=C.text(info.get("sub"), 120), name=C.text(info.get("name"), 120), picture=C.text(info.get("picture"), 600),
               connected_at=C.now())
    return _page(True, "Hookline can now post for you when you press Post now. It never posts by itself.")


@anvil.server.callable(require_user=True)
def li_disconnect():
    me = C.require_user()
    row = _link(me)
    if row is not None:
        row.delete()
    return C.ok(linkedin=status_for(me))


def little_text(text):
    """LinkedIn's "little text" format: escape reserved characters, keep #hashtags as hashtags."""
    reserved = set("\\|{}@[]()<>#*_~")
    out, i = [], 0
    while i < len(text):
        m = re.match(r"#([A-Za-z0-9_À-ɏ]+)", text[i:])
        if m and (i == 0 or not text[i - 1].isalnum()):
            out.append("{hashtag|\\#|%s}" % m.group(1).replace("_", "\\_"))
            i += len(m.group(0))
            continue
        ch = text[i]
        out.append("\\" + ch if ch in reserved else ch)
        i += 1
    return "".join(out)


def _ready(me, post_id):
    """(post row, link row) when this person may publish this post now, else (None, fail reply)."""
    r = C.row_by_id(app_tables.posts, post_id)
    if r is None or r["owner"] != me:
        return None, C.fail("That post no longer exists.")
    if r["status"] == "posted":
        return None, C.fail("This one is already posted.")
    text = (r["text"] or "").strip()
    if not text:
        return None, C.fail("Write something first.")
    if len(text) > 3000:
        return None, C.fail("LinkedIn posts can be up to 3,000 characters.")
    if not status_for(me).get("connected"):
        return None, C.fail("Connect LinkedIn first (it expires every 60 days).")
    if C.rate_limited("li_post", 10, 3600):
        return None, C.fail("That's a lot of posts in an hour. LinkedIn may limit you: try again later.")
    return r, _link(me)


def _headers(row, content_type="application/json"):
    h = {"Authorization": "Bearer " + row["token"], "LinkedIn-Version": api_version(), "X-Restli-Protocol-Version": "2.0.0"}
    if content_type:
        h["Content-Type"] = content_type
    return h


def _failed(e, row, what="the post"):
    status = getattr(e, "status", 0)
    print("linkedin %s failed: %s %r" % (what, status, getattr(e, "content", "")))
    if status == 401:
        row["expires_at"] = C.now()
        return C.fail("LinkedIn says the connection expired. Reconnect and try again.")
    if status == 403:
        return C.fail("LinkedIn didn't allow %s (HTTP 403). Your app may need the \"Share on LinkedIn\" product, or reconnect." % what)
    if status == 429:
        return C.fail("LinkedIn's daily limit is reached. Post it by hand, or try tomorrow.")
    if status in (400, 422, 426):
        return C.fail("LinkedIn refused %s (HTTP %s). Post it by hand; an admin may need to update the API version." % (what, status))
    return C.fail("LinkedIn didn't take %s (HTTP %s). Your text is safe: post it by hand." % (what, status))


def _publish(r, row, content=None):
    body = {"author": "urn:li:person:" + row["sub"], "commentary": little_text((r["text"] or "").strip()), "visibility": "PUBLIC",
            "distribution": {"feedDistribution": "MAIN_FEED", "targetEntities": [], "thirdPartyDistributionChannels": []},
            "lifecycleState": "PUBLISHED", "isReshareDisabledByAuthor": False}
    if content:
        body["content"] = content
    anvil.http.request(POSTS_URL, method="POST", data=json.dumps(body), headers=_headers(row))
    r.update(status="posted", posted_at=C.now(), li_urn="api:" + C.iso(C.now()), updated=C.now())


@anvil.server.callable(require_user=True)
def li_post(post_id):
    """Publish one of your posts now, as text, through the official Posts API. Called only by a button press."""
    me = C.require_user()
    r, row = _ready(me, post_id)
    if r is None:
        return row
    try:
        _publish(r, row)
    except anvil.http.HttpError as e:
        return _failed(e, row)
    from . import Studio
    return C.ok(post=Studio.post_dict(r))


DOCS_INIT_URL = "https://api.linkedin.com/rest/documents?action=initializeUpload"
MAX_DOC = 20 * 1024 * 1024   # LinkedIn takes up to 100 MB / 300 pages; Anvil uploads stay sensible at 20 MB


@anvil.server.callable(require_user=True)
def li_post_document(media, post_id, title=None):
    """Publish a post with a PDF document attached (a carousel), through the official Documents + Posts APIs:
    initialize the upload for the member, PUT the PDF to the upload URL, then create the post pointing at the document."""
    me = C.require_user()
    r, row = _ready(me, post_id)
    if r is None:
        return row
    data = media.get_bytes() if media is not None else b""
    if not data.startswith(b"%PDF"):
        return C.fail("That isn't a PDF. Make the carousel again and retry.")
    if len(data) > MAX_DOC:
        return C.fail("The PDF is %.1f MB. Keep carousels under 20 MB (fewer or simpler slides)." % (len(data) / 1048576.0))
    owner = "urn:li:person:" + row["sub"]
    try:
        init: Any = anvil.http.request(DOCS_INIT_URL, method="POST", json=True, headers=_headers(row),
                                  data=json.dumps({"initializeUploadRequest": {"owner": owner}}))
        value = (init or {}).get("value") or {}
        upload_url, doc = value.get("uploadUrl"), value.get("document")
        if not upload_url or not doc:
            return C.fail("LinkedIn didn't give an upload address for the document. Try again, or post it by hand.")
        anvil.http.request(upload_url, method="PUT", data=media, headers={"Authorization": "Bearer " + row["token"]})
    except anvil.http.HttpError as e:
        return _failed(e, row, "the PDF upload")
    title = C.text(title, 120) or (r["text"] or "").strip().split("\n")[0][:120] or "Carousel"
    try:
        _publish(r, row, {"media": {"title": title, "id": doc}})
    except anvil.http.HttpError as e:
        return _failed(e, row)
    r["format"] = "carousel"
    from . import Studio
    return C.ok(post=Studio.post_dict(r))


# ------------------------------------------------------------------------------------------- admin
@anvil.server.callable(require_user=True)
def li_admin():
    C.require_admin()
    return {"configured": configured(), "redirect_uri": redirect_uri(), "version": api_version(),
            "connections": len([x for x in app_tables.li_links.search() if x["token"]])}


@anvil.server.callable(require_user=True)
def li_set_version(version):
    C.require_admin()
    v = C.text(version, 6)
    if not re.match(r"^20\d{4}$", v):
        return C.fail("Use LinkedIn's YYYYMM version format, for example 202609.")
    C.set_setting("li_version", v)
    return C.ok(version=v)
