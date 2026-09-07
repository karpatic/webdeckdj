# Dependency sources and notices

## Essentia.js 0.1.3 — vendored, unmodified

Author: Music Technology Group, Universitat Pompeu Fabra (see `AUTHORS.md`). Library copyright notices remain inside each JS file. License: npm `AGPL-3.0`; source headers specify AGPL version 3 or later. Full upstream license: [`LICENSE`](LICENSE).

- Official repository: https://github.com/MTG/essentia.js
- Exact npm tarball: https://registry.npmjs.org/essentia.js/-/essentia.js-0.1.3.tgz
- npm release `gitHead`: **f46c91c08bdf263d5f3d575ab8fb0f9b81695acf**
- Source at that commit: https://github.com/MTG/essentia.js/tree/f46c91c08bdf263d5f3d575ab8fb0f9b81695acf
- Source archive: https://github.com/MTG/essentia.js/archive/f46c91c08bdf263d5f3d575ab8fb0f9b81695acf.tar.gz
- Build recipe: https://github.com/MTG/essentia.js/blob/f46c91c08bdf263d5f3d575ab8fb0f9b81695acf/Makefile.essentiajs (synchronous SINGLE_FILE=1, BINARYEN_ASYNC_COMPILATION=0, ALLOW_MEMORY_GROWTH=1; Emscripten, Essentia static library and Eigen required).
- Core C++ source: https://github.com/MTG/essentia
- The exact underlying Essentia C++ revision/transitive binary composition and a byte-for-byte rebuild were not verified. These links/provenance are not a claim that a complete corresponding-source distribution has been assembled.

Archive SHA-512 integrity, verified before extracting:
`sha512-vVEPgeVMEBLRXbM5o5H5Rgu53EPHu25vyFKYg+flWLzI/nEoegJQez9FKRv8GR/KxIBwm+fXDEFL+MkQeoHaLw==`

Copied only these archive entries (no runtime CDN):
- `dist/essentia-wasm.umd.js` → `essentia-wasm.umd.js` (contains embedded real WASM)
  - SHA-256 `7e0a2b5507199e8162c4ed090d38518de0c7faa070ce35d1593e7631b201014d`
- `dist/essentia.js-core.umd.js` → `essentia.js-core.umd.js`
  - SHA-256 `e3958a89ca0d3e1f95f67de627a383cdbbd8058f24fd53c6749758ff78b5e337`
- `LICENSE`, `AUTHORS.md`

The core JS includes Microsoft TypeScript helper code with an Apache-2.0 notice; that notice is retained. `APACHE-2.0.txt` was retrieved from https://www.apache.org/licenses/LICENSE-2.0.txt . Other linked library notices/rights require review before distribution; this experiment does not claim a completed transitive license audit.

## API / preprocessing sources

- https://mtg.github.io/essentia.js/docs/api/Essentia.html
- https://essentia.upf.edu/reference/std_RhythmExtractor2013.html — requires mono audio at 44100 Hz; this experiment calls `degara`, ticks in seconds, BPM (ignore Degara's placeholder confidence zero).
- https://essentia.upf.edu/reference/std_BeatTrackerDegara.html
- The exact vendored core source is used to verify argument order and vector return types. Empty vectors must be checked before `vectorToArray`; all vectors must be deleted after copying.

## Licensing boundary

- Official licensing: https://essentia.upf.edu/licensing_information.html
- AGPL obligations, including complete corresponding source where applicable, remain relevant on redistribution/network use. A private spike is not blanket permission to publish the binary or combine it with an incompatible app. Obtain a proper licensing review before publishing/integrating.
- No pretrained model or TensorFlow package is included. Model weights have separate licenses; the official licensing page describes CC BY-NC-ND 4.0 and proprietary options. No inference/model rights are implied here.
- New Beat Lab authored source (`index.html`, `style.css`, `app.js`, `analysis-worker.js`, documentation): AGPL-3.0-or-later, same full license in `LICENSE`; no warranty. This notice does not change the existing DJ application's license.

## music-tempo 1.0.3 — vendored, unmodified browser build

Copyright (c) 2017 killercrush. MIT license, retained verbatim in [`MUSIC-TEMPO-LICENSE.txt`](MUSIC-TEMPO-LICENSE.txt). Upstream describes this as a JavaScript implementation of Simon Dixon's BeatRoot algorithm. This library's MIT license does not replace Essentia/experiment AGPL obligations.

- Official repository: https://github.com/killercrush/music-tempo
- Registry metadata: https://registry.npmjs.org/music-tempo
- Exact archive: https://registry.npmjs.org/music-tempo/-/music-tempo-1.0.3.tgz
- npm release `gitHead`: **80c12cc4ea8c8ae35ac9f7fd0d2479628f545295**
- Pinned source: https://github.com/killercrush/music-tempo/tree/80c12cc4ea8c8ae35ac9f7fd0d2479628f545295
- Build recipe: `gulpfile.js` at that commit; Babel transpiles six source modules, concatenates the browser build, then Uglify minifies it. The published build was downloaded, not locally rebuilt.

Archive SHA-512 integrity verified against registry metadata before extraction:
`sha512-qAocTKLp3jaSeJLeGs98mkkpLYDFM1VCevA1OPFJvLPkHlzwTLUxChXMgnxZRHKSJQ13DuaT+Fr51BEUb2D4pQ==`

Copied only:
- `dist/browser/music-tempo.min.js` → `music-tempo-1.0.3.min.js`
  - SHA-256 `2927859a8e81e8874a95dc7af3a2a06fedd306826f774b7378e26ad5fa9cbd76`
- `LICENCE` → `MUSIC-TEMPO-LICENSE.txt`
  - SHA-256 `12b4e069f64ae9a2660c1f5fe788e548487ec8385960bda0a0bfe177c95348cf`

### Exact implementation contract inspected

- `src/MusicTempo.js` from the official pinned GitHub commit matches the npm source after CRLF/LF normalization. The published unminified browser build was also inspected.
- `OnsetDetection.calculateSF` uses `hopSize = 441`, `bufferSize = 2048`; `MusicTempo` uses `timeStep = 0.01` and converts onset frame indices to seconds with `index * timeStep`. It does **not** automatically use an AudioBuffer sample rate. Beat Lab decodes at 44,100 Hz and explicitly passes `hopSize: 441, timeStep: 441 / 44100`.
- Both engines use the same worker-side `(L + R) / 2` Float32 mono prefix, no engine-specific resampling or normalization before their respective APIs.
- music-tempo defaults to induction intervals 0.3–1 seconds. Beat Lab explicitly sets `minBeatInterval: 60 / 208, maxBeatInterval: 60 / 40` to match Degara's configured 40–208 BPM induction range; other settings remain upstream defaults. This is not an output clamp or target-tempo hint.
- `new MusicTempo(mono, params)` performs onset extraction, tempo induction and agent tracking synchronously in its disposable worker. `tempo` is actually a string from `.toFixed(3)`; Beat Lab converts it to Number without inventing precision. `beats` are copied unchanged from the winning agent after upstream `fillBeats()` interpolates missing beats. They are algorithmic beat estimates, not manually annotated onsets.
- No calibrated confidence is provided. Agent scores are not presented as confidence, probability or an accuracy rank. No additional library/model/CDN request is needed at runtime.
