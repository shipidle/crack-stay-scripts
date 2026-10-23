# Scroll Guard 1.8.5 — wheel callback rollback

Do not run checkPosition before accepting a new wheel gesture: Chrome can expose
a newer compositor scroll position before the wheel callback. The old preflight
could restore the old held position, swallowing the movement.

While the wheel is active, update the existing reading position directly without
repeated overlay geometry scans, allocation of a new reading record, or observer
setup. Full snapshot and anchor capture still run when the gesture settles.
Programmatic downward calls remain guarded, including after Ctrl+Enter replies.

Offline Chrome regression: start at 1200, expose native position 1320 before the
wheel event. Version 1.8.4 restores 1200 (FAIL); 1.8.5 keeps 1320 with zero guard
restoration writes (PASS), then blocks a scripted bottom jump.

Full suite: 25/27 pass, including keyboard-helper integration and completion
focus. The same two pre-existing failures documented in 1.8.2 remain unchanged.
Syntax, beta channel, installation index and diff checks pass. Actual user-wheel
smoothness remains to be confirmed after installing the update.
