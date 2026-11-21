from anvil import *

from ._anvil_designer import StarterTemplate
from ... import hl, state


class Starter(StarterTemplate):
    """A reply starter on the first-hour page. item = {text, n}. Copy puts it on the clipboard (you fill the brackets)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.dom_nodes["text"].textContent = self.item.get("text") or ""
        state.set_control_attr(self.copy_button, "aria-label", "Copy reply starter %s" % self.item.get("n", ""))

    @handle("copy_button", "click")
    def copy_button_click(self, **event_args):
        hl.copy(self.item.get("text") or "", "Copied. Fill in the brackets before you post it.")
