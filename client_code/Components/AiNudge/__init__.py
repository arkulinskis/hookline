from anvil import *

from ._anvil_designer import AiNudgeTemplate


class AiNudge(AiNudgeTemplate):
    """The "add your own key" box (was HL.ai.nudge). Inside a dialog, set on_go so the Add key link closes it."""

    def __init__(self, **properties):
        self._what = "let AI help"
        self.on_go = None
        super().__init__(**properties)
        self.dom_nodes["go_link"].addEventListener("click", self._go)
        self._draw()

    def _draw(self):
        node = getattr(self, "dom_nodes", None)
        if node is not None and "what_text" in node:
            node["what_text"].textContent = self._what

    def _go(self, event):
        if self.on_go:
            self.on_go()

    @property
    def what(self):
        return self._what

    @what.setter
    def what(self, value):
        self._what = value or "let AI help"
        self._draw()
