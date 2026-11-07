import json

from anvil import *

from ._anvil_designer import FeedPreviewTemplate


class FeedPreview(FeedPreviewTemplate):
    """The feed preview: the engine (window.HL.feedCard) draws the card into this box. draw(text, opts) with opts
    {name, headline, mode: 'desktop' | 'mobile', format, expanded}. Pressing "...see more" opens the whole post here
    and calls on_expand (if set), so a page can remember it."""

    def __init__(self, **properties):
        self._text, self._opts = "", {}
        self.on_expand = None
        super().__init__(**properties)

    def draw(self, text, opts=None):
        self._text, self._opts = text or "", dict(opts or {})
        self._render()

    def _render(self):
        from anvil.js import window
        window.HL.py.feed(self.dom_nodes["box"], self._text, json.dumps(self._opts), self._expand)

    def _expand(self):
        self._opts["expanded"] = True
        self._render()
        if self.on_expand:
            self.on_expand()
