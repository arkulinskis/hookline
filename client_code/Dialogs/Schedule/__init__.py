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

    def _slot(self, i):
        self.when_box.text = self.slot_values[i]

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
