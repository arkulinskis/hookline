from anvil import *

from ._anvil_designer import MixRowTemplate


class MixRow(MixRowTemplate):
    """A pillar's share this month against its goal. item = {name, color, text}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.dom_nodes["dot"].style.background = self.item.get("color") or ""
        self.dom_nodes["name"].textContent = self.item.get("name") or ""
        self.dom_nodes["val"].textContent = self.item.get("text") or ""
