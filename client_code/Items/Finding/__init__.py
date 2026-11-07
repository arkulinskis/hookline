from anvil import *

from ._anvil_designer import FindingTemplate


class Finding(FindingTemplate):
    """A pattern found in your results. item = {pre, b, post} (b is the bold part)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        for k in ("pre", "b", "post"):
            self.dom_nodes[k].textContent = self.item.get(k) or ""
