from anvil import *

from ._anvil_designer import LpCheckTemplate


class LpCheck(LpCheckTemplate):
    """A line in the landing page's live post check. item = {level, title}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        lv = self.item.get("level")
        self.row.classes["bad" if lv == "bad" else "warn" if lv in ("warn", "tip") else "good"] = True
        self.dom_nodes["title"].textContent = self.item.get("title") or ""
