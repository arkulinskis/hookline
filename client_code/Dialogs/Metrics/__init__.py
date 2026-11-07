from anvil import *

from ._anvil_designer import MetricsTemplate
from ... import state

KEYS = ["impressions", "reactions", "comments", "reposts", "saves", "clicks"]


class Metrics(MetricsTemplate):
    """Log a posted post's numbers by hand. Closes with {impressions ... clicks, url} or None."""

    def __init__(self, post=None, **properties):
        super().__init__(**properties)
        post = post or {}
        m = post.get("metrics") or {}
        for k in KEYS:
            box = getattr(self, "m_" + k)
            box.text = m.get(k)
        self.url_box.text = post.get("url") or ""
        state.control(self.url_box).setAttribute("type", "url")

    @handle("cancel_button", "click")
    def cancel_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)

    @handle("save_button", "click")
    def save_button_click(self, **event_args):
        v: dict = {}
        for k in KEYS:
            t = getattr(self, "m_" + k).text
            v[k] = "" if t is None else str(t)
        v["url"] = (self.url_box.text or "").strip()
        self.raise_event("x-close-alert", value=v)
