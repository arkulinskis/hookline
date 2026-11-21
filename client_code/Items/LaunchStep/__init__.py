from anvil import *

from ._anvil_designer import LaunchStepTemplate
from ... import state


class LaunchStep(LaunchStepTemplate):
    """One step of the first-hour checklist. item = {key, title, text, action ('' = none), done, host}: the tick box
    saves through host.tick(key, flag), the button runs host.act(key) (copy, open, comment helper, results)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        it = self.item
        self.dom_nodes["title"].textContent = it.get("title") or ""
        self.dom_nodes["text"].textContent = it.get("text") or ""
        self.done_box.checked = bool(it.get("done"))
        self.row.classes["done"] = bool(it.get("done"))
        state.set_control_attr(self.done_box, "aria-label", "Done: " + (it.get("title") or ""))
        self.act_button.visible = bool(it.get("action"))
        self.act_button.text = it.get("action") or ""
        icon = {"fc": "ic-copy", "open": "ic-external", "others": "ic-comment", "results": "ic-chart"}.get(it.get("key"))
        if icon:
            self.act_button.role = ["btn", "btn-sm", icon]

    @handle("done_box", "change")
    def done_box_change(self, **event_args):
        self.row.classes["done"] = bool(self.done_box.checked)
        self.item["host"].tick(self.item["key"], bool(self.done_box.checked))

    @handle("act_button", "click")
    def act_button_click(self, **event_args):
        self.item["host"].act(self.item["key"])
