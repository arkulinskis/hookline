import re

from anvil import *

from ._anvil_designer import LabTemplate
from ... import hl, state

TABS = ["hooks", "repurpose", "comments", "clean"]


def key_sentences(src):
    """The strongest sentences in a text (numbers, tension, lessons): each could open a post. No AI needed."""
    scored = []
    for s in hl.sentences(src):
        sc = 0
        if re.search(r"\d", s):
            sc += 3
        if re.search(r"\b(I|we|my)\b", s):
            sc += 1
        if re.search(r"(?i)\b(but|instead|never|always|mistake|wrong|learned|surpris)", s):
            sc += 3
        if 40 < len(s) < 180:
            sc += 2
        if s.endswith("?"):
            sc += 1
        scored.append((s, sc))
    scored.sort(key=lambda x: -x[1])
    return [x[0] for x in scored[:6]]


class Lab(LabTemplate):
    """#lab/{hooks,repurpose,comments,clean} (Operate): writing tools. Hooks: 20 formulas with your topic, scored, or
    AI hooks; Repurpose: post angles from a long piece (AI) or its strongest sentences (no AI); Comments: frames or
    three AI drafts (you post them yourself); Clean-up: fancy Unicode letters back to plain text."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.tab = args[0] if args and args[0] in TABS else "hooks"
        has = hl.ai_has()
        self.ai_badge.text = ("✦ AI on · " + hl.ai_model_name()) if has else "✦ AI off · built-in coach"
        self.ai_badge.role = ["badge", "badge-gold"] if has else ["badge"]
        parts = {"hooks": self.hooks_part, "repurpose": self.repurpose_part, "comments": self.comments_part, "clean": self.clean_part}
        tabs = {"hooks": self.tab_hooks, "repurpose": self.tab_repurpose, "comments": self.tab_comments, "clean": self.tab_clean}
        for name in TABS:
            parts[name].visible = name == self.tab
            tabs[name].classes["on"] = name == self.tab
        for n in (self.hooks_nudge, self.rep_nudge, self.com_nudge):
            n.visible = False
        self.com_note.visible = False
        self.topic_box.text = state.store_get("hookTopic", "") or ""
        self.src_box.text = state.store_get("repSrc", "") or ""
        state.set_control_attr(self.src_box, "rows", 14)
        state.set_control_attr(self.post_box, "rows", 10)
        state.set_control_attr(self.dirty_box, "rows", 12)
        state.set_control_attr(self.clean_box, "rows", 12)
        state.set_control_attr(self.clean_box, "readonly", "")
        self.ws = hl.load() or {"profile": {}, "posts": []}
        self._fill()
        self.com_panel.items = [{"kind": "comment", "title": f[0], "text": f[1]} for f in hl.consts()["COMMENT_FRAMES"]]

    # ---- hooks
    def _fill(self):
        t, own = (self.topic_box.text or "").strip(), (self.own_box.text or "").strip()
        state.store_set("hookTopic", t)
        rows = []
        for kind, f in hl.consts()["FORMULAS"]:
            line = re.sub(r"\[(topic|thing)\]", t, f, count=1) if t else f
            rows.append((line, kind, hl.hook_score(re.sub(r"\[[^\]]+\]", "xxxx", line))["score"]))
        rows.sort(key=lambda r: -r[2])
        items = ([{"kind": "hook", "line": own, "tag": "yours"}] if own else []) + \
                [{"kind": "hook", "line": r[0], "tag": r[1] + " formula"} for r in rows[:12]]
        self.hooks_panel.items = items

    @handle("topic_box", "change")
    def topic_box_change(self, **event_args):
        self._fill()

    @handle("own_box", "change")
    def own_box_change(self, **event_args):
        self._fill()

    @handle("hooks_button", "click")
    def hooks_button_click(self, **event_args):
        self._fill()

    @handle("aihooks_button", "click")
    def aihooks_button_click(self, **event_args):
        if not hl.ai_has():
            self.hooks_nudge.visible = True
            return
        t = (self.topic_box.text or "").strip()
        if not t:
            state.toast("Say what the post is about first.", "error")
            return
        self.aihooks_button.enabled = False
        try:
            hs = hl.ai_call("hooks", "A post about: " + t)
            self.aihooks_panel.items = [{"kind": "hook", "line": h["text"], "tag": h.get("angle") or ""} for h in hs] + list(self.aihooks_panel.items or [])
        except Exception as e:
            state.toast(hl.ai_error(e), "error")
        finally:
            self.aihooks_button.enabled = True

    # ---- repurpose
    @handle("rep_button", "click")
    def rep_button_click(self, **event_args):
        src = (self.src_box.text or "").strip()
        state.store_set("repSrc", src[:20000])
        if len(src) < 200:
            state.toast("Paste a longer piece (at least a few paragraphs).", "error")
            return
        if not hl.ai_has():
            self.rep_nudge.visible = True
            self.rep_msg.text = "Meanwhile, the strongest sentences in it (numbers, tension, lessons): each could open a post."
            self.rep_panel.items = [{"kind": "hook", "line": s, "tag": "from your text"} for s in key_sentences(src)]
            return
        self.rep_msg.text = "Reading it…"
        self.rep_panel.items = []
        self.rep_button.enabled = False
        try:
            angles = hl.ai_call("repurpose", src)
            self.rep_msg.text = ""
            self.rep_panel.items = [{"kind": "angle", "title": a.get("title"), "hook": a.get("hook"), "outline": a.get("outline")} for a in angles]
        except Exception as e:
            self.rep_msg.text = hl.ai_error(e)
        finally:
            self.rep_button.enabled = True

    # ---- comments
    @handle("com_button", "click")
    def com_button_click(self, **event_args):
        post = (self.post_box.text or "").strip()
        if len(post) < 40:
            state.toast("Paste their post first.", "error")
            return
        if not hl.ai_has():
            self.com_nudge.visible = True
            return
        self.com_msg.text = "Drafting…"
        self.com_button.enabled = False
        try:
            cs = hl.ai_call("comments", post)
            self.com_msg.text = ""
            self.com_panel.items = [{"kind": "comment", "title": c.get("kind"), "sub": "%d characters" % len(c.get("text") or ""),
                                     "text": c.get("text")} for c in cs]
            self.com_note.visible = True
        except Exception as e:
            self.com_msg.text = hl.ai_error(e)
        finally:
            self.com_button.enabled = True

    # ---- clean-up
    @handle("dirty_box", "change")
    def dirty_box_change(self, **event_args):
        t = self.dirty_box.text or ""
        self.clean_box.text = hl.plain(t)
        n = hl.fancy_count(t)
        self.clean_count.text = ("%d fancy letters fixed" % n) if n else ""

    @handle("copyclean_button", "click")
    def copyclean_button_click(self, **event_args):
        hl.copy(self.clean_box.text or "", "Clean text copied")
