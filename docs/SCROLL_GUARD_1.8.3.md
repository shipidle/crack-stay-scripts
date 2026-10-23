# Scroll Guard 1.8.3 — manual desktop scrolling

The native bottom-snap heuristic previously treated all gestures like touch.
A fast wheel move or scrollbar jump greater than 450px (or 85% of viewport)
in less than 125ms could therefore be restored to the old reading position.
Scrollbar track clicks also did not count as movement until pointermove arrived.

Record gesture source and restrict the touch snap heuristic to touch input.
Accept scrollbar track movement immediately. Programmatic scroll wrappers,
desktop reply hold, initial entry and explicit navigation remain unchanged.

Validation: offline Chrome 155.0.8059.86 passes 23/25 cases, including two new
manual wheel/scrollbar regressions, desktop reply hold and actual touch swipe.
The same two pre-existing failures documented in SCROLL_GUARD_1.8.2.md remain.
Syntax, beta metadata, install index and diff checks pass. Live user-browser
confirmation of improved manual scrolling is still pending.
