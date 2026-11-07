from anvil import *

from ._anvil_designer import HookPickTemplate


class HookPick(HookPickTemplate):
    """A hook to pick (hook lab). item = {line, score, meta}. Click -> the panel's x-pick event."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.dom_nodes["line"].textContent = self.item["line"]
        self.dom_nodes["score"].textContent = str(self.item.get("score", ""))
        self.dom_nodes["meta"].textContent = self.item.get("meta") or ""
        self.dom_nodes["btn"].addEventListener("click", self._click)

    def _click(self, event):
        if self.parent is not None:
            self.parent.raise_event("x-pick", line=self.item["line"])
