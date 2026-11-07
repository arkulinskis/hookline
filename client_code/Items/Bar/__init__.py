from anvil import *

from ._anvil_designer import BarTemplate
from ... import hl


class Bar(BarTemplate):
    """A horizontal bar: average views per post for a format / pillar / weekday (or % of viewers).
    item = {label, value, n, pct (0-100 of the longest), top, unit, small}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        it, d = self.item, self.dom_nodes
        if it.get("top"):
            d["row"].classList.add("top")
        d["row"].setAttribute("title", "%s: %s %s" % (it["label"], hl.fmt_num(it["value"]), it.get("unit") or ""))
        d["label"].textContent = it["label"]
        d["fill"].style.width = "%.1f%%" % it["pct"]
        d["val"].textContent = hl.fmt_num(it["value"])
        d["n"].textContent = it.get("small") or ""
