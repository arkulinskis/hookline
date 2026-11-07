from anvil import *

from ._anvil_designer import IdeasTemplate
from ... import hl, router, state

DRAFT_SHAPE = {"story": "story", "lesson": "story", "opinion": "opinion", "howto": "howto", "behind": "behind", "numbers": "case"}
FILTERS = [("open", "To write"), ("used", "Used"), ("all", "All")]


class Ideas(IdeasTemplate):
    """#ideas (Operate): the idea bank (add, filter, Draft it, used, delete), AI suggestions (own key) and the guided
    question card (six kinds of question; an answer is saved as an idea)."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.kind, self.pi, self.filter = "story", 0, "open"
        state.set_control_attr(self.idea_box, "aria-label", "New idea")
        state.set_control_attr(self.idea_box, "maxlength", 600)
        state.set_control_attr(self.answer_box, "aria-label", "Your answer")
        state.set_control_attr(self.answer_box, "rows", 3)
        self.filter_panel.add_event_handler("x-seg", self._filter)
        self.kinds_panel.add_event_handler("x-seg", self._kind)
        self.reload()

    def reload(self):
        self.ws: dict = hl.load() or {"profile": {}, "posts": [], "ideas": []}
        self.draw()

    def prompts(self):
        return hl.consts()["PROMPTS"][self.kind]

    def draw(self):
        ws = self.ws
        pillars = (ws.get("profile") or {}).get("pillars") or []
        self.pillar_dd.items = [("Any pillar", "")] + [(p["name"], p["id"]) for p in pillars]
        state.set_control_attr(self.pillar_dd, "aria-label", "Pillar")
        lst = [i for i in ws.get("ideas") or [] if self.filter == "all" or (not i.get("used") if self.filter == "open" else i.get("used"))]
        self.filter_panel.items = [{"key": k, "label": label, "on": k == self.filter} for k, label in FILTERS]
        self.ideas_panel.items = [{"idea": i, "pillar": hl.pillar(ws, i.get("pillar")), "host": self} for i in lst]
        self.empty.visible = not lst
        self.dom_nodes["empty_title"].textContent = "No used ideas yet" if self.filter == "used" else "No ideas waiting"
        pr = self.prompts()
        self.question_label.text = pr[self.pi % len(pr)]
        kinds = hl.consts()["KINDS"]
        self.kinds_panel.items = [{"key": k, "label": v, "on": k == self.kind} for k, v in kinds.items()]

    def _filter(self, key=None, **event_args):
        self.filter = key
        k = state.focus_key()
        self.draw()
        state.refocus(self.filter_panel, k)

    def _kind(self, key=None, **event_args):
        self.kind, self.pi = key, 0
        k = state.focus_key()
        self.draw()
        state.refocus(self.kinds_panel, k)

    @handle("skip_button", "click")
    def skip_button_click(self, **event_args):
        self.pi += 1
        self.draw()

    @handle("add_button", "click")
    def add_button_click(self, **event_args):
        t = (self.idea_box.text or "").strip()
        if not t:
            return
        if state.call("save_idea", t, "", self.pillar_dd.selected_value or ""):
            self.idea_box.text = ""
            state.toast("Saved", "ok")
            self.reload()

    @handle("idea_box", "pressed_enter")
    def idea_box_pressed_enter(self, **event_args):
        self.add_button_click()

    @handle("save_answer_button", "click")
    def save_answer_button_click(self, **event_args):
        a = (self.answer_box.text or "").strip()
        if not a:
            state.toast("Write a few words first.", "error")
            return
        pr = self.prompts()
        q = pr[self.pi % len(pr)]
        if state.call("save_idea", q + ": " + a, self.kind, ""):
            self.pi += 1
            self.answer_box.text = ""
            state.toast("Saved as an idea", "ok")
            self.reload()

    @handle("ai_button", "click")
    def ai_button_click(self, **event_args):
        if not hl.ai_has():
            from ...Dialogs.AiNudge import AiNudge
            alert(AiNudge(title="Idea suggestions", what="get 10 ideas from your pillars and best posts",
                          note="No key? The question card on the right works without one."), buttons=[], role="app-dialog")
            return
        self.ai_button.enabled = False
        try:
            ideas = hl.ai_call("ideas")
        except Exception as e:
            state.toast(hl.ai_error(e), "error")
            return
        finally:
            self.ai_button.enabled = True
        kinds = hl.consts()["KINDS"]
        r = state.call("save_ideas", [{"text": x.get("text"), "kind": x.get("kind") if x.get("kind") in kinds else "",
                                       "pillar": x.get("pillar")} for x in ideas])
        if r:
            state.toast(state.plural(len(r["ideas"]), "idea") + " added", "ok")
            self.reload()

    # ---- row actions (Items/IdeaRow)
    def draft(self, idea):
        shape = DRAFT_SHAPE.get(idea.get("kind")) or "story"
        skeleton = "[" + idea["text"] + "]\n\n" + hl.structure_text(shape)
        if hl.ai_has():
            from ...Dialogs.DraftIdea import DraftIdea
            r = alert(DraftIdea(idea=idea, shape=shape), buttons=[], role=["app-dialog", "wide"], large=True)
            if not r:
                return
            text = r["text"] if r["use"] == "ai" else skeleton
        else:
            text = skeleton
        state.store_set("seed", {"text": text, "pillar": idea.get("pillar"), "idea": idea["id"]})
        router.go("studio", "new")

    def toggle_used(self, idea):
        if state.call("set_idea_used", idea["id"], not idea.get("used")) is not None:
            self.reload()

    def delete(self, idea):
        if state.call("delete_idea", idea["id"]) is not None:
            state.toast("Deleted")
            self.reload()
