import json

from anvil import *
from anvil.js import window

from ._anvil_designer import LaunchTemplate
from ... import hl, router, state

STARTERS = [
    "Thanks, [name]. The part about [their point] is exactly where I got stuck too. What did you try?",
    "Good question. Short answer: [answer]. The longer one: [one detail from your experience].",
    "Fair push-back. Where I've seen it hold up is [situation]. Where does it break for you?",
    "Love this addition, [name]. Mind if I build a follow-up post on it?",
    "[Name], you'd know this better than me: how does it look in [their field]?",
]
DAY_MS = 24 * 3600 * 1000


class Launch(LaunchTemplate):
    """#launch/<post id> (Operate): the first hour after posting. A timer since the post went out (0-60-90 min), a
    checklist kept in this browser (first comment, keep it open, reply to every comment, comment on others' posts,
    log the results), reply starters to copy. Hookline never comments or replies for you: it's a guide for a human."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self._timer, self._alive = None, True
        self.pid = args[0] if args else None
        self.ws: dict = hl.load() or {"profile": {}, "posts": []}
        self.post = next((dict(p) for p in self.ws.get("posts") or [] if p.get("id") == self.pid), None)
        self.done = []
        state.heading(self.page_title, 1)
        self.draw()

    # ---------------------------------------------------------------- ticks (this browser only)
    def _store_key(self):
        return "hookline.launch." + str(self.pid)

    def _load_ticks(self):
        try:
            raw = window.localStorage.getItem(self._store_key())
            got = json.loads(str(raw)) if raw else []
            return [str(k) for k in got] if isinstance(got, list) else []
        except Exception:
            return []

    def _save_ticks(self):
        try:
            window.localStorage.setItem(self._store_key(), json.dumps(self.done))
        except Exception:
            pass  # private windows: ticks just don't survive a reload

    # ---------------------------------------------------------------- drawing
    def draw(self):
        p = self.post
        posted = bool(p) and p.get("status") == "posted"
        self.main_part.visible = posted
        self.missing_part.visible = not posted
        d = self.dom_nodes
        if not p:
            self.hook_label.text = ""
            return
        self.hook_label.text = "“%s”" % hl.hook(p.get("text"))[:110]
        if not posted:
            d["missing_title"].textContent = "This post isn’t posted yet"
            d["missing_text"].textContent = ("Post it first, then come back here: a short checklist for the hour that "
                                             "decides how far it travels.")
            d["missing_link"].textContent = "Open the post"
            d["missing_link"].setAttribute("href", router.href("studio", p["id"]))
            return
        self.done = self._load_ticks()
        self._draw_steps()
        self.starters_panel.items = [{"text": s, "n": i + 1} for i, s in enumerate(STARTERS)]
        self._tick()

    def steps(self):
        p = self.post or {}
        fc = (p.get("first_comment") or "").strip()
        url = (p.get("url") or "").strip()
        m = p.get("metrics") or {}
        return [
            {"key": "fc", "title": "Post your first comment",
             "text": ("Your link or extra line goes under the post now, while it's fresh." if fc else
                      "No first comment saved. A line of context or a question under your own post starts the thread."),
             "action": "Copy first comment" if fc else ""},
            {"key": "open", "title": "Keep the post open",
             "text": "Watch for comments for the next hour." + ("" if url else " (Add the post's link on the post page to open it in one click.)"),
             "action": "Open post" if url else "Open LinkedIn"},
            {"key": "reply", "title": "Reply to every comment",
             "text": "A real sentence or a question back, not just “Thanks!”. Conversations travel further than likes.",
             "action": ""},
            {"key": "others", "title": "Comment on 3 posts in your niche",
             "text": "Thoughtful comments on other people's posts bring them back to yours.",
             "action": "Comment helper"},
            {"key": "results", "title": "Log the results tomorrow",
             "text": ("Logged: %s impressions." % hl.fmt_num(m.get("impressions")) if m.get("impressions") else
                      "Copy the numbers from LinkedIn after a day, so Insights learns what works for you."),
             "action": "Update results" if m.get("impressions") else "Log results"},
        ]

    def _draw_steps(self):
        steps = self.steps()
        for s in steps:
            s["done"] = s["key"] in self.done
            s["host"] = self
        self.steps_panel.items = steps
        n = len([s for s in steps if s["done"]])
        self.done_label.text = "All done. Nice work." if n == len(steps) else "%d of %d done" % (n, len(steps))

    def _tick(self):
        self._timer = None
        if not self._alive or not self.post:
            return
        at = self.post.get("posted_at")
        fill = self.dom_nodes["track_fill"]
        if not at:
            self.clock_label.text = "Posted"
            self.phase_label.text = "Reply to comments as they come in, and log the results tomorrow."
            fill.style.width = "100%"
            return
        ms = max(0.0, hl.now_ms() - hl.time_ms(at))
        mins = int(ms / 60000)
        if mins < 120:
            self.clock_label.text = "%d min since posting" % mins
        elif ms < 2 * DAY_MS:
            self.clock_label.text = "%d h since posting" % int(mins / 60)
        else:
            self.clock_label.text = "Posted " + hl.ago(at)
        if mins < 60:
            self.phase_label.text = "Stay close: replies in this hour count most."
        elif mins < 90:
            self.phase_label.text = "Keep replying to new comments. The post is still finding its people."
        elif ms < DAY_MS:
            self.phase_label.text = "The busy part is over. Answer late comments when you see them, and log the results tomorrow."
        else:
            self.phase_label.text = "A day or more since posting: a good time to log the results."
        fill.style.width = "%.1f%%" % min(100.0, 100.0 * mins / 90.0)
        if ms < DAY_MS:
            self._timer = window.setTimeout(self._tick, 30000)

    def leave(self):
        self._alive = False
        if self._timer is not None:
            window.clearTimeout(self._timer)
            self._timer = None

    # ---------------------------------------------------------------- what the steps do (called by Items/LaunchStep)
    def tick(self, key, flag):
        self.done = [k for k in self.done if k != key] + ([key] if flag else [])
        self._save_ticks()
        n = len(self.done)
        total = len(self.steps())
        self.done_label.text = "All done. Nice work." if n >= total else "%d of %d done" % (n, total)

    def act(self, key):
        p = self.post or {}
        if key == "fc":
            hl.copy(p.get("first_comment") or "", "First comment copied: paste it under your post.")
            self.tick("fc", True)
            self._draw_steps()
        elif key == "open":
            window.open((p.get("url") or "").strip() or "https://www.linkedin.com/notifications/", "_blank", "noopener")
        elif key == "others":
            router.go("lab", "comments")
        elif key == "results":
            from ...Dialogs.Metrics import Metrics
            v = alert(Metrics(post=p), buttons=[], role="app-dialog")
            if not v:
                return
            r = state.call("save_metrics", p["id"], v, v.get("url"))
            if r:
                self.post = dict(r["post"])
                hl.put_post(r["post"])
                self.tick("results", True)
                self._draw_steps()
                state.toast("Saved", "ok")
