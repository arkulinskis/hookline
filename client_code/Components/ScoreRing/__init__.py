from anvil import *

from ._anvil_designer import ScoreRingTemplate


class ScoreRing(ScoreRingTemplate):
    """The post score ring (was HL.scoreRing in the JavaScript version)."""

    def __init__(self, **properties):
        super().__init__(**properties)

    def set(self, value, label="Post score"):
        v = int(value or 0)
        col = "var(--c-good)" if v >= 80 else "var(--c-gold)" if v >= 55 else "var(--c-bad)"
        ring = self.dom_nodes["ring"]
        ring.style.setProperty("--v", str(v))
        ring.style.setProperty("--sc", col)
        ring.setAttribute("aria-label", "%s %d of 100" % (label, v))
        self.dom_nodes["num"].textContent = str(v)
