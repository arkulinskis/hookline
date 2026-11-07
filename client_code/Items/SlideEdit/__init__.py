from anvil import *
import anvil.js

from ._anvil_designer import SlideEditTemplate
from ... import state


class SlideEdit(SlideEditTemplate):
    """A slide's title and body, with move up/down and delete. item = {i, n, slide, on, host}: typing updates the
    preview through the host (the Carousel page) without redrawing the list, so the cursor stays put."""

    def __init__(self, **properties):
        super().__init__(**properties)
        it = self.item
        i, n = it["i"], it["n"]
        self.box.classes["on"] = bool(it.get("on"))
        self.dom_nodes["label"].textContent = "Cover" if i == 0 else "Slide %d" % (i + 1)
        self.title_box.text = it["slide"].get("title") or ""
        self.body_box.text = it["slide"].get("body") or ""
        state.set_control_attr(self.title_box, "aria-label", "Slide title")
        state.set_control_attr(self.title_box, "maxlength", 140)
        state.set_control_attr(self.body_box, "aria-label", "Slide text")
        state.set_control_attr(self.body_box, "maxlength", 600)
        self.up_button.enabled = i > 0
        self.down_button.enabled = i < n - 1
        anvil.js.get_dom_node(self).addEventListener("focusin", self._focus)
        it["form"] = self

    def set_on(self, on):
        self.box.classes["on"] = on

    def _focus(self, event):
        self.item["host"].select(self.item["i"])

    def _edit(self):
        self.item["host"].edit(self.item["i"], self.title_box.text or "", self.body_box.text or "")

    @handle("title_box", "change")
    def title_box_change(self, **event_args):
        self._edit()

    @handle("body_box", "change")
    def body_box_change(self, **event_args):
        self._edit()

    @handle("up_button", "click")
    def up_button_click(self, **event_args):
        self.item["host"].move(self.item["i"], -1)

    @handle("down_button", "click")
    def down_button_click(self, **event_args):
        self.item["host"].move(self.item["i"], 1)

    @handle("rm_button", "click")
    def rm_button_click(self, **event_args):
        self.item["host"].remove(self.item["i"])
