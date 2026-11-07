from anvil import *

from ._anvil_designer import MarkPostedTemplate
from ... import hl, state


class MarkPosted(MarkPostedTemplate):
    """After posting by hand: mark it as posted (with its link). Closes with the link ("" for none) or None (not yet)."""

    def __init__(self, post=None, **properties):
        super().__init__(**properties)
        self.post = post or {}
        self.url_box.text = self.post.get("url") or ""
        state.control(self.url_box).setAttribute("type", "url")
        state.set_control_attr(self.url_box, "aria-label", "Post link")
        self.fc_row.visible = bool(self.post.get("first_comment"))

    @handle("fc_button", "click")
    def fc_button_click(self, **event_args):
        hl.copy(self.post.get("first_comment") or "", "First comment copied")

    @handle("no_button", "click")
    def no_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)

    @handle("yes_button", "click")
    def yes_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=(self.url_box.text or "").strip())
