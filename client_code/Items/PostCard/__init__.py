from anvil import *

from ._anvil_designer import PostCardTemplate
from ... import hl, router, state


class PostCard(PostCardTemplate):
    """A post in the Posts columns: pillar, format, when, the first line, results (posted) or length + score.
    item = {post, pillar} (pillar = the post's pillar dict or None)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        p, pl, d = self.item["post"], self.item.get("pillar"), self.dom_nodes
        state.set_attr(self.card, "href", router.href("studio", p["id"]))
        self.card.classes["example"] = bool(p.get("example"))
        if pl:
            d["chip"].style.setProperty("--pc", pl.get("color") or "")
            d["chip_name"].textContent = pl.get("name") or ""
        else:
            d["chip"].remove()
        fmt = hl.formats().get(p.get("format")) or ["Text", "feather"]
        d["fmt_icon"].classList.add("ic-" + fmt[1])
        d["fmt_icon"].setAttribute("title", fmt[0])
        if not p.get("example"):
            d["ex_badge"].remove()
        w = hl.when(p)
        d["when"].textContent = ((hl.fmt_date(w) if p["status"] == "posted" else hl.fmt_datetime(w)) if w
                                 else "edited " + hl.ago(p.get("updated")))
        d["hook"].textContent = hl.hook(p.get("text")) or "(empty)"
        m = p.get("metrics") or {}
        posted = p["status"] == "posted"
        if posted and m.get("impressions"):
            d["n_views"].textContent = hl.fmt_num(m["impressions"])
            d["n_eng"].textContent = hl.fmt_num(hl.engagements(m))
            r = hl.rate(m)
            if r is None:
                d["rate_box"].remove()
            else:
                d["n_rate"].textContent = "%.1f%%" % r
            d["no_nums"].remove()
        else:
            d["nums"].remove()
            if not posted:
                d["no_nums"].remove()
        if posted:
            d["draft_meta"].remove()
        else:
            d["draft_meta"].textContent = "%d characters · score %d" % (len(p.get("text") or ""),
                                                                       hl.check(p.get("text"), p.get("first_comment"))["score"])
