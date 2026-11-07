"""Page addresses: #name/arg1/arg2 -> a page Form (open_form), with sign-in rules. Same addresses as the JavaScript
version, so shared links keep working (#studio/<post id>, #calendar/2026-11, #lab/hooks, #voice/linkedin?ok=1 ...).

Links in templates are plain <a href="#posts">; code calls router.go("studio", post_id).

    PAGES[name] = (who may open it, browser-tab title)   who: None = anyone, "guest" = signed out only, "user", "admin"
    NAV = the main menu (header for members): (page, label, icon). The phone tab bar shows the first 4 + More.
New page: add it to PAGES, to _form() and (if it belongs in the menu) to NAV.
A page may define leave() (router calls it before the next page opens: autosave, key listeners).
"""
import anvil
import anvil.js
from anvil.js import window

from . import state

PAGES = {
    "landing": (None, "Welcome"),
    "auth": ("guest", "Sign in"),
    "studio": ("user", "Write"),
    "posts": ("user", "Posts"),
    "calendar": ("user", "Calendar"),
    "insights": ("user", "Insights"),
    "ideas": ("user", "Ideas"),
    "lab": ("user", "Lab"),
    "voice": ("user", "Voice & settings"),
    "carousel": ("user", "Carousel"),
    "profile": ("user", "Your profile"),
    "admin": ("admin", "Admin"),
}
NAV = [("studio", "Write", "pen"), ("posts", "Posts", "list"), ("calendar", "Calendar", "calendar"),
       ("insights", "Insights", "chart"), ("ideas", "Ideas", "bulb"), ("lab", "Lab", "wand"), ("voice", "Voice", "sliders")]
HOME = "studio"
APP_NAME = "Hookline"
_r: dict = {"after": "", "listening": False, "page": None}


def _form(name):
    """The page's Form class (imported when first needed, so start-up stays quick)."""
    if name == "landing":
        from .Pages.Landing import Landing
        return Landing
    if name == "auth":
        from .Pages.Auth import Auth
        return Auth
    if name == "studio":
        from .Pages.Studio import Studio
        return Studio
    if name == "posts":
        from .Pages.Posts import Posts
        return Posts
    if name == "calendar":
        from .Pages.Calendar import Calendar
        return Calendar
    if name == "insights":
        from .Pages.Insights import Insights
        return Insights
    if name == "ideas":
        from .Pages.Ideas import Ideas
        return Ideas
    if name == "lab":
        from .Pages.Lab import Lab
        return Lab
    if name == "voice":
        from .Pages.Voice import Voice
        return Voice
    if name == "carousel":
        from .Pages.Carousel import Carousel
        return Carousel
    if name == "profile":
        from .Pages.Profile import Profile
        return Profile
    from .Pages.Admin import Admin
    return Admin


def parse(hash_text):
    h = (hash_text or "").lstrip("#").lstrip("!").lstrip("/").split("?")[0]
    parts = [window.decodeURIComponent(p) for p in h.split("/") if p]
    return (parts[0] if parts else ""), parts[1:]


def query():
    """The part after ? in the address (#voice/linkedin?ok=1 -> 'ok=1')."""
    h = window.location.hash or ""
    return h.split("?", 1)[1] if "?" in h else ""


def href(name, *args):
    """'#name/arg1/arg2' with every part URL-encoded (row ids contain brackets and commas)."""
    return "#" + "/".join([name] + [window.encodeURIComponent(str(a)) for a in args if a not in (None, "")])


def home_page():
    return HOME if state.me() else "landing"


def show():
    """Open the page for the current address."""
    name, args = parse(window.location.hash)
    if name not in PAGES:
        name, args = home_page(), []
    who = PAGES[name][0]
    if who == "guest" and state.me():
        name, args = HOME, []
    elif who in ("user", "admin") and not state.me():
        _r["after"] = window.location.hash
        name, args = "auth", []
    elif who == "admin" and not state.is_admin():
        state.toast("That page is for admins only.", "error")
        name, args = HOME, []
    old = _r["page"]
    if old is not None and hasattr(old, "leave"):
        try:
            old.leave()
        except Exception as e:  # leaving must never block the next page
            print("leave failed: %r" % e)
    window.document.title = PAGES[name][1] + " · " + APP_NAME
    window.UI_READY = False
    page = _form(name)(args=args)
    _r["page"] = page
    anvil.open_form(page)
    shell = getattr(page, "layout", None)
    if shell is not None and hasattr(shell, "refresh"):
        shell.refresh(name)  # Anvil reuses the layout between pages: tell it who is signed in and which page is open
    window.scrollTo(0, 0)
    window.UI_READY = True  # tests and screenshots wait for this


def go(name, *args):
    """Go to a page. Same address again = reload the page."""
    target = href(name, *args)
    if window.location.hash == target:
        show()
    else:
        window.location.hash = target


def replace(name, *args):
    """Change the address without opening anything (a page that switches its own view)."""
    window.history.replaceState(None, "", href(name, *args))


def after_sign_in():
    """Where to go once someone signs in: the page they were heading for, or home."""
    target = _r["after"]
    _r["after"] = ""
    if target and target != window.location.hash:
        window.location.hash = target
    else:
        go(HOME)


def remember_after(target):
    _r["after"] = target


def _on_hash(event):
    show()


def start():
    if not _r["listening"]:
        window.addEventListener("hashchange", anvil.js.report_exceptions(_on_hash))
        _r["listening"] = True
    show()
