from anvil import *

from ._anvil_designer import PostItTemplate
from ... import hl, state


class PostIt(PostItTemplate):
    """Before posting: the preview, any blocking problem, and the ways to post. Nothing posts until a button here
    is pressed. Closes with "copyopen", "api", "apicar" or None."""

    def __init__(self, post=None, ws=None, **properties):
        super().__init__(**properties)
        post, ws = post or {}, ws or {}
        li = ws.get("linkedin") or {}
        c = hl.check(post.get("text") or "")
        bad = [i for i in c["items"] if i["level"] == "bad"]
        self.bad_label.visible = bool(bad)
        if bad:
            self.bad_label.text = "%s: %s" % (bad[0]["title"], bad[0]["text"])
        me = state.me() or {}
        self.preview.draw(post.get("text") or "", {"name": me.get("name"), "headline": hl.headline(ws), "mode": "desktop",
                                                    "format": post.get("format")})
        car = post.get("carousel") or {}
        n = len(car.get("slides") or [])
        has_slides = post.get("format") == "carousel" and n > 0
        connected = bool(li.get("connected"))
        if connected:
            extra = ("With the carousel, your %d slides go up as a PDF document under the text." % n if has_slides else
                     "Text only: add your %s on LinkedIn afterwards, or use Copy and open instead." % hl.format_label(post.get("format")).lower()
                     if post.get("format") not in (None, "", "text") else "")
            self.li_label.text = ("Posts as %s through LinkedIn's official API. " % (li.get("name") or "you")) + extra
        self.li_label.visible = connected
        self.then_label.visible = bool(post.get("first_comment"))
        self.apicar_button.visible = connected and has_slides
        self.api_button.visible = connected
        self.api_button.text = "Post text only" if has_slides else "Post now"
        if has_slides:
            self.api_button.role = ["btn", "ic-send"]
        self.connect_hint.visible = not connected and bool(li.get("configured"))
        self.dom_nodes["connect_link"].addEventListener("click", self._go)

    def _go(self, event):
        self.raise_event("x-close-alert", value=None)

    @handle("copyopen_button", "click")
    def copyopen_button_click(self, **event_args):
        self.raise_event("x-close-alert", value="copyopen")

    @handle("api_button", "click")
    def api_button_click(self, **event_args):
        self.raise_event("x-close-alert", value="api")

    @handle("apicar_button", "click")
    def apicar_button_click(self, **event_args):
        self.raise_event("x-close-alert", value="apicar")
