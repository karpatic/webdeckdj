# Outer loop layout verification

Author: Codex app agent — 2026-09-14

Loop controls retain their IDs, state owners, callbacks, and disabled conditions;
Deck passes them through EQ into mirrored outer grid columns. The shared loop
row is removed. The live waveform/spectrum strip retains its size and rendering
and moves above the controls; its ancestor no longer adds a trailing margin.
Bootstrap row margins are overridden with sufficient specificity.

Below 576 px, scroll previews share the overview row so the outer loops fit
without reducing rotary controls (44 px minimum) or the existing fader inputs.
At 320 px some loop button labels wrap. Both decks remain side by side.
MIDI connect/status/error ownership below the crate is unchanged.

## Measured geometry

Isolated headless Chromium, CSS pixels, unloaded decks, default settings.
“Controls” means the bottom of `.eq-controls`; transport includes its border.
The controls-to-crossfader distance includes Play/Cue rows on portrait phones,
so it is not all empty space.

| Viewport | Controls → transport, before → after | Controls → crossfader input, before → after | Horizontal overflow, before → after |
| --- | --- | --- | --- |
| 320 × 568 | 49 → 1 | 231.58 → 95.97 | 7 → 0 |
| 393 × 852 | 49 → 1 | 199.58 → 95.97 | 7 → 0 |
| 852 × 393 | 49 → 1 | 109.61 → 6 | 7 → 0 |
| 1440 × 900 | 97 → 1 | 169.61 → 10 | 0 → 0 |

## Checks

- `node --test tests/*.test.mjs`: 15 passing tests.
- Extended `tests/install-navigation.browser.mjs`: six responsive widths
  (320, 393, 576, 852, 1024, 1440); mirrored outer loop bounds; no overflow;
  no trailing deck reservation; minimum knob dimensions; MIDI status below crate.
- Browser checks also cover loop in/out/exit and 4/8/16 length cycling on both
  loaded, paused decks; existing synthetic MIDI/GUI loading and navigation,
  reduced motion, installability, failed loads, and no autoplay checks pass.
- Screenshots visually inspected at 320, 393, 852, and 1440 px widths.

These checks do not establish physical MIDI hardware operation, audible output,
or real-device Safari/touch behavior. No user tab or stored music was used.
