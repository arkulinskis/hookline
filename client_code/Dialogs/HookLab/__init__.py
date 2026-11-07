import re

from anvil import *

from ._anvil_designer import HookLabTemplate
from ... import hl, state


class HookLab(HookLabTemplate):
    """The studio's hook lab: the current first line scored, 20 formulas (with your topic filled in) or six AI hooks
    (own key). Closes with the picked line (or None)."""

    def __init__(self, text="", **properties):
        super().__init__(**properties)
        self.text = text or ""
        cur = hl.hook(self.text)
        hs = hl.hook_score(cur)
        self.ring.set(hs["score"])
        self.dom_nodes["cur"].textContent = cur or "No first line yet"
        self.dom_nodes["why"].textContent = " ".join(hs["why"]) or "Clear and simple."
        self.topic_box.text = state.store_get("hookTopic", "") or ""
        state.set_control_attr(self.topic_box, "aria-label", "Your topic")
        for p in (self.formula_panel, self.ai_panel):
            p.add_event_handler("x-pick", self._pick)
        self.nudge.on_go = self._close
        self._tab("formulas")

    def _tab(self, name):
        self.t_formulas.classes["on"] = name == "formulas"
        self.t_ai.classes["on"] = name == "ai"
        self.formulas_part.visible = name == "formulas"
        self.ai_part.visible = name == "ai"
        if name == "formulas":
            self._fill()
        else:
            self._ai()

    def t_formulas_click(self, event):
        self._tab("formulas")

    def t_ai_click(self, event):
        self._tab("ai")

    def _fill(self):
        tp = (self.topic_box.text or "").strip()
        state.store_set("hookTopic", tp)
        items = []
        for kind, f in hl.consts()["FORMULAS"]:
            line = re.sub(r"\[(topic|thing)\]", tp, f, count=1) if tp else f
            s = hl.hook_score(re.sub(r"\[[^\]]+\]", "xxxx", line))
            items.append({"line": line, "score": s["score"], "meta": "%s · fill in the [brackets]" % kind})
        self.formula_panel.items = items

    @handle("topic_box", "change")
    def topic_box_change(self, **event_args):
        self._fill()

    def _ai(self):
        has = hl.ai_has()
        self.nudge.visible = not has
        self.ai_panel.items, self.ai_note.text, self.ai_msg.text = [], "", ""
        if not has:
            return
        if not self.text.strip():
            self.ai_msg.text = "Write a draft first: the AI writes hooks for what you've written."
            return
        self.ai_msg.text = "Writing hooks…"
        try:
            hooks = hl.ai_call("hooks", self.text)
        except Exception as e:
            self.ai_msg.text = hl.ai_error(e)
            return
        self.ai_msg.text = ""
        self.ai_panel.items = [{"line": h["text"], "score": hl.hook_score(h["text"])["score"],
                                "meta": "%s · %d characters" % (h.get("angle") or "", len(h["text"]))} for h in hooks]
        self.ai_note.text = "Written by %s with your key." % hl.ai_model_name()

    def _pick(self, line=None, **event_args):
        self.raise_event("x-close-alert", value=line)

    def _close(self):
        self.raise_event("x-close-alert", value=None)

    @handle("close_button", "click")
    def close_button_click(self, **event_args):
        self._close()
