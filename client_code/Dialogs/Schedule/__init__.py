from anvil import *
from anvil.js import window

from ._anvil_designer import ScheduleTemplate
from ... import hl, state


def next_slots(posts):
    """The next four weekdays at 8:30 without a scheduled post (browser time)."""
    taken = set(hl.day_key(p["scheduled_at"]) for p in posts if p.get("status") == "scheduled" and p.get("scheduled_at"))
    out, i = [], 1
    base = window.Date()
    while len(out) < 4 and i < 30:
        c = window.Date(base.getTime() + i * 864e5)
        c.setHours(8, 30, 0, 0)
        i += 1
        if c.getDay() in (0, 6) or hl.day_key(c.toISOString()) in taken:
            continue
        out.append(c)
    return out


class Schedule(ScheduleTemplate):
    """Pick when to be reminded. Closes with {"when": iso}, {"action": "unschedule"} or None."""

    def __init__(self, post=None, posts=(), **properties):
        super().__init__(**properties)
        post = post or {}
        state.control(self.when_box).setAttribute("type", "datetime-local")
        state.set_control_attr(self.when_box, "aria-label", "Date and time")
        slots = next_slots(list(posts))
        self.slot_values = []
        for i, b in enumerate([self.slot0, self.slot1, self.slot2, self.slot3]):
            if i < len(slots):
                s = slots[i]
                b.text = str(s.toLocaleDateString([], hl.js({"weekday": "short", "day": "numeric", "month": "short"}))) + " 8:30"
                self.slot_values.append(hl.local_input(s.toISOString()))
            else:
                b.visible = False
                self.slot_values.append("")
        self.when_box.text = hl.local_input(post.get("scheduled_at")) or (self.slot_values[0] if slots else "")
        self.unsched_button.visible = post.get("status") == "scheduled"
        self.pid = post.get("id")
        self.others = [p for p in posts if p.get("id") != self.pid and p.get("status") in ("scheduled", "posted") and hl.when(p)]
        state.control(self.when_box).addEventListener("input", lambda e: self._check_gap())
        self._check_gap()

    def _check_gap(self):
        """A soft note when the chosen time is within 12 hours of another scheduled or posted post (never blocks)."""
        v = state.control(self.when_box).value
        chosen = hl.time_ms(hl.from_local(str(v))) if v else 0
        near, gap = None, None
        if chosen:
            for p in self.others:
                d = abs(hl.time_ms(hl.when(p)) - chosen)
                if d < 12 * 3600 * 1000 and (gap is None or d < gap):
                    near, gap = p, d
        self.gap_note.visible = near is not None
        if near is not None and gap is not None:
            hours = int(round(gap / 3600000.0))
            when = "less than an hour" if hours < 1 else state.plural(hours, "hour")
            side = "before" if hl.time_ms(hl.when(near)) < chosen else "after"
            what = "goes out" if near.get("status") == "scheduled" else "went out"
            self.gap_note.text = ("Another post %s %s %s this one (“%s”). Posts close together compete for the same "
                                  "readers: about a day apart works better. You can still schedule it."
                                  % (what, when, side, hl.hook(near.get("text"))[:50]))

    def _slot(self, i):
        self.when_box.text = self.slot_values[i]
        self._check_gap()

    @handle("slot0", "click")
    def slot0_click(self, **event_args):
        self._slot(0)

    @handle("slot1", "click")
    def slot1_click(self, **event_args):
        self._slot(1)

    @handle("slot2", "click")
    def slot2_click(self, **event_args):
        self._slot(2)

    @handle("slot3", "click")
    def slot3_click(self, **event_args):
        self._slot(3)

    @handle("unsched_button", "click")
    def unsched_button_click(self, **event_args):
        self.raise_event("x-close-alert", value={"action": "unschedule"})

    @handle("cancel_button", "click")
    def cancel_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)

    @handle("ok_button", "click")
    def ok_button_click(self, **event_args):
        v = state.control(self.when_box).value
        if not v:
            state.toast("Pick a date and time.", "error")
            return
        self.raise_event("x-close-alert", value={"when": hl.from_local(str(v))})
