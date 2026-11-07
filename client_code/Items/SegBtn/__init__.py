from anvil import *

from ._anvil_designer import SegBtnTemplate


class SegBtn(SegBtnTemplate):
    """One choice in a .ui-seg group (filters, kinds). item = {key, label, on, dot (a colour, optional)}.
    Click -> the panel's x-seg event with the key. Put the panel inside <div class="ui-seg"> with role "contents"."""

    def __init__(self, **properties):
        super().__init__(**properties)
        it = self.item
        self.dom_nodes["label"].textContent = it.get("label") or ""
        if it.get("on"):
            self.dom_nodes["btn"].classList.add("on")
        self.dom_nodes["btn"].setAttribute("data-key", str(it.get("key")))
        if it.get("dot"):
            self.dom_nodes["dot"].style.background = it["dot"]
        else:
            self.dom_nodes["dot"].remove()

    def btn_click(self, event):
        if self.parent is not None:
            self.parent.raise_event("x-seg", key=self.item.get("key"))
