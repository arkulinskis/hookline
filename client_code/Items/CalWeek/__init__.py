from anvil import *
from anvil.js import window

from ._anvil_designer import CalWeekTemplate


class CalWeek(CalWeekTemplate):
    """One calendar row: the week's count against the target (dots), then seven days. item = {count, target, days}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        it = self.item
        self.dom_nodes["count"].textContent = str(it["count"])
        self.dom_nodes["wk"].setAttribute("title", "%d of %d this week" % (it["count"], it["target"]))
        dots = self.dom_nodes["dots"]
        for k in range(max(it["target"], it["count"])):
            i = window.document.createElement("i")
            if k < it["count"]:
                i.className = "on"
            dots.appendChild(i)
        self.days_panel.items = it["days"]
