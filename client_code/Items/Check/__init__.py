from anvil import *

from ._anvil_designer import CheckTemplate


class Check(CheckTemplate):
    """One post-check finding. item = {level: bad|warn|tip|good, title, text, fix: 'plain' | 'link' | None}.
    Fix -> the panel's x-fix event (the Studio page changes the text)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        it = self.item
        self.row.classes[it.get("level") or "tip"] = True
        self.dom_nodes["title"].textContent = it.get("title") or ""
        self.dom_nodes["text"].textContent = it.get("text") or ""
        fix = it.get("fix")
        self.fix_button.visible = fix in ("plain", "link")
        self.fix_button.text = "Fix" if fix == "plain" else "Move"
        if fix == "plain":
            self.fix_button.role = ["btn", "btn-sm", "ic-broom"]

    @handle("fix_button", "click")
    def fix_button_click(self, **event_args):
        if self.parent is not None:
            self.parent.raise_event("x-fix", fix=self.item.get("fix"))
