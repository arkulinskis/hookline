from anvil import *
from anvil.js import window

from ._anvil_designer import CardListTemplate


class CardList(CardListTemplate):
    """A titled list on the voice card (traits, you do, you avoid, signature moves). item = {title, items}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.dom_nodes["title"].textContent = self.item["title"]
        ul = self.dom_nodes["list"]
        for x in self.item.get("items") or []:
            li = window.document.createElement("li")
            li.textContent = x
            ul.appendChild(li)
