from anvil import *

from ._anvil_designer import SampleTemplate


class Sample(SampleTemplate):
    """A pasted past post (voice samples). item = {i, text, host}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.dom_nodes["text"].textContent = self.item["text"]

    @handle("rm_button", "click")
    def rm_button_click(self, **event_args):
        self.item["host"].remove_sample(self.item["i"])
