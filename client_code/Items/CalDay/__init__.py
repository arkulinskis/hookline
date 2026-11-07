from anvil import *

from ._anvil_designer import CalDayTemplate


class CalDay(CalDayTemplate):
    """A day cell: the date, + (new post or schedule a draft that day), its posts; a drop target for dragging.
    item = {key, n, other, today, label, posts, host} (host = the Calendar page)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        it, d = self.item, self.dom_nodes
        day = d["day"]
        if it.get("other"):
            day.classList.add("other")
        if it.get("today"):
            day.classList.add("today")
        d["num"].textContent = str(it["n"])
        d["add"].setAttribute("aria-label", "New post on " + it["label"])
        d["add"].addEventListener("click", self._add)
        day.addEventListener("dragover", self._over)
        day.addEventListener("dragleave", self._leave)
        day.addEventListener("drop", self._drop)
        self.posts_panel.items = it["posts"]

    def _add(self, event):
        self.item["host"].new_on(self.item["key"])

    def _over(self, event):
        if self.item["host"].drag_id:
            event.preventDefault()
            self.dom_nodes["day"].classList.add("over")

    def _leave(self, event):
        self.dom_nodes["day"].classList.remove("over")

    def _drop(self, event):
        event.preventDefault()
        self.dom_nodes["day"].classList.remove("over")
        self.item["host"].dropped(self.item["key"])
