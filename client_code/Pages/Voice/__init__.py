import copy
import re

from anvil import *
from anvil.js import window

from ._anvil_designer import VoiceTemplate
from ... import hl, router, state

TABS = ["voice", "rhythm", "ai", "linkedin"]
TONES = ["formal", "playful", "bold", "warm"]


class Voice(VoiceTemplate):
    """#voice/{voice,rhythm,ai,linkedin} (Operate): your voice (about, audience, language, past posts measured in the
    browser, an AI voice card, banned words, tone), pillars and rhythm, the AI key (saved ONLY in this browser by
    hl-ai.js; never sent to our server) and the LinkedIn connection (official OAuth; returns to #voice/linkedin?ok=1)."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.tab = args[0] if args and args[0] in TABS else "voice"
        parts = {"voice": self.voice_part, "rhythm": self.rhythm_part, "ai": self.ai_part, "linkedin": self.linkedin_part}
        tabs = {"voice": self.tab_voice, "rhythm": self.tab_rhythm, "ai": self.tab_ai, "linkedin": self.tab_linkedin}
        for name in TABS:
            parts[name].visible = name == self.tab
            tabs[name].classes["on"] = name == self.tab
        self.ws: dict = hl.load() or {"profile": {}, "posts": [], "linkedin": {}}
        self.v = copy.deepcopy((self.ws.get("profile") or {}).get("voice") or {})
        getattr(self, "_draw_" + self.tab)()

    # ---------------------------------------------------------------- voice
    def _save_voice(self, extra=None):
        body = dict(self.v)
        body.update(extra or {})
        r = state.call("save_profile", body)
        if r:
            self.ws["profile"] = r["profile"]
            self.v = copy.deepcopy(r["profile"].get("voice") or {})
        return r

    def _draw_voice(self):
        v = self.v
        v.setdefault("samples", [])
        v.setdefault("banned", [])
        v.setdefault("tone", {})
        state.set_control_attr(self.about_box, "rows", 2)
        state.set_control_attr(self.about_box, "maxlength", 600)
        state.set_control_attr(self.audience_box, "maxlength", 300)
        state.set_control_attr(self.language_box, "maxlength", 30)
        state.set_control_attr(self.new_sample_box, "rows", 5)
        state.set_control_attr(self.new_sample_box, "aria-label", "Paste a past post")
        state.set_control_attr(self.banned_box, "aria-label", "Words you never use")
        self.about_box.text = v.get("about") or ""
        self.audience_box.text = v.get("audience") or ""
        self.language_box.text = v.get("language") or "English"
        self.banned_box.text = ", ".join(v["banned"])
        for t in TONES:
            val = v["tone"].get(t)
            hl.loose(self.dom_nodes)["tone_" + t].value = str(50 if val is None else val)
        self._draw_samples()

    def _draw_samples(self):
        v = self.v
        self.samples_intro.text = ("Paste 5 to 30 posts you're proud of. Hookline measures your style here in the browser" +
                                   (", and the AI writes a voice card from them." if hl.ai_has() else ". Add an AI key for a written voice card."))
        self.samples_count.text = "%s saved" % state.plural(len(v["samples"]), "post")
        self.samples_panel.items = [{"i": i, "text": s, "host": self} for i, s in enumerate(v["samples"])]
        st = hl.voice_stats(v["samples"])
        self.stats_part.visible = bool(st)
        if st:
            d = self.dom_nodes
            d["s_chars"].textContent = str(st["chars"])
            d["s_words"].textContent = str(st["sentence_words"])
            d["s_hook"].textContent = str(st["hook_chars"])
            d["s_emoji"].textContent = str(st["emoji"])
            d["s_tags"].textContent = str(st["hashtags"])
            d["s_q"].textContent = "%s%%" % st["questions"]
            d["s_grade"].textContent = str(st["grade"] or "–")
            self.summary_label.text = hl.voice_summary(st)
        card = v.get("card") or {}
        self.card_part.visible = len(v["samples"]) >= 3
        self.card_head.visible = bool(card.get("summary"))
        self.card_summary.text = card.get("summary") or "No voice card yet."
        self.card_summary.role = None if card.get("summary") else ["fine-print"]
        self.card_panel.items = [{"title": t, "items": card.get(k) or []} for k, t in
                                 (("traits", "Traits"), ("do", "You do"), ("dont", "You avoid"), ("moves", "Signature moves"))
                                 if card.get(k)] if card.get("summary") else []
        self.card_button.text = "Rewrite the voice card" if card.get("summary") else "Write my voice card"

    def _read_voice(self):
        v = self.v
        v["about"] = self.about_box.text or ""
        v["audience"] = self.audience_box.text or ""
        v["language"] = self.language_box.text or ""
        v["banned"] = [x.strip() for x in (self.banned_box.text or "").split(",") if x.strip()]
        v["tone"] = {t: int(float(hl.loose(self.dom_nodes)["tone_" + t].value)) for t in TONES}

    @handle("add_sample_button", "click")
    def add_sample_button_click(self, **event_args):
        parts = [s.strip() for s in re.split(r"\n-{3,}\n", self.new_sample_box.text or "") if len(s.strip()) > 20]
        if not parts:
            state.toast("Paste a post first.", "error")
            return
        self._read_voice()
        self.v["samples"] = (self.v.get("samples") or []) + parts
        self.v["samples"] = self.v["samples"][:30]
        self.v["stats"] = hl.voice_stats(self.v["samples"]) or {}
        if self._save_voice():
            self.new_sample_box.text = ""
            state.toast(state.plural(len(parts), "post") + " added", "ok")
            self._draw_samples()

    def remove_sample(self, i):
        self._read_voice()
        self.v["samples"].pop(i)
        self.v["stats"] = hl.voice_stats(self.v["samples"]) or {}
        if self._save_voice():
            self._draw_samples()

    @handle("card_button", "click")
    def card_button_click(self, **event_args):
        if not hl.ai_has():
            from ...Dialogs.AiNudge import AiNudge
            alert(AiNudge(title="Voice card", what="write your voice card from your posts"), buttons=[], role="app-dialog")
            return
        self.card_button.enabled = False
        try:
            card = hl.py(window.HL.ai.voiceCard(hl.js(self.v.get("samples") or [])))
        except Exception as e:
            state.toast(hl.ai_error(e), "error")
            return
        finally:
            self.card_button.enabled = True
        self._read_voice()
        self.v["card"] = card
        if self._save_voice():
            state.toast("Voice card written", "ok")
            self._draw_samples()

    @handle("save_voice_button", "click")
    def save_voice_button_click(self, **event_args):
        self._read_voice()
        self.v["stats"] = hl.voice_stats(self.v.get("samples") or []) or {}
        if self._save_voice():
            state.toast("Saved", "ok")

    # ---------------------------------------------------------------- pillars + rhythm
    def _draw_rhythm(self):
        prof = self.ws.get("profile") or {}
        self.pillars = [dict(p) for p in prof.get("pillars") or []]
        self._draw_pillars()
        self.cadence_box.text = str(prof.get("cadence") or 3)
        state.set_control_attr(self.cadence_box, "min", 1)
        state.set_control_attr(self.cadence_box, "max", 14)
        self.reminders_box.checked = bool(prof.get("reminders"))

    def _draw_pillars(self):
        self.pillars_panel.items = [{"i": i, "pillar": p, "host": self} for i, p in enumerate(self.pillars)]
        self.add_pillar_button.enabled = len(self.pillars) < 6
        self.show_total()

    def _read_pillars(self):
        return [it["form"].read() for it in self.pillars_panel.items if it.get("form")]

    def show_total(self):
        rows = self._read_pillars() if self.pillars_panel.items and all(it.get("form") for it in self.pillars_panel.items) else self.pillars
        total = sum(int(p.get("target") or 0) for p in rows)
        self.total_label.text = "Targets add up to %d%%%s" % (total, "" if total == 100 else " (aim for 100)")
        self.total_label.role = ["fine-print"] if total == 100 else ["fine-print", "warn-text"]

    @handle("add_pillar_button", "click")
    def add_pillar_button_click(self, **event_args):
        self.pillars = self._read_pillars() + [{"id": "", "name": "New pillar", "color": "#4a6fa5", "target": 0}]
        self._draw_pillars()

    def remove_pillar(self, i):
        ps = self._read_pillars()
        ps.pop(i)
        self.pillars = ps
        self._draw_pillars()

    @handle("save_rhythm_button", "click")
    def save_rhythm_button_click(self, **event_args):
        tz = str(window.Intl.DateTimeFormat().resolvedOptions().timeZone or "")
        r = state.call("save_profile", None, self._read_pillars(), self.cadence_box.text, self.reminders_box.checked, tz)
        if r:
            self.ws["profile"] = r["profile"]
            state.toast("Saved", "ok")
            self._draw_rhythm()

    # ---------------------------------------------------------------- AI key (this browser only)
    def _draw_ai(self):
        a = hl.ai_settings()
        self.key_box.text = a.get("key") or ""
        state.set_control_attr(self.key_box, "autocomplete", "off")
        state.set_control_attr(self.key_box, "spellcheck", "false")
        state.set_control_attr(self.key_box, "aria-label", "API key")
        current = hl.ai_model()
        for rb, m in zip([self.model0, self.model1, self.model2], hl.ai_models()):
            rb.text = "%s · %s" % (m[1], m[2])
            rb.value = m[0]
            rb.selected = m[0] == current
        self.forget_button.visible = bool(a.get("key"))
        self.test_label.text = ""

    def _picked_model(self):
        for rb in (self.model0, self.model1, self.model2):
            if rb.selected:
                return rb.value
        return None

    @handle("save_key_button", "click")
    def save_key_button_click(self, **event_args):
        key = (self.key_box.text or "").strip()
        if key and not key.startswith("sk-ant-"):
            state.toast("That doesn't look like an Anthropic key (they start with sk-ant-).", "error")
            return
        hl.ai_save(key, self._picked_model())
        state.toast("Saved in this browser" if key else "Key removed", "ok")
        self._draw_ai()

    @handle("test_key_button", "click")
    def test_key_button_click(self, **event_args):
        hl.ai_save((self.key_box.text or "").strip(), self._picked_model())
        self.test_label.role = ["vc-test"]
        self.test_label.text = "Asking %s…" % hl.ai_model_name()
        self.test_key_button.enabled = False
        try:
            txt = str(window.HL.ai.test())
            self.test_label.role = ["vc-test", "good-text"]
            self.test_label.text = "✓ It works. " + txt.strip()[:120]
        except Exception as e:
            self.test_label.role = ["vc-test", "bad-text"]
            self.test_label.text = hl.ai_error(e)
        finally:
            self.test_key_button.enabled = True
            self.forget_button.visible = bool((self.key_box.text or "").strip())

    @handle("forget_button", "click")
    def forget_button_click(self, **event_args):
        hl.ai_clear()
        state.toast("Key forgotten on this browser")
        self._draw_ai()

    # ---------------------------------------------------------------- LinkedIn
    def _draw_linkedin(self):
        li: dict = self.ws.get("linkedin") or {}
        q = router.query()
        self.li_ok.visible = "ok=1" in q
        err = q.split("error=", 1)[1] if "error=" in q else ""
        self.li_error.visible = bool(err)
        self.li_error.text = str(window.decodeURIComponent(err)) if err else ""
        connected, configured = bool(li.get("connected")), bool(li.get("configured"))
        self.li_connected.visible = connected
        self.li_note.visible = connected
        self.li_connect_part.visible = not connected and configured
        self.li_off.visible = not connected and not configured
        if connected:
            d = self.dom_nodes
            if li.get("picture"):
                d["li_pic"].src = li["picture"]
                d["li_av"].remove()
            else:
                d["li_pic"].remove()
            d["li_name"].textContent = li.get("name") or ""
            days = int(li.get("days_left") or 0)
            d["li_days"].textContent = "Connected · %d days left" % days
            d["li_meter"].style.width = "%d%%" % round(100.0 * days / 60)
            if days < 7:
                d["li_meter"].style.background = "var(--c-warn)"
            self.reconnect_button.visible = days < 14

    def _connect(self):
        r = state.call("li_auth_url")
        if r:
            window.location.href = r["url"]

    @handle("connect_button", "click")
    def connect_button_click(self, **event_args):
        self._connect()

    @handle("reconnect_button", "click")
    def reconnect_button_click(self, **event_args):
        self._connect()

    @handle("disconnect_button", "click")
    def disconnect_button_click(self, **event_args):
        if confirm("Hookline forgets the connection. You can still copy and post.", title="Disconnect LinkedIn?",
                   buttons=[("Cancel", False), ("Disconnect", True)], role="app-dialog"):
            r = state.call("li_disconnect")
            if r:
                self.ws["linkedin"] = r["linkedin"]
                self._draw_linkedin()
