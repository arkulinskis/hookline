import re

from anvil import *
from anvil.js import window

from ._anvil_designer import CalendarTemplate
from ... import hl, router, state

DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


class Calendar(CalendarTemplate):
    """#calendar[/YYYY-MM] (Operate): the month with scheduled and posted posts, the weekly count against the target,
    drag a draft or a scheduled post onto a day (keeps its time, 8:30 for drafts), drafts to place, pillar mix and
    best times from posts with results."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.drag_id = None
        m = re.match(r"^(\d{4})-(\d{2})$", args[0]) if args else None
        now = window.Date()
        self.year, self.month = (int(m.group(1)), int(m.group(2)) - 1) if m else (int(now.getFullYear()), int(now.getMonth()))
        self.ws: dict = hl.load() or {"profile": {}, "posts": []}
        self.draw()

    def _date(self, y, mo, d=1, h=12):
        return window.Date(y, mo, d, h, 0, 0)

    def by_day(self):
        out: dict = {}
        for p in self.ws["posts"]:
            w = hl.when(p)
            if w and p["status"] in ("scheduled", "posted"):
                out.setdefault(hl.day_key(w), []).append(p)
        return out

    def best_times(self):
        posted = [p for p in self.ws["posts"] if p["status"] == "posted" and (p.get("metrics") or {}).get("impressions")]
        if len(posted) < 8:
            return None
        days: dict = {}
        hours: dict = {}
        for p in posted:
            d = window.Date(p["posted_at"])
            dk, hk = (int(d.getDay()) + 6) % 7, int(d.getHours())
            days.setdefault(dk, []).append(p["metrics"]["impressions"])
            hours.setdefault(hk, []).append(p["metrics"]["impressions"])
        avg = lambda a: sum(a) / float(len(a))  # noqa: E731
        ds = sorted([(DOW[k], avg(v), len(v)) for k, v in days.items() if len(v) >= 2], key=lambda r: -r[1])
        hs = sorted([("%d:00" % k, avg(v), len(v)) for k, v in hours.items() if len(v) >= 2], key=lambda r: -r[1])
        return {"days": ds[:3], "hours": hs[:3], "n": len(posted)}

    def draw(self):
        ws, mp = self.ws, self.by_day()
        y, mo = self.year, self.month
        first = self._date(y, mo)
        start = self._date(y, mo, 1 - ((int(first.getDay()) + 6) % 7))
        today = hl.day_key(window.Date().toISOString())
        target = int((ws.get("profile") or {}).get("cadence") or 3)
        self.dom_nodes["target_text"].textContent = "Target: %d posts a week" % target
        self.month_label.text = str(first.toLocaleDateString([], hl.js({"month": "long", "year": "numeric"})))
        state.heading(self.month_label, 2)
        weeks, month_posts = [], []
        for w in range(6):
            wk = self._date(int(start.getFullYear()), int(start.getMonth()), int(start.getDate()) + w * 7)
            if w >= 4 and int(wk.getMonth()) != mo:
                break
            days, count = [], 0
            for d in range(7):
                day = self._date(int(wk.getFullYear()), int(wk.getMonth()), int(wk.getDate()) + d)
                key = hl.day_key(day.toISOString())
                items = sorted(mp.get(key, []), key=lambda p: hl.time_ms(hl.when(p)))
                count += len(items)
                if int(day.getMonth()) == mo:
                    month_posts += items
                posts = []
                for p in items:
                    pl = hl.pillar(ws, p.get("pillar"))
                    tm = "" if p["status"] == "posted" else str(window.Date(p["scheduled_at"]).toLocaleTimeString([], hl.js({"hour": "2-digit", "minute": "2-digit"})))
                    posts.append({"post": p, "color": pl.get("color") if pl else None, "time": tm, "host": self})
                days.append({"key": key, "n": int(day.getDate()), "other": int(day.getMonth()) != mo, "today": key == today,
                             "label": str(day.toDateString()), "posts": posts, "host": self})
            weeks.append({"count": count, "target": target, "days": days})
        self.weeks_panel.items = weeks
        drafts = [p for p in ws["posts"] if p["status"] == "draft"][:12]
        self.drafts_panel.items = [{"post": p, "host": self} for p in drafts]
        self.drafts_hint.visible = bool(drafts)
        self.no_drafts.visible = not drafts
        pillars = (ws.get("profile") or {}).get("pillars") or []
        total = len(month_posts) or 1
        mix = self.dom_nodes["mix"]
        mix.innerHTML = ""
        rows = []
        for p in pillars:
            n = len([x for x in month_posts if x.get("pillar") == p["id"]])
            if month_posts:
                seg = hl.loose(window.document.createElement("i"))
                seg.style.width = "%.1f%%" % (100.0 * n / total)
                seg.style.background = p.get("color") or ""
                mix.appendChild(seg)
            rows.append({"name": p["name"], "color": p.get("color"),
                         "text": ("%d%% · " % round(100.0 * n / total) if month_posts else "") + "goal %s%%" % p.get("target", 0)})
        mix.style.display = "flex" if month_posts else "none"
        self.no_mix.visible = not month_posts
        self.mix_panel.items = rows
        bt = self.best_times()
        self.times_part.visible = bool(bt)
        self.no_times.visible = not bt
        if bt:
            self.times_panel.items = ([{"label": d[0], "value": hl.fmt_num(d[1]) + " avg views"} for d in bt["days"]] +
                                      [{"label": h[0], "value": hl.fmt_num(h[1]) + " avg views"} for h in bt["hours"]])
            self.times_note.text = "From your %d posts with results. Patterns firm up after a few months." % bt["n"]

    def _move(self, n):
        if n == 0:
            now = window.Date()
            self.year, self.month = int(now.getFullYear()), int(now.getMonth())
        else:
            d = self._date(self.year, self.month + n)
            self.year, self.month = int(d.getFullYear()), int(d.getMonth())
        router.replace("calendar", "%04d-%02d" % (self.year, self.month + 1))
        self.draw()

    @handle("prev_button", "click")
    def prev_button_click(self, **event_args):
        self._move(-1)

    @handle("next_button", "click")
    def next_button_click(self, **event_args):
        self._move(1)

    @handle("today_button", "click")
    def today_button_click(self, **event_args):
        self._move(0)

    def schedule(self, pid, day_key, time=None):
        p = next((x for x in self.ws["posts"] if x["id"] == pid), None)
        if not p:
            return
        at = str(window.Date(day_key + "T" + (time or "08:30") + ":00").toISOString())
        body = dict(p)
        body.update({"status": "scheduled", "scheduled_at": at})
        r = state.call("save_post", body)
        if r:
            hl.put_post(r["post"])
            self.ws["posts"] = [r["post"] if x["id"] == pid else x for x in self.ws["posts"]]
            state.toast("Scheduled for " + hl.fmt_datetime(r["post"]["scheduled_at"]), "ok")
            self.draw()

    def dropped(self, day_key):
        pid, self.drag_id = self.drag_id, None
        if not pid:
            return
        p = next((x for x in self.ws["posts"] if x["id"] == pid), None)
        time = hl.local_input(p["scheduled_at"])[11:16] if p and p.get("scheduled_at") else "08:30"
        self.schedule(pid, day_key, time)

    def new_on(self, day_key):
        from ...Dialogs.DayPick import DayPick
        drafts = [p for p in self.ws["posts"] if p["status"] == "draft"][:8]
        r = alert(DayPick(day_key=day_key, drafts=drafts), buttons=[], role="app-dialog")
        if r:
            self.schedule(r, day_key)

    def pick_time(self, pid):
        from ...Dialogs.PickTime import PickTime
        v = alert(PickTime(), buttons=[], role="app-dialog")
        if v:
            self.schedule(pid, v[:10], v[11:16])
