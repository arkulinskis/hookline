from anvil import *

from ._anvil_designer import StructPickTemplate


class StructPick(StructPickTemplate):
    """A post shape to start from. item = {key, name, parts}. Click -> the panel's x-pick event."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.dom_nodes["name"].textContent = self.item["name"]
        self.dom_nodes["parts"].textContent = " → ".join(self.item["parts"])
        self.dom_nodes["btn"].addEventListener("click", self._click)

    def _click(self, event):
        if self.parent is not None:
            self.parent.raise_event("x-pick", key=self.item["key"])
