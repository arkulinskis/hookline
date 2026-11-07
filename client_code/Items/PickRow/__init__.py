from anvil import *

from ._anvil_designer import PickRowTemplate


class PickRow(PickRowTemplate):
    """A full-width choice button. item = {key, label}. Click -> the panel's x-pick event."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.dom_nodes["label"].textContent = self.item.get("label") or ""
        self.dom_nodes["btn"].addEventListener("click", self._click)

    def _click(self, event):
        if self.parent is not None:
            self.parent.raise_event("x-pick", key=self.item.get("key"))
