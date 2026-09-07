# Original beat detector — frozen posterity copy

Archive URL: `http://127.0.0.1:8876/music/posterity/beat-detector/index.html`

This directory preserves the DJ application immediately before the main Degara integration. The authored `js/components/*.jsx`, `js/utils/*.js`, `dj-faders.css`, Bundless runtime, example audio, and project `LICENSE` are byte copies of the originals. `source/dj.html` and `source/index.html` are exact entry-page snapshots. `index.html` is the independently runnable archive entry: it changes dependency paths to local files, adds archive metadata, and omits only the unrelated Cloudflare telemetry beacon and navigation outside the archived DJ.

The preserved detector is the author's original realtime energy-threshold algorithm, including sensitivity/manual BPM control, beat feedback, realtime time-domain waveform, transformed spectrum/energy visuals, track waveforms, audio loading, crate, FX, mixer, transport, cue, loop, pitch, EQ, and playback behavior. Nothing here imports mutable main-app files; deletion or replacement of the main detector will not break this copy.

Created for posterity: `index.html`, this README, `MANIFEST.sha256`, `SOURCE-HASHES.sha256`, exact source/runtime/example copies, and frozen third-party files under `vendor/`. `MANIFEST.sha256` covers every archive payload file except itself; `SOURCE-HASHES.sha256` records the byte-preserved originals. See `vendor/SOURCES.md` and `vendor/licenses/` for versions, provenance, hashes, and retained notices.

Main integration files changed after this snapshot: `dj.html`, `dj-faders.css`, `js/components/butter.jsx`, `deck.jsx`, `detect.jsx`, `dj.jsx`, `eq.jsx`, and `mixer.jsx`; new main-only files live under `js/beat/` and `vendor/essentia-0.1.3/`. Root `index.html`, crate persistence, audio/visual utilities, and this archived authored graph were not overwritten.

Licensing note: this archive is local-only preservation, not redistribution clearance. The project remains under its included MIT license; bundled third-party works remain under their own retained notices. Review all applicable rights before publishing the archive.
