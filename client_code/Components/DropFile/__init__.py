from anvil import *
from anvil.js import window

from ._anvil_designer import DropFileTemplate


class DropFile(DropFileTemplate):
    """Drop or pick LinkedIn's analytics export. The browser File goes to on_file (read by hl-media.js, in the browser)."""

    def __init__(self, **properties):
        self.on_file = None
        super().__init__(**properties)
        d = self.dom_nodes
        d["file"].addEventListener("change", self._picked)
        d["drop"].addEventListener("dragover", self._over)
        d["drop"].addEventListener("dragleave", self._leave)
        d["drop"].addEventListener("drop", self._drop)

    def open(self):
        self.dom_nodes["file"].click()

    def _give(self, f):
        if f and self.on_file:
            self.on_file(f)

    def _picked(self, event):
        inp = self.dom_nodes["file"]
        self._give(window.HLI.first(inp))
        inp.value = ""

    def _over(self, event):
        event.preventDefault()
        self.dom_nodes["drop"].classList.add("over")

    def _leave(self, event):
        self.dom_nodes["drop"].classList.remove("over")

    def _drop(self, event):
        event.preventDefault()
        self.dom_nodes["drop"].classList.remove("over")
        self._give(window.HLI.first(event))
