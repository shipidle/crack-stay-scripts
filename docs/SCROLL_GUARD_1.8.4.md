# Scroll Guard 1.8.4

Linebreak Optimizer consumes Ctrl+Enter in a window capture listener and calls
the send button's click(). The document-level reply guard previously rejected
that untrusted click, so desktop reply protection never started. Accept such
clicks only after the existing nearby, enabled submit-button validation.
Synthetic keyboard/submit events remain ignored.

During a desktop reply hold, editor focus uses preventScroll so completion focus
cannot move the viewport before the position checker restores it. Mobile keyboard
handling, native manual gestures, initial entry and explicit latest navigation are
unchanged.

The offline Chrome test now installs both actual userscripts together and sends
Ctrl+Enter to a local fixture. It checks one Send click, blocked response scrolling,
manual upward movement during generation, completion refocus and scrolling, then
explicit latest navigation. No real chat or API request is sent.

Validation: 24/26 offline Chrome cases pass; the same two existing mobile fixture
failures documented in 1.8.2 remain. Syntax, keyboard contracts, beta metadata,
installation index and diff checks pass. Live site verification remains pending.
