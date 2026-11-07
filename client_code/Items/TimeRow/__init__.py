from anvil import *

from ._anvil_designer import TimeRowTemplate


class TimeRow(TimeRowTemplate):
    """A label and a muted value (best days/hours). item = {label, value}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.dom_nodes["label"].textContent = self.item.get("label") or ""
        self.dom_nodes["val"].textContent = self.item.get("value") or ""
