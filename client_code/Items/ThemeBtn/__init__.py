from anvil import *

from ._anvil_designer import ThemeBtnTemplate


class ThemeBtn(ThemeBtnTemplate):
    """A carousel theme choice. item = {key, name, bg, accent, on}. Click -> the panel's x-seg event."""

    def __init__(self, **properties):
        super().__init__(**properties)
        it, d = self.item, self.dom_nodes
        d["name"].textContent = it["name"]
        d["swatch"].style.background = it["bg"]
        d["swatch"].style.boxShadow = "inset 0 0 0 4px " + it["accent"]
        d["btn"].setAttribute("data-key", it["key"])
        if it.get("on"):
            d["btn"].classList.add("on")
        d["btn"].setAttribute("aria-pressed", "true" if it.get("on") else "false")
        d["btn"].addEventListener("click", self._click)

    def _click(self, event):
        if self.parent is not None:
            self.parent.raise_event("x-seg", key=self.item["key"])
