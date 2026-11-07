import json
import re

from anvil import *
from anvil.js import window

from ._anvil_designer import InsightsTemplate
from ... import hl, state

DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]


def avg(a):
    return sum(a) / float(len(a)) if a else 0.0


def group_avg(posts, key_fn, label_fn):
    g: dict = {}
    for p in posts:
        k = key_fn(p)
        if k is None or k == "":
            continue
        g.setdefault(k, []).append(p["metrics"]["impressions"])
    return sorted([(label_fn(k), avg(v), len(v)) for k, v in g.items()], key=lambda r: -r[1])


def bars(rows, unit="views", small=None):
    if not rows:
        return []
    mx = max([r[1] for r in rows] + [1])
    best = max(r[1] for r in rows)
    return [{"label": r[0], "value": r[1], "n": r[2], "pct": 100.0 * r[1] / mx, "top": r[1] == best and len(rows) > 1,
             "unit": unit, "small": small if small is not None else "· %d" % r[2]} for r in rows]


def F(pre, b="", post=""):
    return {"pre": pre, "b": b, "post": post}


def findings(ws, posts):
    """Patterns in the posts with results (the same rules as the JavaScript version)."""
    if len(posts) < 5:
        return [F("Log results for at least 5 posts and Hookline starts spotting patterns.")]
    out = []
    fm = [r for r in group_avg(posts, lambda p: p.get("format"), hl.format_label) if r[2] >= 2]
    if len(fm) >= 2:
        out.append(F("", fm[0][0], " posts get %.1f× the views of %s posts for you." % (fm[0][1] / fm[-1][1], fm[-1][0].lower())))
    pl = [r for r in group_avg(posts, lambda p: p.get("pillar"), lambda k: (hl.pillar(ws, k) or {}).get("name") or k) if r[2] >= 2]
    if len(pl) >= 2:
        out.append(F("Your ", pl[0][0], " posts do best (%s views on average)." % hl.fmt_num(pl[0][1])))
    imp = lambda lst: avg([p["metrics"]["impressions"] for p in lst])  # noqa: E731
    short = [p for p in posts if len(hl.hook(p.get("text"))) <= 60]
    long_ = [p for p in posts if len(hl.hook(p.get("text"))) > 60]
    if len(short) >= 3 and len(long_) >= 3:
        a, b = imp(short), imp(long_)
        out.append(F("Short first lines (under 60 characters) get ", "%d%% more views" % round(100 * (a / b - 1)), " than longer ones.")
                   if a > b else F("Longer first lines are doing fine for you: your audience reads past the hook."))
    link = re.compile(r"https?://")
    wl = [p for p in posts if link.search(p.get("text") or "")]
    nl = [p for p in posts if not link.search(p.get("text") or "")]
    if len(wl) >= 2 and len(nl) >= 3:
        l1, l2 = imp(wl), imp(nl)
        if l1 < l2:
            out.append(F("Posts with a link in the text got ", "%d%% fewer views" % round(100 * (1 - l1 / l2)), ". Keep links in the first comment."))
    q = [p for p in posts if (p.get("text") or "").strip().endswith("?")]
    nq = [p for p in posts if not (p.get("text") or "").strip().endswith("?")]
    if len(q) >= 3 and len(nq) >= 3:
        c1 = avg([p["metrics"].get("comments") or 0 for p in q])
        c2 = avg([p["metrics"].get("comments") or 0 for p in nq])
        if c1 > 0 or c2 > 0:
            out.append(F("Ending with a question brings ", ("%.1f×" % (c1 / c2) if c2 else "more") + " comments", ".") if c1 >= c2
                       else F("Your posts without a closing question get more comments. Your audience comments anyway."))
    wd = [r for r in group_avg(posts, lambda p: p.get("_dow"), lambda k: DOW[k]) if r[2] >= 2]
    if len(wd) >= 3:
        out.append(F("", wd[0][0], " is your strongest day so far."))
    return out or [F("Keep logging results: no clear pattern yet, which usually means consistency matters more than tactics right now.")]


class Insights(InsightsTemplate):
    """#insights (Operate): KPIs, impressions over time (SVG line chart engine, hl-media.js), findings, views by
    format / pillar / weekday, top posts, demographics, and the import of LinkedIn's own analytics export (read in the
    browser; only the numbers are saved). Example posts can be loaded and removed."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self._shown = False
        self.drop_empty.on_file = self.import_file
        self.drop_data.on_file = self.import_file
        self.reload()

    @handle("", "show")
    def form_show(self, **event_args):
        self._shown = True
        self._chart()

    def reload(self):
        self.ws: dict = hl.load() or {"profile": {}, "posts": []}
        self.draw()

    def draw(self):
        ws = self.ws
        an = ws.get("analytics")
        posted = [p for p in ws["posts"] if p["status"] == "posted" and p.get("posted_at")]
        for p in posted:
            p["_dow"] = int(window.Date(p["posted_at"]).getDay())
        with_m = [p for p in posted if (p.get("metrics") or {}).get("impressions")]
        has = bool(an or with_m)
        self.rmex_button.visible = bool(ws.get("has_examples"))
        self.empty_part.visible = not has
        self.data_part.visible = has
        if not has:
            return
        d = self.dom_nodes
        self.example_note.visible = bool((an and an.get("example")) or ws.get("has_examples"))
        now = hl.now_ms()
        last30 = [p for p in posted if now - hl.time_ms(p["posted_at"]) < 30 * 864e5]
        recent = sorted(with_m, key=lambda p: -hl.time_ms(p["posted_at"]))[:20]
        rates = [r for r in (hl.rate(p["metrics"]) for p in with_m) if r is not None]
        fol = sum(x.get("new") or 0 for x in (an.get("followers") or [])[-30:]) if an and an.get("followers") else None
        cad = (ws.get("profile") or {}).get("cadence") or 3
        d["k_posts"].textContent = str(len(last30))
        d["k_target"].textContent = " / %d" % round(cad * 30 / 7.0)
        d["k_posts_sub"].textContent = "Your target: %s a week" % cad
        d["k_views"].textContent = hl.fmt_num(avg([p["metrics"]["impressions"] for p in recent]))
        d["k_views_sub"].textContent = "Last %d posts with results" % min(20, len(with_m))
        d["k_rate"].textContent = "%.1f%%" % avg(rates) if rates else "–"
        total = an.get("followers_total") if an else None
        d["k_fol"].textContent = ("+%d" % fol) if fol is not None else (hl.fmt_num(total) if total else "–")
        d["k_fol_label"].textContent = "new followers, 30 days" if fol is not None else "followers"
        d["k_fol_sub"].textContent = (hl.fmt_num(total) + " total") if total else "From your export"
        d["chart_sub"].textContent = ("From your LinkedIn export, imported " + hl.ago(an.get("imported"))) if an else "Import your export to see daily numbers"
        d["find_sub"].textContent = "Patterns in your %s with results" % state.plural(len(with_m), "post")
        self.find_panel.items = findings(ws, with_m)
        for rows, panel, empty in ((group_avg(with_m, lambda p: p.get("format"), hl.format_label), self.fmt_panel, self.fmt_empty),
                                   (group_avg(with_m, lambda p: p.get("pillar"), lambda k: (hl.pillar(ws, k) or {}).get("name") or k), self.pil_panel, self.pil_empty),
                                   (group_avg(with_m, lambda p: p.get("_dow"), lambda k: DOW[k]), self.day_panel, self.day_empty)):
            panel.items = bars(rows)
            empty.visible = not rows
        self.top_panel.items = sorted(with_m, key=lambda p: -p["metrics"]["impressions"])[:8]
        demo = (an or {}).get("demographics") or []
        self.demo_card.visible = bool(demo)
        self.demo_panel.items = bars([(x["value"], x["pct"], x["category"]) for x in demo[:8]], "%", "%")
        self._chart()

    def _chart(self):
        if not self._shown or not self.data_part.visible:
            return
        an = self.ws.get("analytics")
        box = self.dom_nodes["chart"]
        days = {}
        for p in self.ws["posts"]:
            if p["status"] == "posted" and p.get("posted_at"):
                days[hl.day_key(p["posted_at"])] = 1
        width = int(box.clientWidth or 0) or 760
        window.HLI.chart(box, json.dumps((an or {}).get("daily", [])[-90:] if an else []), json.dumps(days), width)

    def import_file(self, f):
        state.toast("Reading %s…" % window.HLI.fileName(f))
        try:
            summary = json.loads(window.HLI.readFile(f))
        except Exception:
            state.toast("Couldn't read that file. Is it the .xlsx from LinkedIn?", "error")
            return
        if not summary.get("daily") and not summary.get("top"):
            state.toast("That file had no dates with impressions, or post links. Use LinkedIn's Analytics → Export.", "error")
            return
        r = state.call("import_analytics", summary)
        if r:
            state.toast("Imported %s and %s%s" % (state.plural(len(summary.get("daily") or []), "day"),
                                                  state.plural(len(summary.get("top") or []), "post"),
                                                  " (%d matched your posts)" % r["matched"] if r.get("matched") else ""), "ok")
            self.reload()

    @handle("import_button", "click")
    def import_button_click(self, **event_args):
        (self.drop_data if self.data_part.visible else self.drop_empty).open()

    @handle("examples_button", "click")
    def examples_button_click(self, **event_args):
        if state.call("add_examples"):
            state.toast("Example posts loaded", "ok")
            self.reload()

    @handle("rmex_button", "click")
    def rmex_button_click(self, **event_args):
        if confirm("Your own posts, ideas and imports stay.", title="Remove the example posts?",
                   buttons=[("Cancel", False), ("Remove", True)], role="app-dialog"):
            if state.call("remove_examples") is not None:
                state.toast("Examples removed")
                self.reload()
