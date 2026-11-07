import re

from anvil import *
import anvil.js
import anvil.server
from anvil.js import window

from ._anvil_designer import StudioTemplate
from ... import hl, router, state


def blank():
    return {"id": None, "text": "", "first_comment": "", "pillar": "", "format": "text", "status": "draft",
            "scheduled_at": None, "notes": "", "metrics": {}}


class Studio(StudioTemplate):
    """#studio[/<post id>|new] (Operate; the home page): the editor with a live feed preview cut at the "see more" fold
    (desktop/phone), the post check with fixes, hook lab, structures, AI with the person's own key, first comment,
    notes, pillar and format; autosave, schedule (a reminder: it never posts by itself), post (official API button
    when LinkedIn is connected, else copy and open LinkedIn), mark as posted, results, carousel, delete.
    A new post can be seeded from Ideas or Lab: state.store_set("seed", {text, pillar, idea})."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.mode, self.expanded, self.dirty, self._timer = "desktop", False, False, None
        self.ws: dict = hl.load() or {"profile": {}, "posts": [], "ideas": [], "linkedin": {}}
        pid = args[0] if args else None
        post = None
        if pid and pid != "new":
            post = next((p for p in self.ws["posts"] if p["id"] == pid), None)
            if post is None:
                state.toast("That post isn't here anymore.", "error")
        elif not pid:
            post = next((p for p in self.ws["posts"] if p["status"] == "draft"), None)
        self.post = dict(post) if post else blank()
        seed = state.store_get("seed", None)
        if seed and (not pid or pid == "new"):
            state.store_set("seed", None)
            self.post = blank()
            self.post["text"] = seed.get("text") or ""
            self.post["pillar"] = seed.get("pillar") or ""
            if seed.get("idea"):
                state.store_set("seedIdea", seed.get("idea"))
        self.checks_panel.add_event_handler("x-fix", self._fix)
        self.preview.on_expand = self._expanded
        state.set_control_attr(self.text_box, "aria-label", "Your post")
        state.set_control_attr(self.fc_box, "aria-label", "First comment")
        state.set_control_attr(self.notes_box, "aria-label", "Notes")
        state.set_control_attr(self.fc_box, "rows", 2)
        state.set_control_attr(self.notes_box, "rows", 2)
        self._keys = anvil.js.report_exceptions(self._key)
        window.document.addEventListener("keydown", self._keys)
        self.draw()
        if self.post["text"] and not self.post["id"]:
            self._queue_save()

    # ---------------------------------------------------------------- drawing
    def draw(self):
        p, ws = self.post, self.ws
        li = ws.get("linkedin") or {}
        due = hl.due(ws, but=p.get("id"))
        self.due_bar.visible = bool(due)
        if due:
            self.due_text.text = "%s due now: “%s”" % (state.plural(len(due), "post"), hl.hook(due[0]["text"])[:70])
            state.set_attr(self.due_link, "href", router.href("studio", due[0]["id"]))
        self.page_title.text = "Edit your post" if p.get("id") else "Write a post"
        self.status_line.text = hl.status_label(p.get("status")) if p.get("id") else "New post"
        pillars = (ws.get("profile") or {}).get("pillars") or []
        self.pillar_dd.items = [("No pillar", "")] + [(x["name"], x["id"]) for x in pillars]
        self.pillar_dd.selected_value = p.get("pillar") if any(x["id"] == p.get("pillar") for x in pillars) else ""
        self.format_dd.items = [(v[0], k) for k, v in hl.formats().items()]
        self.format_dd.selected_value = p.get("format") or "text"
        state.set_control_attr(self.pillar_dd, "aria-label", "Content pillar")
        state.set_control_attr(self.format_dd, "aria-label", "Format")
        self.when_label.visible = p.get("status") == "scheduled"
        self.when_label.text = "⏰ " + hl.fmt_datetime(p.get("scheduled_at")) if p.get("scheduled_at") else ""
        self.posted_badge.visible = p.get("status") == "posted"
        self.posted_badge.text = "✓ Posted " + hl.fmt_date(p.get("posted_at")) if p.get("posted_at") else "✓ Posted"
        self.save_label.text = "Saved" if p.get("id") else "Not saved yet"
        self.ai_button.text = "AI" if hl.ai_has() else "AI (add key)"
        self.text_box.text = p.get("text") or ""
        self.fc_box.text = p.get("first_comment") or ""
        self.notes_box.text = p.get("notes") or ""
        if p.get("first_comment"):
            self.dom_nodes["fc_details"].setAttribute("open", "")
        if p.get("notes"):
            self.dom_nodes["notes_details"].setAttribute("open", "")
        posted = p.get("status") == "posted"
        self.schedule_button.text = "Reschedule" if p.get("status") == "scheduled" else "Schedule"
        self.post_button.visible = not posted
        self.post_button.text = "Post now" if li.get("connected") else "Post on LinkedIn"
        self.metrics_button.visible = posted
        self.markposted_button.visible = not posted and bool(p.get("id"))
        self.delete_button.visible = bool(p.get("id"))
        self.update()

    def update(self):
        t = self.post.get("text") or ""
        c = hl.check(t, self.post.get("first_comment") or "")
        n = len(t)
        self.count_label.text = "{:,} / 3,000".format(n)
        self.bar.classes["over"] = n > 3000
        self.dom_nodes["bar_fill"].style.width = "%.1f%%" % min(100, 100.0 * n / 3000)
        words = c.get("words") or 0
        self.readtime_label.text = ("%s · ~%d s read" % (state.plural(words, "word"), max(1, round(words / 230.0 * 60)))) if words else ""
        me = state.me() or {}
        self.mode_desktop.classes["on"] = self.mode == "desktop"
        self.mode_mobile.classes["on"] = self.mode == "mobile"
        self.preview.draw(t, {"name": me.get("name"), "headline": hl.headline(self.ws), "mode": self.mode,
                              "expanded": self.expanded, "format": self.post.get("format")})
        has = bool(t.strip())
        self.score_ring.visible = has
        if has:
            self.score_ring.set(c["score"])
            s = c["score"]
            self.score_title.text = "Ready to go" if s >= 80 else "Nearly there" if s >= 55 else "Needs work"
            todo = len([i for i in c["items"] if i["level"] != "good"])
            self.score_text.text = "%s. Fixes are optional: it's your post." % state.plural(todo, "suggestion")
            self.checks_panel.items = c["items"]
        else:
            self.score_title.text = "Post check"
            self.score_text.text = ("Write a few lines and Hookline checks the hook, the fold, readability, links, "
                                    "hashtags and AI-sounding phrases.")
            self.checks_panel.items = []

    def _expanded(self):
        self.expanded = True

    def mode_desktop_click(self, event):
        self.mode, self.expanded = "desktop", False
        self.update()

    def mode_mobile_click(self, event):
        self.mode, self.expanded = "mobile", False
        self.update()

    # ---------------------------------------------------------------- editing + autosave
    def _read_fields(self):
        self.post["text"] = self.text_box.text or ""
        self.post["first_comment"] = self.fc_box.text or ""
        self.post["notes"] = self.notes_box.text or ""
        self.post["pillar"] = self.pillar_dd.selected_value or ""
        self.post["format"] = self.format_dd.selected_value or "text"

    @handle("text_box", "change")
    def text_box_change(self, **event_args):
        self._read_fields()
        self.update()
        self._queue_save()

    @handle("fc_box", "change")
    def fc_box_change(self, **event_args):
        self._read_fields()
        self.update()
        self._queue_save()

    @handle("notes_box", "change")
    def notes_box_change(self, **event_args):
        self._read_fields()
        self._queue_save()

    @handle("pillar_dd", "change")
    def pillar_dd_change(self, **event_args):
        self._read_fields()
        self._queue_save()

    @handle("format_dd", "change")
    def format_dd_change(self, **event_args):
        self._read_fields()
        self.update()
        self._queue_save()

    def _queue_save(self):
        self.dirty = True
        self.save_label.text = "Editing…"
        if self._timer is not None:
            window.clearTimeout(self._timer)
        self._timer = window.setTimeout(self._autosave, 1400)

    def _autosave(self):
        self._timer = None
        self.save()

    def save(self, extra=None, loud=False):
        """Save the post (quietly unless loud). Returns the server reply, or None."""
        if self._timer is not None:
            window.clearTimeout(self._timer)
            self._timer = None
        self._read_fields()
        if not self.post["text"].strip() and not self.post.get("id"):
            return {"post": self.post}
        body = dict(self.post)
        body.update(extra or {})
        if not body.get("status") or body.get("status") == "idea":
            body["status"] = "draft"
        self.save_label.text = "Saving…"
        try:
            r = state.call("save_post", body) if loud else anvil.server.call_s("save_post", body)
        except Exception:
            self.save_label.text = "Not saved"
            if loud:
                raise
            return None
        if not r or r.get("ok") is False:
            self.save_label.text = "Not saved"
            return None
        is_new = not self.post.get("id")
        keys = ("text", "first_comment", "notes", "pillar", "format")
        local = {k: self.post.get(k) for k in keys}
        self.dirty = any((local[k] or "") != (r["post"].get(k) or "") for k in keys)
        self.post = dict(r["post"])
        self.post.update(local)
        self.save_label.text = "Editing…" if self.dirty else "Saved"
        if is_new:
            router.replace("studio", self.post["id"])
            seed = state.store_get("seedIdea", None)
            if seed:
                state.store_set("seedIdea", None)
                try:
                    anvil.server.call_s("set_idea_used", seed, True)
                except Exception:
                    pass
        hl.put_post(r["post"])
        return r

    def set_text(self, text, focus=False):
        self.post["text"] = text
        self.text_box.text = text
        self.update()
        self._queue_save()
        if focus:
            self.text_box.focus()

    def replace_hook(self, line):
        t = self.post.get("text") or ""
        if not t.strip():
            self.set_text(line + "\n\n", True)
        else:
            lines = t.split("\n")
            lines[0] = line
            self.set_text("\n".join(lines), True)

    def _fix(self, fix=None, **event_args):
        t = self.post.get("text") or ""
        if fix == "plain":
            self.set_text(hl.plain(t))
        elif fix == "link":
            links = re.findall(r"https?://\S+", t)
            fc = self.post.get("first_comment") or ""
            self.post["first_comment"] = (fc + "\n" if fc else "") + "\n".join(links)
            self.fc_box.text = self.post["first_comment"]
            self.dom_nodes["fc_details"].setAttribute("open", "")
            body = re.sub(r"[ \t]+\n", "\n", re.sub(r"\s*https?://\S+", "", t))
            if not re.search(r"(?i)(link|comment)", t):
                body += "\n\n(Link in the first comment.)"
            self.set_text(body)
            state.toast("Moved to the first comment", "ok")

    def _key(self, event):
        if (event.ctrlKey or event.metaKey) and str(event.key).lower() == "s":
            node = anvil.js.get_dom_node(self)
            if node.contains(window.document.activeElement):
                event.preventDefault()
                if self.save(None, True):
                    state.toast("Saved", "ok")

    def leave(self):
        window.document.removeEventListener("keydown", self._keys)
        if self.dirty:
            self.save()

    # ---------------------------------------------------------------- buttons
    @handle("new_button", "click")
    def new_button_click(self, **event_args):
        self.save()
        router.go("studio", "new")

    @handle("save_button", "click")
    def save_button_click(self, **event_args):
        if not (self.text_box.text or "").strip():
            state.toast("Write something first.", "error")
            return
        if self.save(None, True):
            state.toast("Saved", "ok")
            self.draw()

    @handle("hooklab_button", "click")
    def hooklab_button_click(self, **event_args):
        from ...Dialogs.HookLab import HookLab
        line = alert(HookLab(text=self.post.get("text") or ""), buttons=[], role=["app-dialog", "wide"], large=True)
        if line:
            self.replace_hook(line)
            state.toast("First line replaced. Ctrl+Z undoes it.", "ok")

    @handle("struct_button", "click")
    def struct_button_click(self, **event_args):
        from ...Dialogs.Structures import Structures
        key = alert(Structures(), buttons=[], role="app-dialog")
        if key:
            sk = hl.structure_text(key)
            t = self.post.get("text") or ""
            self.set_text(t.rstrip() + "\n\n" + sk if t.strip() else sk, True)

    @handle("ai_button", "click")
    def ai_button_click(self, **event_args):
        if not hl.ai_has():
            from ...Dialogs.AiNudge import AiNudge
            alert(AiNudge(title="AI writing, with your own key", what="draft posts, rewrite in your voice and write hooks",
                          note="Why your own key? It keeps Hookline free for everyone, your drafts go straight from your "
                               "browser to Anthropic, and you only pay for what you use (usually under a cent per post)."),
                  buttons=[], role="app-dialog")
            return
        from ...Dialogs.AiWrite import AiWrite
        result = alert(AiWrite(text=self.post.get("text") or ""), buttons=[], role=["app-dialog", "wide"], large=True)
        if result:
            self.set_text(result, True)
            state.toast("Done. Ctrl+Z in the editor brings back your version.", "ok")

    @handle("carousel_button", "click")
    def carousel_button_click(self, **event_args):
        if not (self.text_box.text or "").strip():
            state.toast("Write the post first: slides start from it.", "error")
            return
        if self.save(None, True):
            router.go("carousel", self.post["id"])

    @handle("schedule_button", "click")
    def schedule_button_click(self, **event_args):
        if not (self.text_box.text or "").strip():
            state.toast("Write something first.", "error")
            return
        from ...Dialogs.Schedule import Schedule
        r = alert(Schedule(post=self.post, posts=self.ws["posts"]), buttons=[], role="app-dialog")
        if not r:
            return
        if r.get("action") == "unschedule":
            if self.save({"status": "draft", "scheduled_at": None}, True):
                state.toast("Back to drafts")
                self.draw()
        elif r.get("when"):
            if self.save({"status": "scheduled", "scheduled_at": r["when"]}, True):
                state.toast("Scheduled for %s. We'll remind you." % hl.fmt_datetime(self.post.get("scheduled_at")), "ok")
                self.draw()

    @handle("post_button", "click")
    def post_button_click(self, **event_args):
        if not (self.text_box.text or "").strip():
            state.toast("Write something first.", "error")
            return
        from ...Dialogs.PostIt import PostIt
        action = alert(PostIt(post=self.post, ws=self.ws), buttons=[], role=["app-dialog", "wide"], large=True)
        if action == "copyopen":
            if self.save() is not None:
                hl.open_linkedin(self.post["text"])
                window.setTimeout(self._ask_posted, 600)
        elif action == "api":
            if self.save() is None:
                return
            r = state.call("li_post", self.post["id"])
            if r:
                self.post = dict(r["post"])
                hl.put_post(r["post"])
                state.toast("Posted on LinkedIn.", "ok")
                if self.post.get("first_comment"):
                    hl.copy(self.post["first_comment"], "First comment copied: paste it under your post.")
                self.draw()
        elif action == "apicar":
            if self.save() is None:
                return
            p2 = hl.post_carousel(self.post)
            if p2:
                self.post = dict(p2)
                self.draw()

    def _ask_posted(self):
        self.markposted_button_click()

    @handle("markposted_button", "click")
    def markposted_button_click(self, **event_args):
        from ...Dialogs.MarkPosted import MarkPosted
        url = alert(MarkPosted(post=self.post), buttons=[], role="app-dialog")
        if url is None:
            return
        if self.save() is None:
            return
        r = state.call("mark_posted", self.post["id"], url)
        if r:
            self.post = dict(r["post"])
            hl.put_post(r["post"])
            state.toast("Nice. Log the results in a day or two.", "ok")
            self.draw()

    @handle("metrics_button", "click")
    def metrics_button_click(self, **event_args):
        from ...Dialogs.Metrics import Metrics
        v = alert(Metrics(post=self.post), buttons=[], role="app-dialog")
        if not v:
            return
        r = state.call("save_metrics", self.post["id"], v, v.get("url"))
        if r:
            self.post = dict(r["post"])
            hl.put_post(r["post"])
            state.toast("Saved", "ok")

    @handle("delete_button", "click")
    def delete_button_click(self, **event_args):
        if confirm("This can't be undone.", title="Delete this post?", buttons=[("Cancel", False), ("Delete", True)],
                   role="app-dialog"):
            self.dirty = False
            if state.call("delete_post", self.post["id"]) is not None:
                state.toast("Deleted")
                router.go("posts")
