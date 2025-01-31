from __future__ import annotations

from os.path import join
from pathlib import Path

import traitlets
from anywidget import AnyWidget
from ipywidgets import CallbackDispatcher, widget_serialization

from .controls import Control, ControlPosition
from .layer import Layer
from .map import Map, MapOptions
from .sources import Source


class MapWidget(AnyWidget, Map):
    """MapWidget

    Use this class to display and update maps in Jupyter Notebooks.

    See `maplibre.Map` for available methods.

    Examples:
        >>> from maplibre import MapOptions
        >>> from maplibre.ipywidget import MapWidget as Map
        >>> m = Map(MapOptions(center=(-123.13, 49.254), zoom=11, pitch=45))
        >>> m # doctest: +SKIP
    """

    _esm = join(Path(__file__).parent, "srcjs", "ipywidget.js")
    _css = join(Path(__file__).parent, "srcjs", "maplibre-gl.css")
    _use_message_queue = False
    _rendered = traitlets.Bool(False, config=True).tag(sync=True)
    map_options = traitlets.Dict().tag(sync=True)
    calls = traitlets.List().tag(sync=True)
    height = traitlets.Union([traitlets.Int(), traitlets.Unicode()]).tag(sync=True)
    lng_lat = traitlets.Dict().tag(sync=True)
    dragging = traitlets.Bool(True).tag(sync=True)
    timesteps = traitlets.List().tag(sync=True)
    zoom = traitlets.Float().tag(sync=True)
    center = traitlets.Dict().tag(sync=True)

    _click_callbacks = traitlets.Instance(CallbackDispatcher, ())
    _mousemove_callbacks = traitlets.Instance(CallbackDispatcher, ())
    _mouseenter_callbacks = traitlets.Instance(CallbackDispatcher, ())
    _mouseout_callbacks = traitlets.Instance(CallbackDispatcher, ())
    _mousedown_callbacks = traitlets.Instance(CallbackDispatcher, ())
    _mouseup_callbacks = traitlets.Instance(CallbackDispatcher, ())

    def __init__(self, map_options=MapOptions(), **kwargs) -> None:
        self.calls = []
        AnyWidget.__init__(self, **kwargs)
        Map.__init__(self, map_options, **kwargs)
        self.on_msg(self._handle_mouse_events)

    def _handle_mouse_events(self, _, content, buffers):
        """Handle mouse events from the frontend."""
        #print("Inside _handle_mouse_events...")
        #print(f"{content=}")
        #print(f"{buffers=}")
        event_type = content.get("type", "")
        if event_type == "click":
            self._click_callbacks(**content)
        elif event_type == "mousemove":
            self._mousemove_callbacks(**content)
        elif event_type == "mouseenter":
            self._mouseenter_callbacks(**content)
        elif event_type == "mouseout":
            self._mouseout_callbacks(**content)
        elif event_type == "mousedown":
            self._mousedown_callbacks(**content)
        elif event_type == "mouseup":
            self._mouseup_callbacks(**content)

    def on_click(self, callback, remove=False):
        """Add a click event listener.

        Parameters
        ----------
        callback : callable
            Callback function that will be called on click event.
        remove: boolean
            Whether to remove this callback or not. Defaults to False.
        """
        self._click_callbacks.register_callback(callback, remove=remove)

    def on_mousemove(self, callback, remove=False):
        """Add a mousemove event listener."""
        self._mousemove_callbacks.register_callback(callback, remove=remove)

    def on_mouseenter(self, callback, remove=False):
        """Add a mouseenter event listener."""
        self._mouseenter_callbacks.register_callback(callback, remove=remove)

    def on_mouseout(self, callback, remove=False):
        """Add a mouseout event listener."""
        self._mouseout_callbacks.register_callback(callback, remove=remove)

    def on_mousedown(self, callback, remove=False):
        """Add a mousedown event listener."""
        self._mousedown_callbacks.register_callback(callback, remove=remove)

    def on_mouseup(self, callback, remove=False):
        """Add a mouseup event listener."""
        self._mouseup_callbacks.register_callback(callback, remove=remove)


    @traitlets.default("height")
    def _default_height(self):
        return "400px"

    @traitlets.validate("height")
    def _validate_height(self, proposal):
        height = proposal["value"]
        if isinstance(height, int):
            return f"{height}px"

        return height

    @traitlets.observe("_rendered")
    def _on_rendered(self, change):
        self.send({"calls": self._message_queue, "msg": "init"})
        self._message_queue = []

    def use_message_queue(self, value: bool = True) -> None:
        self._use_message_queue = value

    def add_call(self, method_name: str, *args) -> None:
        call = [method_name, args]
        if not self._rendered:
            if not self._use_message_queue:
                self.calls = self.calls + [call]
                return

            self._message_queue.append(call)
            return

        self.send({"calls": [call], "msg": "custom call"})
