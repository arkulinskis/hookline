from anvil import *

from ... import state
from ._anvil_designer import PillarEditTemplate


class PillarEdit(PillarEditTemplate):
    """A content pillar row: colour, name, target %, remove. item = {i, pillar, host}; the host reads every row back
    with read() when saving."""

    def __init__(self, **properties):
        super().__init__(**properties)
        p = self.item["pillar"]
        self.dom_nodes["color"].value = p.get("color") or "#4a6fa5"
        self.name_box.text = p.get("name") or ""
        self.pct_box.text = str(p.get("target") or 0)
        state.set_control_attr(self.name_box, "aria-label", "Pillar name")
        state.set_control_attr(self.name_box, "maxlength", 30)
        state.set_control_attr(self.pct_box, "aria-label", "Target percent")
        self.item["form"] = self

    def read(self):
        return {"id": self.item["pillar"].get("id") or "", "name": self.name_box.text or "",
                "color": str(self.dom_nodes["color"].value), "target": int(self.pct_box.text or 0)}

    @handle("pct_box", "change")
    def pct_box_change(self, **event_args):
        self.item["host"].show_total()

    @handle("rm_button", "click")
    def rm_button_click(self, **event_args):
        self.item["host"].remove_pillar(self.item["i"])
