from anvil import *
from anvil.js import window

from ._anvil_designer import DayPickTemplate
from ... import hl, state


class DayPick(DayPickTemplate):
    """A calendar day's +: write a new post, or schedule one of the drafts that day. Closes with a draft id or None."""

    def __init__(self, day_key="", drafts=(), **properties):
        super().__init__(**properties)
        self.title_label.text = str(window.Date(day_key + "T12:00").toDateString())
        state.heading(self.title_label, 2)
        drafts = list(drafts)
        self.drafts_hint.visible = bool(drafts)
        self.drafts_panel.items = [{"key": p["id"], "label": hl.hook(p.get("text"))[:60] or "(empty)"} for p in drafts]
        self.drafts_panel.add_event_handler("x-pick", self._pick)

    def _pick(self, key=None, **event_args):
        self.raise_event("x-close-alert", value=key)

    def box_click(self, event):
        if event.target.closest("a"):
            self.raise_event("x-close-alert", value=None)

    @handle("close_button", "click")
    def close_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)
