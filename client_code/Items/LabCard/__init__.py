from anvil import *

from ._anvil_designer import LabCardTemplate
from ... import hl, router, state


class LabCard(LabCardTemplate):
    """A Lab result. item = {kind: "hook", line, tag} | {kind: "angle", title, hook, outline} | {kind: "comment", title, text,
    sub}. Copy copies it; Start a post / Draft it opens the studio with it (state "seed")."""

    def __init__(self, **properties):
        super().__init__(**properties)
        it, d = self.item, self.dom_nodes
        kind = it.get("kind")
        if kind == "hook":
            line = it["line"]
            s, f = hl.hook_score(line), hl.fold_cut(line, "mobile")
            d["top"].remove()
            d["main"].textContent = line
            d["extra"].remove()
            d["score"].textContent = str(s["score"])
            d["tag"].textContent = it.get("tag") or ""
            d["len"].textContent = "%d characters" % len(line)
            fold = ("On a phone: %s…" % f["shown"]) if f["cut"] else 'Fits before "see more" on a phone.'
            d["fold"].textContent = fold + ((" · " + s["why"][0]) if s["why"] else "")
            self.copy_text, self.start_text = line, line
        elif kind == "angle":
            d["title"].textContent = it.get("title") or ""
            d["sub"].remove()
            d["main"].textContent = it.get("hook") or ""
            d["main"].classList.add("strong")
            d["extra"].textContent = it.get("outline") or ""
            for k in ("score", "tag", "len", "fold"):
                d[k].remove()
            self.copy_button.visible = False
            self.start_button.text = "Draft it"
            self.copy_text, self.start_text = "", (it.get("hook") or "") + "\n\n" + (it.get("outline") or "")
        else:
            d["title"].textContent = it.get("title") or ""
            d["sub"].textContent = it.get("sub") or ""
            d["main"].textContent = it.get("text") or ""
            d["extra"].remove()
            for k in ("score", "tag", "len", "fold"):
                d[k].remove()
            self.start_button.visible = False
            self.copy_text, self.start_text = it.get("text") or "", ""

    @handle("copy_button", "click")
    def copy_button_click(self, **event_args):
        hl.copy(self.copy_text)

    @handle("start_button", "click")
    def start_button_click(self, **event_args):
        state.store_set("seed", {"text": self.start_text + "\n\n"})
        router.go("studio", "new")
