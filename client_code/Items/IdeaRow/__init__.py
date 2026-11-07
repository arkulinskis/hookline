from anvil import *

from ._anvil_designer import IdeaRowTemplate
from ... import hl


class IdeaRow(IdeaRowTemplate):
    """An idea in the bank. item = {idea, pillar, host}: Draft it, mark used / not used, delete (the host page acts)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i, pl, d = self.item["idea"], self.item.get("pillar"), self.dom_nodes
        self.row.classes["used"] = bool(i.get("used"))
        kinds = hl.consts()["KINDS"]
        if i.get("kind") in kinds:
            d["kind"].textContent = kinds[i["kind"]]
        else:
            d["kind"].remove()
        if pl:
            d["chip"].style.setProperty("--pc", pl.get("color") or "")
            d["chip_name"].textContent = pl.get("name") or ""
        else:
            d["chip"].remove()
        if not i.get("example"):
            d["ex_badge"].remove()
        d["ago"].textContent = hl.ago(i.get("created"))
        d["text"].textContent = i.get("text") or ""
        self.used_button.text = "Mark as not used" if i.get("used") else "Mark as used"
        self.used_button.role = ["btn", "btn-ghost", "btn-icon", "btn-sm", "ic-refresh" if i.get("used") else "ic-check"]

    @handle("draft_button", "click")
    def draft_button_click(self, **event_args):
        self.item["host"].draft(self.item["idea"])

    @handle("used_button", "click")
    def used_button_click(self, **event_args):
        self.item["host"].toggle_used(self.item["idea"])

    @handle("del_button", "click")
    def del_button_click(self, **event_args):
        self.item["host"].delete(self.item["idea"])
