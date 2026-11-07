from anvil import *

from ._anvil_designer import ScoreRingTemplate


class ScoreRing(ScoreRingTemplate):
    """The post score ring (was HL.scoreRing in the JavaScript version)."""

    def __init__(self, **properties):
        super().__init__(**properties)

    def set(self, value):
        v = int(value or 0)
        col = "var(--c-good)" if v >= 80 else "var(--c-gold)" if v >= 55 else "var(--c-bad)"
        ring = self.dom_nodes["ring"]
        ring.style.setProperty("--v", str(v))
        ring.style.setProperty("--sc", col)
        ring.setAttribute("aria-label", "Post score %d of 100" % v)
        self.dom_nodes["num"].textContent = str(v)
