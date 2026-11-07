from anvil import *

from ._anvil_designer import AiWriteTemplate
from ... import hl, state


class AiWrite(AiWriteTemplate):
    """The studio's AI panel (own key): an empty post gets "Draft from an idea" (idea + shape), a written one gets six
    rewrites. The answer streams in; "Use this" closes with the new text, "Keep mine" with None.
    The request goes from this browser straight to Anthropic (hl-ai.js); nothing passes through our server."""

    def __init__(self, text="", **properties):
        super().__init__(**properties)
        self.text = text or ""
        self.result = ""
        empty = not self.text.strip()
        self.title_label.text = "Draft a post" if empty else "Rewrite with AI"
        state.heading(self.title_label, 2)
        self.model_label.text = "%s · your key · it never invents facts: it leaves [brackets] for you." % hl.ai_model_name()
        self.draft_part.visible = empty
        self.a_draft.visible = empty
        self.acts = {"voice": self.a_voice, "shorter": self.a_shorter, "clearer": self.a_clearer, "story": self.a_story,
                     "hook": self.a_hook, "question": self.a_question}
        for b in self.acts.values():
            b.visible = not empty
        if empty:
            self.idea_box.text = state.store_get("lastIdea", "") or ""
            st = hl.consts()["STRUCTURES"]
            self.shape_dd.items = [("Let the AI choose", "")] + [(v["name"], k) for k, v in st.items()]
            state.set_control_attr(self.shape_dd, "aria-label", "Shape")
            state.set_control_attr(self.idea_box, "rows", 3)
        self.out_label.visible = False
        self.use_button.visible = False

    def _on_text(self, full, delta=None):
        self.out_label.text = str(full)

    def _busy(self, on):
        for b in [self.a_draft] + list(self.acts.values()):
            b.enabled = not on

    def _run(self, act):
        self.out_label.visible = True
        self.out_label.text = "…"
        self.use_button.visible = False
        self.result = ""
        if act == "draft":
            idea = (self.idea_box.text or "").strip()
            if not idea:
                self.out_label.text = "Write the idea first."
                return
            state.store_set("lastIdea", idea)
        self._busy(True)
        try:
            if act == "draft":
                txt = hl.ai_call("draft", idea, self.shape_dd.selected_value or "", on_text=self._on_text)
            else:
                txt = hl.ai_call("rewrite", self.text, act, on_text=self._on_text)
            self.result = hl.plain(str(txt).strip())
            self.out_label.text = self.result
            self.use_button.visible = True
        except Exception as e:
            self.out_label.text = hl.ai_error(e)
        finally:
            self._busy(False)

    @handle("a_draft", "click")
    def a_draft_click(self, **event_args):
        self._run("draft")

    @handle("a_voice", "click")
    def a_voice_click(self, **event_args):
        self._run("voice")

    @handle("a_shorter", "click")
    def a_shorter_click(self, **event_args):
        self._run("shorter")

    @handle("a_clearer", "click")
    def a_clearer_click(self, **event_args):
        self._run("clearer")

    @handle("a_story", "click")
    def a_story_click(self, **event_args):
        self._run("story")

    @handle("a_hook", "click")
    def a_hook_click(self, **event_args):
        self._run("hook")

    @handle("a_question", "click")
    def a_question_click(self, **event_args):
        self._run("question")

    @handle("keep_button", "click")
    def keep_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)

    @handle("use_button", "click")
    def use_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=self.result)
