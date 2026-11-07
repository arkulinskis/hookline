from anvil import *

from ._anvil_designer import PickTimeTemplate
from ... import state


class PickTime(PickTimeTemplate):
    """Pick a date and time. Closes with 'YYYY-MM-DDTHH:MM' (browser time) or None."""

    def __init__(self, **properties):
        super().__init__(**properties)
        state.control(self.when_box).setAttribute("type", "datetime-local")
        state.set_control_attr(self.when_box, "aria-label", "Date and time")

    @handle("cancel_button", "click")
    def cancel_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)

    @handle("ok_button", "click")
    def ok_button_click(self, **event_args):
        v = str(state.control(self.when_box).value or "")
        if v:
            self.raise_event("x-close-alert", value=v)
