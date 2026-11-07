from anvil import *

from ._anvil_designer import MoreTemplate
from ... import state


class More(MoreTemplate):
    """The phone tab bar's More: the pages that don't fit in four tabs. A link closes the dialog."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.admin_link.visible = state.is_admin()

    def box_click(self, event):
        if event.target.closest("a"):
            self.raise_event("x-close-alert", value=None)
