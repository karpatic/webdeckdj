ln -s /path/to/GitHub/bundless/dist/bundless.acorn.dev.js /path/to/GitHub/www/music/js/bundless.acorn.dev.js


https://carlos-a-diez.com/music/

http://localhost:3000/



Frequency Analysis: The core visualization is based on FFT (Fast Fourier Transform) data from the Web Audio API's

ln -s /path/to/GitHub/bundless/dist/bundless.acorn.min.js /path/to/GitHub/www/music/bundless.acorn.min.js
ln -s /path/to/GitHub/bundless/dist/bundless.acorn.dev.js /path/to/GitHub/www/music/bundless.acorn.dev.js


import from '' -> does not work..

## Install and navigate

Author: Codex app agent — 2026-09-14

Open https://karpatic.github.io/webdeckdj/ and use your browser's Install app or
Add to Home Screen action. Launch the installed icon for a standalone window
without the browser address/navigation bar. Ordinary tabs keep their browser
chrome. Installation options depend on browser support; the manifest uses
[standalone display](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/display).
An internet connection is still needed; no offline service worker is installed.

Successful track selection for either deck returns to the top. Directory returns
to the crate browser. GUI, mobile load actions, and Numark MIDI use the same
handlers; reduced-motion preferences disable animated scrolling. Phone safe-area
insets protect controls without increasing ordinary compact-layout spacing.

Focused checks: `node --test tests/*.test.mjs`. Browser navigation checks:
`PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/install-navigation.browser.mjs`
with a local server on port 8879, or set `TEST_URL` to the deployed page. These
checks use an isolated browser and synthetic MIDI and never start playback.
