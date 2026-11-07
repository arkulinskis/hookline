from anvil import *

from ._anvil_designer import CalPostTemplate
from ... import hl, router


class CalPost(CalPostTemplate):
    """A post on a calendar day (posted ✓ or scheduled with its time; scheduled ones can be dragged to another day).
    item = {post, color, host}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        p, a = self.item["post"], self.dom_nodes["link"]
        a.setAttribute("href", router.href("studio", p["id"]))
        a.classList.add("posted" if p["status"] == "posted" else "sched")
        a.style.setProperty("--pc", self.item.get("color") or "var(--c-brand)")
        a.setAttribute("title", hl.hook(p.get("text")))
        lead = "✓ " if p["status"] == "posted" else self.item.get("time", "") + " "
        self.dom_nodes["text"].textContent = lead + hl.hook(p.get("text"))
        if p["status"] == "scheduled":
            a.setAttribute("draggable", "true")
            a.addEventListener("dragstart", self._start)
            a.addEventListener("dragend", self._end)

    def _start(self, event):
        self.item["host"].drag_id = self.item["post"]["id"]
        try:
            event.dataTransfer.effectAllowed = "move"
            event.dataTransfer.setData("text/plain", self.item["post"]["id"])
        except Exception:
            pass

    def _end(self, event):
        self.item["host"].drag_id = None
