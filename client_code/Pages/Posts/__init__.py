from anvil import *

from ._anvil_designer import PostsTemplate
from ... import hl, router, state


class Posts(PostsTemplate):
    """#posts (Operate): drafts, scheduled and posted in three columns, with search and a pillar filter."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.pillar, self.q = "", ""
        self.ws: dict = hl.load() or {"profile": {}, "posts": [], "ideas": []}
        state.set_control_attr(self.search_box, "aria-label", "Search posts")
        self.pillar_panel.add_event_handler("x-seg", self._pick)
        self.draw()

    def draw(self):
        ws = self.ws
        pillars = (ws.get("profile") or {}).get("pillars") or []
        self.pillar_panel.items = [{"key": "", "label": "All", "on": not self.pillar}] + [
            {"key": x["id"], "label": x["name"], "on": self.pillar == x["id"], "dot": x.get("color")} for x in pillars]
        open_ideas = len([i for i in ws.get("ideas") or [] if not i.get("used")])
        self.dom_nodes["summary"].textContent = "%s · %s" % (state.plural(len(ws["posts"]), "post"), state.plural(open_ideas, "idea"))
        due = hl.due(ws)
        self.due_bar.visible = bool(due)
        if due:
            self.due_text.text = "Due now: “%s”" % hl.hook(due[0]["text"])[:80]
            state.set_attr(self.due_link, "href", router.href("studio", due[0]["id"]))
        q = self.q.lower()
        lst = [p for p in ws["posts"] if (not self.pillar or p.get("pillar") == self.pillar)
               and (not q or q in (p.get("text") or "").lower())]
        drafts = [p for p in lst if p["status"] == "draft"]
        sched = sorted([p for p in lst if p["status"] == "scheduled"], key=lambda p: hl.time_ms(p.get("scheduled_at")))
        posted = sorted([p for p in lst if p["status"] == "posted"], key=lambda p: -hl.time_ms(p.get("posted_at")))
        cols = [(drafts[:100], self.draft_panel, self.e_draft, "n_draft"), (sched[:100], self.sched_panel, self.e_sched, "n_sched"),
                (posted[:40], self.posted_panel, self.e_posted, "n_posted")]
        for items, panel, empty, count in cols:
            panel.items = [{"post": p, "pillar": hl.pillar(ws, p.get("pillar"))} for p in items]
            empty.visible = not items
        self.dom_nodes["n_draft"].textContent = str(len(drafts))
        self.dom_nodes["n_sched"].textContent = str(len(sched))
        self.dom_nodes["n_posted"].textContent = str(len(posted))
        cad = (ws.get("profile") or {}).get("cadence") or 3
        self.dom_nodes["e_sched_text"].textContent = "Nothing scheduled. A rhythm of %s a week is your target." % cad

    def _pick(self, key=None, **event_args):
        self.pillar = key or ""
        k = state.focus_key()
        self.draw()
        state.refocus(self.pillar_panel, k)

    @handle("search_box", "change")
    def search_box_change(self, **event_args):
        self.q = self.search_box.text or ""
        self.draw()
