from anvil import *

from ._anvil_designer import CalDraftTemplate
from ... import hl


class CalDraft(CalDraftTemplate):
    """A draft waiting to be placed: drag it onto a day, or press the clock. item = {post, host}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        p = self.item["post"]
        self.dom_nodes["text"].textContent = hl.hook(p.get("text"))[:80] or "(empty)"
        self.dom_nodes["row"].addEventListener("dragstart", self._start)
        self.dom_nodes["row"].addEventListener("dragend", self._end)

    def _start(self, event):
        self.item["host"].drag_id = self.item["post"]["id"]
        try:
            event.dataTransfer.effectAllowed = "move"
            event.dataTransfer.setData("text/plain", self.item["post"]["id"])
        except Exception:
            pass

    def _end(self, event):
        self.item["host"].drag_id = None

    @handle("pick_button", "click")
    def pick_button_click(self, **event_args):
        self.item["host"].pick_time(self.item["post"]["id"])
