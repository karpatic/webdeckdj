# Beat Lab — Degara vs music-tempo, standalone review

**Preview:** http://127.0.0.1:8876/music/experiments/beat-lab/index.html

The existing loopback preview serves this directory directly. Refresh the experiment yourself when ready; this update does not reload your open experiment or DJ playback tabs. No build step, account, CDN runtime dependency or installation is needed.

## Compare and audition

1. Choose local audio independently for A and B, or **Load existing tutorial into A**. The tutorial button only reads `../../examples/dj-tutorial/01-start-here-find-the-beat.mp3`; it does not copy, play or analyze it automatically.
2. Leave **Degara** selected (default), choose the first **30/60/90 seconds**, then **Analyze**. Full-length mono/stereo songs are accepted; only the selected prefix is analyzed, while the full decoded track remains playable. Long files consume more decoding memory.
3. On that **same track/file and unchanged window**, choose **music-tempo · BeatRoot JS** and Analyze again. Both engines receive the identical prefix from the cached decoded audio. A/B tracks are independent; results from unrelated files are not head-to-head evidence.
4. Open **Comparison history / switch beat map for this file**. Each of the last eight completed runs retains the actual BPM/tick array, engine, exact sample window, compute, worker, startup/library-init and total timings. Only opposite-engine runs for the same sample window are labeled comparable. Replacing the file clears all results/history.
5. Click **Use this beat map** to select either completed result without reanalysis. Metrics, timeline, clicks and sync use that selected result; **Next analysis engine** only controls a future run. Selection restores original detected ticks and clears manual BPM/offset, but leaves audio position and playback rate unchanged. Enable **Beat-click overlay** and listen. The timeline/clicks cover only the analyzed prefix; playback can continue beyond it.
6. Blank Manual BPM preserves actual nonuniform beat estimates. Manual BPM / half-double creates a uniform grid anchored at the first detected tick. Offset shifts either grid without moving audio. **Use detected ticks** clears these corrections.
7. For the existing B→A sync, analyze both tracks, start A, then **Match tempo + start B on A’s next beat**. B jumps to its next measured/corrected tick, scheduled at A’s next tick on the same AudioContext clock; its rate is A effective BPM × A rate / B effective BPM (0.5–2×). This remains one-shot alignment: no continuous lock, downbeat recognition, drift correction or pitch-preserving stretch. A switched grid does not silently reset the rate; align again or **Reset B rate to 1×** as needed.
8. **Stop all / cancel** silences this experiment and cancels its analysis, never the main DJ. No state persists, no uploads, library/IndexedDB access or autoplay.

## Implementation and measurement

- Only **Essentia.js 0.1.3 Degara** and **music-tempo 1.0.3** are enabled. Exact npm archive integrity was checked; unmodified vendored builds and licenses/provenance are in [vendor/SOURCES.md](vendor/SOURCES.md).
- `OfflineAudioContext(..., 44100).decodeAudioData` decodes/resamples the full file at **44,100 Hz**. Only the selected prefix is copied/transferred to a disposable worker. The shared worker path averages stereo into Float32 `(L + R) / 2` before calling either engine. Mono passes through unchanged. No main-thread beat analysis.
- The worker imports **only its selected engine**. Degara calls `RhythmExtractor2013(signal, 208, 'degara', 40)` and copies ticks before deleting every WASM result/input vector and shutting down. music-tempo calls `new MusicTempo(mono, params)`; pinned implementation uses `hopSize: 441` and `timeStep: 0.01`, not an automatic sample-rate argument. Explicit induction intervals `60 / 208` through `60 / 40` match Degara's configured 40–208 BPM range (music-tempo's upstream defaults are 60–200); other defaults remain unchanged. No requested/target BPM is supplied.
- music-tempo returns `tempo` as a three-decimal string; the page converts it to a number and retains its actual `beats` array. Upstream `fillBeats()` interpolates missing beats. Neither engine provides meaningful calibrated confidence here: **unavailable**, never an invented probability or ranking.
- **Compute** is the API call (including music-tempo's internal Float32-to-Array conversion). **Worker** also includes shared downmix and input/output conversion. **Startup** measures Worker construction to its ready message; **library init** is imports plus engine construction inside that worker. **Total** includes file read/decode when necessary, prefix copying, startup, transfer and analysis. Reused decoding is labeled; do not compare first-run total against a reused-decode total as engine compute performance. JS timing and WASM timing are not accuracy measures.
- At most one decode/analysis job; <=2 decoded channels; first <=90 seconds sent to the worker; 120-second analysis watchdog. **No application file-duration or encoded-size cap.** Full-track decoding can consume substantial memory and is not an OS sandbox.
- Cancel/replacement terminates either synchronous worker. Native reads/decode cannot be interrupted: their stale result is discarded and the single-job slot remains occupied until they settle. Worker callbacks are guarded by job identity, cancellation and file generation. Leaving the page stops sources, workers and metadata readers.
- Playback, seeking, clicks and one-shot sync retain their existing implementation. A pending sync now also checks that its selected results did not change during audio-context resume. Clicks are cancelled when switching maps. Hidden tabs suppress clicks; scheduling/throttling limitations remain.
- Vanilla HTML/CSS/classic JS; no main-app imports or redesign. The existing CSP allows `unsafe-eval` for the old Emscripten bindings; no inline/external runtime scripts or models.

## Observed real execution — not accuracy ground truth

The **actual shipped `analysis-worker.js` and vendored browser builds** ran in Node `worker_threads` + `vm`, using identical stereo PCM decoded with ffmpeg from the first **60 seconds** of the existing tutorial MP3. Shared downmix yields exactly **2,646,000 mono Float32 samples at 44,100 Hz**. No source audio was edited or copied into the experiment.

| Engine | Actual BPM | Ticks | First tick (s) | Compute (s) | Startup (ms) | Library init (ms) |
|---|---:|---:|---:|---:|---:|---:|
| Essentia Degara | 120.10591125488281 | 120 | 0.39473921060562134 | 1.272 | 175.039 | 115.150 |
| music-tempo 1.0.3 | 119.994 | 114 | 3.1 | 4.433 | 105.934 | 3.583 |

Degara was faster in this single Node compute observation. **That does not establish a more accurate beat map or a universal winner.** Similar tempos coexist with different phases and opening coverage; neither the tutorial filename nor any requested generation BPM is ground truth. Audition the actual ticks, then try representative music. These timings are not Chrome/browser benchmarks.

Both live workers were terminated during computation after a 100 ms delay, with **no result received**: Degara termination **12.151 ms**, music-tempo **8.265 ms**. Both correctly rejected 48 kHz input. All probe workers exited/terminated; no probe audio was played.

Evidence outside the shipped directory:
- `/tmp/beat-lab-two-engine-results.json` — complete outputs/all ticks, input hashes, timing, termination and rejection evidence.
- `/tmp/beat-lab-two-engine-probe.cjs` — direct-runtime adapter (not a test suite or browser substitute).
- `/tmp/beat-lab-two-engine-http-proof.json` — served-file status/hash parity.
- `/tmp/beat-lab-music-tempo-result.md` — change/verification handoff.

## Verdict: PARTIAL — two real engines validated; updated browser audition pending

Carlos reports the existing playback/sync works well; those paths were preserved. This update was **not** rendered or auditioned through the browser. The existing experiment and DJ tabs are protected active-review/playback surfaces. There is no separately approved scratch target; the manager already rejected page creation (`page_creation_command_rejected`). No retry, bypass, alternate browser, navigation/reload, resize or media replacement was attempted. No browser lease was acquired by this update.

Direct Node execution and HTTP byte parity do not prove Chrome Worker startup/CSP, native file decoding, DOM history selection, canvas, click audibility or sync timing. Carlos can refresh the experiment himself and compare. No automated suite or fake DOM was used.

## Licenses / integration boundary

music-tempo is **MIT**, with the complete [copyright/license notice](vendor/MUSIC-TEMPO-LICENSE.txt). Essentia and this experiment's authored source are **AGPL-3.0-or-later**, with full text in [vendor/LICENSE](vendor/LICENSE). Preserve upstream notices and review complete corresponding-source, linked-dependency and network-use obligations before public distribution or main-DJ integration. A source link is not a complete independently rebuilt corresponding-source bundle; transitive binary composition/reproducibility was not audited here.

No pretrained model is used. Essentia model weights carry separate licenses; library licensing does not grant model rights. No public-distribution clearance, deployment, Git operation, editor/SFTP save, account access or change outside this standalone experiment was made. Integration remains a separate user decision after listening review.
