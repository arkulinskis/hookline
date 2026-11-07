import copy
import json

from anvil import *
import anvil.js
import anvil.server
from anvil.js import window

from ._anvil_designer import CarouselTemplate
from ... import hl, router, state


class Carousel(CarouselTemplate):
    """#carousel/<post id> (Operate): slides for a post (from its paragraphs, saved slides, or AI with your key), four
    themes, a name on every slide, drawn on a 1080x1350 canvas (hl-media.js), a PDF to download, or posted as a
    LinkedIn document (asks first). Changes save quietly."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.cur, self._timer = 0, None
        self.ws: dict = hl.load() or {"profile": {}, "posts": [], "linkedin": {}}
        pid = args[0] if args else None
        found = next((dict(p) for p in self.ws["posts"] if p["id"] == pid), None)
        self.missing.visible = found is None
        self.editor.visible = found is not None
        self.ready = found is not None
        self.post: dict = found or {}
        if found is None:
            return
        saved = self.post.get("carousel") or {}
        self.car = copy.deepcopy(saved) if saved.get("slides") else hl.carousel_for(self.post)
        if not self.car.get("slides"):
            self.car["slides"] = [{"title": hl.hook(self.post.get("text")) or "Title", "body": ""}]
        state.set_attr(self.back_link, "href", router.href("studio", self.post["id"]))
        self.handle_box.text = self.car.get("handle") or ""
        state.set_control_attr(self.handle_box, "maxlength", 60)
        state.set_control_attr(self.handle_box, "placeholder", (state.me() or {}).get("name") or "")
        self.themes_panel.add_event_handler("x-seg", self._theme)
        self.draw()

    @handle("", "show")
    def form_show(self, **event_args):
        if self.ready:
            self.preview()

    def can_post(self):
        return bool((self.ws.get("linkedin") or {}).get("connected")) and self.post.get("status") != "posted"

    def draw(self):
        has = hl.ai_has()
        self.regen_button.text = "Slides with AI" if has else "Rebuild from post"
        self.regen_button.role = ["btn", "ic-sparkle" if has else "ic-refresh"]
        self.pdf_button.role = ["btn", "ic-download"] if self.can_post() else ["btn", "btn-gold", "ic-download"]
        self.lipost_button.visible = self.can_post()
        self.posted_badge.visible = self.post.get("status") == "posted"
        themes = hl.py(window.HLC.THEMES)
        self.themes_panel.items = [{"key": k, "name": v["name"], "bg": v["bg"], "accent": v["accent"], "on": k == self.car.get("theme")}
                                   for k, v in themes.items()]
        n = len(self.car["slides"])
        self.slides_panel.items = [{"i": i, "n": n, "slide": s, "on": i == self.cur, "host": self} for i, s in enumerate(self.car["slides"])]
        self.add_button.enabled = n < 20
        self.preview()

    def preview(self):
        slides = self.car["slides"]
        if not slides:
            return
        self.cur = max(0, min(self.cur, len(slides) - 1))
        name = self.car.get("handle") or (state.me() or {}).get("name") or ""
        window.HLC.render(self.dom_nodes["canvas"], json.dumps(slides[self.cur]), self.cur, len(slides), self.car.get("theme") or "navy", name)
        self.dom_nodes["pos"].textContent = "%d / %d" % (self.cur + 1, len(slides))
        for it in self.slides_panel.items or []:
            if it.get("form"):
                it["form"].set_on(it["i"] == self.cur)

    def persist(self):
        if self._timer is not None:
            window.clearTimeout(self._timer)
        self._timer = window.setTimeout(self._save_quiet, 900)

    def _body(self):
        b = dict(self.post)
        b.update({"carousel": self.car, "format": "carousel"})
        return b

    def _save_quiet(self):
        self._timer = None
        try:
            r = anvil.server.call_s("save_post", self._body())
            if r and r.get("post"):
                self.post = dict(r["post"])
                hl.put_post(r["post"])
        except Exception:
            pass

    def leave(self):
        if self._timer is not None:
            window.clearTimeout(self._timer)
            self._save_quiet()

    # ---- slides (Items/SlideEdit calls these)
    def select(self, i):
        if i != self.cur:
            self.cur = i
            self.preview()

    def edit(self, i, title, body):
        self.car["slides"][i] = {"title": title, "body": body}
        self.cur = i
        self.preview()
        self.persist()

    def move(self, i, d):
        j = i + d
        s = self.car["slides"]
        if 0 <= j < len(s):
            s.insert(j, s.pop(i))
            self.cur = j
            self.draw()
            self.persist()

    def remove(self, i):
        if len(self.car["slides"]) <= 1:
            return
        self.car["slides"].pop(i)
        self.cur = min(self.cur, len(self.car["slides"]) - 1)
        self.draw()
        self.persist()

    def _theme(self, key=None, **event_args):
        self.car["theme"] = key
        k = state.focus_key()
        self.draw()
        state.refocus(self.themes_panel, k)
        self.persist()

    @handle("handle_box", "change")
    def handle_box_change(self, **event_args):
        self.car["handle"] = self.handle_box.text or ""
        self.preview()
        self.persist()

    @handle("add_button", "click")
    def add_button_click(self, **event_args):
        self.car["slides"].append({"title": "New slide", "body": ""})
        self.cur = len(self.car["slides"]) - 1
        self.draw()
        self.persist()

    @handle("prev_button", "click")
    def prev_button_click(self, **event_args):
        self.cur = max(0, self.cur - 1)
        self.preview()

    @handle("next_button", "click")
    def next_button_click(self, **event_args):
        self.cur = min(len(self.car["slides"]) - 1, self.cur + 1)
        self.preview()

    @handle("pdf_button", "click")
    def pdf_button_click(self, **event_args):
        self.pdf_button.enabled = False
        try:
            f = window.HLC.pdf(json.dumps(self.post), json.dumps(self.car), (state.me() or {}).get("name") or "")
            window.HLC.download(f)
            state.toast("PDF downloaded. Upload it as a document on LinkedIn.", "ok")
        except Exception:
            state.toast("Couldn't make the PDF.", "error")
        finally:
            self.pdf_button.enabled = True

    @handle("lipost_button", "click")
    def lipost_button_click(self, **event_args):
        if self._timer is not None:
            window.clearTimeout(self._timer)
            self._timer = None
        r = state.call("save_post", self._body())
        if not r:
            return
        self.post = dict(r["post"])
        p2 = hl.post_carousel(self.post, self.car)
        if p2:
            self.post = dict(p2)
            self.draw()

    @handle("regen_button", "click")
    def regen_button_click(self, **event_args):
        has = hl.ai_has()
        if not confirm("The AI writes new slides from your post." if has else "Slides are rebuilt from your post's paragraphs.",
                       title="Replace these slides?", buttons=[("Cancel", False), ("Replace", True)], role="app-dialog"):
            return
        if has:
            self.regen_button.enabled = False
            try:
                sl = hl.ai_call("slides", self.post.get("text") or "")
            except Exception as e:
                state.toast(hl.ai_error(e), "error")
                return
            finally:
                self.regen_button.enabled = True
        else:
            sl = json.loads(window.HLC.fromPost(self.post.get("text") or ""))
        if sl:
            self.car["slides"] = sl[:20]
            self.cur = 0
            self.draw()
            self.persist()
