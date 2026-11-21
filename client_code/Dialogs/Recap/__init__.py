import json

from anvil import *
from anvil.js import window

from ._anvil_designer import RecapTemplate
from ... import hl, state

SITE = "hookline.anvil.app"


def month_data(ws, year, month):
    """Everything the recap card shows for one month (month is 0-11, browser time). None when nothing was posted."""
    posts = []
    for p in ws.get("posts") or []:
        if p.get("status") == "posted" and p.get("posted_at"):
            d = window.Date(p["posted_at"])
            if int(d.getFullYear()) == year and int(d.getMonth()) == month:
                posts.append(p)
    label = str(window.Date(year, month, 1, 12).toLocaleDateString([], hl.js({"month": "long", "year": "numeric"})))
    if not posts:
        return {"label": label, "empty": True}
    r = hl.rhythm(ws)
    # weeks whose Monday falls in this month; this week only counts once it's on target (it isn't over yet)
    now_ms = hl.now_ms()
    weeks, on = 0, 0
    for day in range(1, 32):
        d = window.Date(year, month, day, 12)
        if int(d.getMonth()) != month or hl.time_ms(d.toISOString()) > now_ms:
            break
        if int(d.getDay()) == 1:
            met = r["counts"].get(hl.day_key(d.toISOString()), 0) >= r["target"]
            if met or now_ms - hl.time_ms(d.toISOString()) >= 7 * 864e5:
                weeks += 1
                on += 1 if met else 0
    views = sum(int((p.get("metrics") or {}).get("impressions") or 0) for p in posts)
    talk = sum(int((p.get("metrics") or {}).get("comments") or 0) + int((p.get("metrics") or {}).get("reactions") or 0) for p in posts)
    with_views = [p for p in posts if (p.get("metrics") or {}).get("impressions")]
    if with_views:
        best = max(with_views, key=lambda p: p["metrics"]["impressions"])
        best_note = "%s views" % hl.fmt_num(best["metrics"]["impressions"])
    else:
        best = max(posts, key=lambda p: hl.hook_score(hl.hook(p.get("text")))["score"])
        best_note = "strongest hook"
    names: dict = {}
    for p in posts:
        pl = hl.pillar(ws, p.get("pillar"))
        if pl:
            names[pl["name"]] = names.get(pl["name"], 0) + 1
    top, top_n = "", 0  # (no lambda over `names`: Skulpt can't close over an annotated local)
    for k, v in names.items():
        if v > top_n:
            top, top_n = k, v
    now = window.Date()
    current = int(now.getFullYear()) == year and int(now.getMonth()) == month
    extra = []
    if top:
        extra.append("Top pillar: " + top)
    if current and r["streak"] >= 2:
        extra.append("%d-week rhythm" % r["streak"])
    return {
        "empty": False, "label": label, "name": (state.me() or {}).get("name") or "", "site": SITE,
        "count": len(posts), "weeks": weeks, "on": on, "views": views, "talk": talk,
        "stats": [[str(len(posts)), "posts published"],
                  ["%d/%d" % (on, weeks) if weeks else "–", "weeks on target"],
                  [hl.fmt_num(views) if views else "–", "views logged"],
                  [hl.fmt_num(talk) if talk else "–", "reactions & comments"]],
        "hook": hl.hook(best.get("text")), "best_note": best_note, "extra": " · ".join(extra),
    }


class Recap(RecapTemplate):
    """Month recap: a 1080x1350 card of the month (posts, weeks on target, views, best opener, top pillar), drawn in
    the browser by hl-media.js (window.HLR), with a caption to copy and a PNG to download. Nothing is posted."""

    def __init__(self, ws=None, year=2026, month=0, **properties):
        super().__init__(**properties)
        self.data = month_data(ws or {}, int(year), int(month))
        self.dom_nodes["title"].textContent = "Your " + self.data["label"]
        empty = self.data.get("empty")
        self.card_part.visible = not empty
        self.empty_part.visible = bool(empty)
        if empty:
            self.dom_nodes["empty_title"].textContent = "Nothing posted in %s yet" % self.data["label"]
            return
        state.set_control_attr(self.caption_box, "rows", 5)
        self.caption_box.text = self.caption()
        window.HLR.render(self.dom_nodes["canvas"], json.dumps(self.data))

    def caption(self):
        d = self.data
        bits = ["My LinkedIn month, %s: %s" % (d["label"], state.plural(d["count"], "post"))]
        if d["weeks"]:
            bits.append("%d of %d weeks on target" % (d["on"], d["weeks"]))
        if d["views"]:
            bits.append("%s views" % hl.fmt_num(d["views"]))
        text = ", ".join(bits) + "."
        if d.get("hook"):
            text += "\n\nThe opener that worked best: “%s”" % d["hook"][:160]
        text += "\n\nWhat I'm keeping for next month: [one thing you learned].\n\nWritten with Hookline, a free LinkedIn writing studio: https://" + SITE
        return text

    @handle("png_button", "click")
    def png_button_click(self, **event_args):
        name = "linkedin-month-" + "-".join(self.data["label"].lower().split()) + ".png"
        window.HLR.download(self.dom_nodes["canvas"], name)

    @handle("copy_button", "click")
    def copy_button_click(self, **event_args):
        hl.copy(self.caption_box.text or "", "Caption copied")

    @handle("close_button", "click")
    def close_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)
