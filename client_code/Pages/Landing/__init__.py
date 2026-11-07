from anvil import *
import anvil.js

from ._anvil_designer import LandingTemplate
from ... import hl, state

# The app's video on the Addanapp YouTube channel (APP_MAKER/youtube/manifest.json), shown in the Watch section.
YT_VIDEO = "rgkcyhKM1T8"
SAMPLE = ("I almost didn't post this.\n\nFor two years I wrote LinkedIn posts in my head and never pressed Publish.\n\n"
          "What changed wasn't confidence. It was a system: one idea a day, a hook I'd stop for, and a fixed day to post.\n\n"
          "What's the post you keep not writing?")


class Landing(LandingTemplate):
    """#landing (Persuade; also "About" for members). The hero is a live demo of the studio, all in the browser:
    type in pane 1, see where LinkedIn's "see more" cuts it in pane 2 (Components/FeedPreview), read the post check in
    pane 3 (HL.check through hl.py). Static copy lives in the template."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        me = state.me()
        self.guest_cta.visible = not me
        self.member_cta.visible = bool(me)
        if me:
            state.set_attr(self.band_link, "href", "#studio")
            anvil.js.get_dom_node(self.band_link).textContent = "Open the studio"
        self.mode = "mobile"
        self.lp_text.text = SAMPLE
        state.set_control_attr(self.lp_text, "aria-label", "Type or paste a post")
        state.set_control_attr(self.lp_text, "rows", 9)
        self.dom_nodes["yt_cover"].addEventListener("click", self._play)
        self._update()

    def _update(self):
        t = self.lp_text.text or ""
        self.mode_mobile.classes["on"] = self.mode == "mobile"
        self.mode_desktop.classes["on"] = self.mode == "desktop"
        self.preview.draw(t, {"name": "You", "headline": "Your headline", "mode": self.mode})
        has = bool(t.strip())
        self.score_row.visible = has
        if has:
            c = hl.check(t)
            h = hl.hook_score(hl.hook(t))
            self.score_ring.set(c["score"])
            self.score_text.text = "Post score %d\nhook %d/100" % (c["score"], h["score"])
            items = [i for i in c["items"] if i["level"] != "good"] + [i for i in c["items"] if i["level"] == "good"]
            self.checks_panel.items = items[:5]
        else:
            self.checks_panel.items = []

    @handle("lp_text", "change")
    def lp_text_change(self, **event_args):
        self._update()

    def mode_mobile_click(self, event):
        self.mode = "mobile"
        self._update()

    def mode_desktop_click(self, event):
        self.mode = "desktop"
        self._update()

    def _play(self, event):
        """Swap the video's cover for YouTube's player (privacy-enhanced); nothing loads from YouTube before this click."""
        self.dom_nodes["yt_frame"].innerHTML = (
            '<iframe src="https://www.youtube-nocookie.com/embed/' + YT_VIDEO + '?autoplay=1&rel=0&playsinline=1" '
            'title="Hookline video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen '
            'referrerpolicy="strict-origin-when-cross-origin"></iframe>')
