from anvil import *

from ._anvil_designer import TopRowTemplate
from ... import hl, router


class TopRow(TopRowTemplate):
    """A top post: its first line (opens it), when, views, engagement rate. item = a post."""

    def __init__(self, **properties):
        super().__init__(**properties)
        p, d = self.item, self.dom_nodes
        d["link"].setAttribute("href", router.href("studio", p["id"]))
        d["link"].textContent = hl.hook(p.get("text"))[:110]
        d["when"].textContent = hl.fmt_date(p.get("posted_at"))
        m = p.get("metrics") or {}
        d["views"].textContent = hl.fmt_num(m.get("impressions"))
        r = hl.rate(m)
        d["rate"].textContent = "%.1f%%" % r if r is not None else "–"
