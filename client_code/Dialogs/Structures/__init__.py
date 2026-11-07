from anvil import *

from ._anvil_designer import StructuresTemplate
from ... import hl


class Structures(StructuresTemplate):
    """Pick a post shape (story, list, opinion ...). Closes with its key (or None)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        st = hl.consts()["STRUCTURES"]
        self.panel.items = [{"key": k, "name": v["name"], "parts": v["parts"]} for k, v in st.items()]
        self.panel.add_event_handler("x-pick", self._pick)

    def _pick(self, key=None, **event_args):
        self.raise_event("x-close-alert", value=key)

    @handle("close_button", "click")
    def close_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)
