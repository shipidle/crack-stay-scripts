# Scroll Guard 1.8.2 — desktop reply position

Based on beta 49e126f, preserving its mobile, model, panel and navigation behavior.
The earlier local 1.1.0 implementation is not included in this release.

On a fine-pointer desktop, Enter in the Crack composer or clicking Send records
the chat position before reply generation. Protection applies even at the bottom
and with the composer focused, without first scrolling upwards. A direct downward
scroll call is blocked; a cached/native downward jump is restored by the existing
position checker. Native manual scrolling updates the held position.

Initial room entry remains unlocked. Explicit top/bottom navigation and route
changes clear the hold. Shift+Enter and IME composition do not activate it.
Mobile keyboard/touch behavior is unchanged. This does not add a regeneration
button trigger or promise text anchoring if content above the viewport is removed.

## Validation (2026-10-23)

- Node syntax, beta metadata and generated installation index checks pass.
- Offline Chrome 155.0.8059.86: 21/23 cases pass.
- New desktop Enter and Send cases fail on baseline and pass on 1.8.2.
- Initial entry, explicit latest button (also after desktop hold), route reset,
  actual Chromium touch swipe and existing gesture regressions pass.
- Two pre-existing failures reproduce on both baseline and candidate:
  `manual bottom restores follow` (expected 7520, observed 1200) and
  `completion focus retains position` (expected 1200, observed 7440).
- The test window proxy now binds matchMedia, as it already does other native
  window methods. No live chat message or AI request was sent by these tests.
- Actual Chrome/Tampermonkey and iPhone/Stay integration remain unverified.
