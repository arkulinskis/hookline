from anvil import *
from anvil.js import window

from ._anvil_designer import DraftIdeaTemplate
from ... import hl, state


class DraftIdea(DraftIdeaTemplate):
    """Draft an idea with AI (own key), streaming in. Closes with {use: "ai", text} or {use: "skel"} or None."""

    def __init__(self, idea=None, shape="story", **properties):
        super().__init__(**properties)
        self.idea, self.shape, self.text = idea or {}, shape, ""
        state.heading(self.title_label, 2)
        self.idea_label.text = self.idea.get("text") or ""
        self.done_row.visible = False
        self.use_button.visible = False
        window.setTimeout(self._start, 50)

    def _on_text(self, full, delta=None):
        self.out_label.text = str(full)

    def _start(self):
        try:
            t = hl.ai_call("draft", self.idea.get("text") or "", self.shape, on_text=self._on_text)
            self.text = hl.plain(str(t).strip())
            self.out_label.text = self.text
            self.title_label.text = "Your draft"
            self.use_button.visible = True
        except Exception as e:
            self.out_label.text = hl.ai_error(e)
            self.title_label.text = "That didn't work"
        self.done_row.visible = True

    @handle("skel_button", "click")
    def skel_button_click(self, **event_args):
        self.raise_event("x-close-alert", value={"use": "skel"})

    @handle("use_button", "click")
    def use_button_click(self, **event_args):
        self.raise_event("x-close-alert", value={"use": "ai", "text": self.text})
