from anvil import *

from ._anvil_designer import AiNudgeTemplate
from ... import state


class AiNudge(AiNudgeTemplate):
    """The "add your own key" box as a dialog, for buttons that need AI when no key is saved yet."""

    def __init__(self, title="AI with your own key", what="let AI help", note="", **properties):
        super().__init__(**properties)
        self.title_label.text = title
        state.heading(self.title_label, 2)
        self.nudge.what = what
        self.nudge.on_go = self._close
        self.note_label.text = note
        self.note_label.visible = bool(note)

    def _close(self):
        self.raise_event("x-close-alert", value=None)

    @handle("close_button", "click")
    def close_button_click(self, **event_args):
        self._close()
