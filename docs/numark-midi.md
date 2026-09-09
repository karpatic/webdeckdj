# Numark Total Control — input-only integration

## Delivery boundary

`js/midi/numark-total-control.mjs` is executable native JavaScript with no dependencies, MIDI output, SysEx, storage, DOM mutation, or audio calls. It is wired through the native `window.webDeckMidiReady` bridge in `dj.html` to Mixer semantic actions. Importing/constructing the adapter does not request permission or acquire a port.

## Mapping provenance

Historical source paths below are relative to the local GitHub workspace root.

- `pages/webmidi/controllers/numark-total-control.js:25–42` supplies the original nine inputs, explicitly labelled “minimal useful mapping.” Device matching comes from lines 12–14.
- `pages/webmidi/ui.js:51–60` masks status with `0xf0`; Note On requires positive velocity and CC is `0xb0`. The adapter follows this channel-independent decoding. Release tracking uses the original MIDI channel, not a guessed fixed channel.
- `www/musicfs/midi.html:85–140` independently contains the same six notes and three CCs in the previous inline audio demo. That earlier demo used exactly `0x90`/`0xb0`; the current visualizer generalizes to status families. Its debounce and direct audio handling are **not** copied.
- `www/musicmidi/Numark-Total-Control-scripts.js` is a fuller Mixxx-style **behavior script**, but not a fuller input-number mapping. Its lines 14–20 define **LED/output** numbers (including play `0x3e`/`0x4e`), and lines 52–58 send MIDI output. They must not be mistaken for button input notes. Jog code at 114–144 discusses two's-complement motion but supplies no incoming jog CC assignment; its Mixxx engine scaling is not transplanted into this app.
- EQ, Loop In/Out, and pitch-bend button assignments were fetched and verified from [Mixxx's Numark Total Control input XML](https://raw.githubusercontent.com/mixxxdj/mixxx/main/res/controllers/Numark%20Total%20Control.midi.xml). Fetched XML SHA-256: `be7294d8711be9f935ccbf61f06890cb18efbc3f6c0564850b72c3c97f1df173`. Only `controls/control` rows were parsed, never `outputs/output`. High maps to Treble; Low maps to Bass. The XML binds A −/+ to input Notes `0x41/0x42` and B −/+ to `0x45/0x46`; the accompanying official script names their momentary Mixxx behavior `rate_temp_down/up`. This app intentionally gives those physical buttons the requested persistent ±0.1 percentage-point behavior. Only assignment facts are recorded: no external behavior code or Mixxx gain scaling is copied. This is not a full hardware map or physical-unit acceptance claim.
- Physical FX labels and placements were verified against [Numark's official Total Control MIDI Map](https://www.numark.com/images/product_downloads/totalcontrol_midimap.pdf), linked by the manufacturer's product page. Fetched PDF SHA-256: `8c10fd1a4fc10d3a22ef88e93c3d530316aef1d1f39734bd43d7e8c3b95db468`. Its input diagram identifies the knob CCs and the notes physically beneath them; the compatible Mixxx `controls/control` rows independently contain the same message numbers. No output/LED row was used.
- The same official diagram places CC 3 / Note 58 on the left Fine Pitch/Tap control and CC 7 / Note 62 on the right. Mixxx's input-only `controls/control` rows independently name those inputs `finePitch` and `tap`. Its accompanying script confirms Fine Pitch is two's-complement relative (`1…63` positive, `64…127` negative, `0` stationary). Note 62 (`0x3e`) also appears in a separate LED/output table in that script; the Samples2 trigger is based on the input row and manufacturer diagram, not that output assignment.
- The manufacturer diagram places the Deck A/left jog at CC 25 (`0x19`) and Deck B/right jog at CC 24 (`0x18`). Mixxx's input-only XML binds those exact CCs with status `0xb0` to `NumarkTotalControl.jogWheel` for Channel1/Channel2. [Mixxx's accompanying script](https://raw.githubusercontent.com/mixxxdj/mixxx/main/res/controllers/Numark-Total-Control-scripts.js) documents the device values as counter-clockwise fast/slow `64/127`, clockwise slow/fast `1/63`, and decodes values greater than 63 by subtracting 128. Thus jog decoding is independently sourced and is not inferred from WebDeckDJ's captured FX encoder bytes. The hardware sends channel-one CC status `0xB0`; the adapter retains its pre-existing channel-family policy and accepts `0xB0…0xBF`.

| Physical mapping label | Message number (decimal) | Semantic action |
| --- | --- | --- |
| A Play | Note 67 | `{ type: 'play', deck: 'left' }` |
| A Cue | Note 51 | `{ type: 'cue', deck: 'left' }` |
| A Set Cue | Note 59 | `{ type: 'setcue', deck: 'left' }` |
| B Play | Note 76 | `{ type: 'play', deck: 'right' }` |
| B Cue | Note 60 | `{ type: 'cue', deck: 'right' }` |
| B Set Cue | Note 68 | `{ type: 'setcue', deck: 'right' }` |
| A Volume | CC 8 | `{ type: 'volume', deck: 'left', value }` |
| B Volume | CC 9 | `{ type: 'volume', deck: 'right', value }` |
| Crossfader | CC 10 | `{ type: 'crossfader', value }` |
| A Treble / Mid / Bass | CC 16 / 18 / 20 (`0x10/12/14`) | `{ type: 'eqvalue', deck: 'left', band, value }` |
| B Treble / Mid / Bass | CC 17 / 19 / 21 (`0x11/13/15`) | `{ type: 'eqvalue', deck: 'right', band, value }` |
| A Treble / Mid / Bass kill | Note 80 / 85 / 83 (`0x50/55/53`) | `{ type: 'eqkill', deck: 'left', band }` |
| B Treble / Mid / Bass kill | Note 82 / 81 / 84 (`0x52/51/54`) | `{ type: 'eqkill', deck: 'right', band }` |
| A Loop In / Out | Note 73 / 74 (`0x49/4a`) | `{ type: 'loopIn' / 'loopOut', deck: 'left' }` |
| B Loop In / Out | Note 77 / 78 (`0x4d/4e`) | `{ type: 'loopIn' / 'loopOut', deck: 'right' }` |
| A / B Gain knobs | CC 13 / 14 (`0x0d/0x0e`) | `{ type: 'pitch', deck, value }` mapped to −8…+8% with 63/64 centered at 0 |
| A / B jog wheels | CC 25 / 24 (`0x19/0x18`) relative | `{ type: 'jog', deck, delta }`; `1…63` clockwise/positive, `64…127` counter-clockwise/negative, `0` stationary |
| A pitch-bend − / + | Note 65 / 66 (`0x41/0x42`) | `{ type: 'pitchStep', deck: 'left', delta: -0.1 / 0.1 }` |
| B pitch-bend − / + | Note 69 / 70 (`0x45/0x46`) | `{ type: 'pitchStep', deck: 'right', delta: -0.1 / 0.1 }` |
| A / B Fine Pitch knobs | CC 3 / 7 (`0x03/0x07`) relative | `{ type: 'sampleMove', channel: 0 / 1, delta }` selects Samples1 / Samples2 |
| A / B Tap buttons | Note 58 / 62 (`0x3a/0x3e`) | `{ type: 'sampleTrigger', channel: 0 / 1 }` restarts Samples1 / Samples2 |
| A / B FX Amt | CC 0 / 4 (`0x00/0x04`) relative | `{ type: 'fxvalue', deck, slot: 0, delta }` |
| A / B Select beneath FX Amt | Note 49 / 53 (`0x31/0x35`) | `{ type: 'fxmode', deck, slot: 0 }` |
| A / B Filter Amt | CC 1 / 5 (`0x01/0x05`) relative | `{ type: 'fxvalue', deck, slot: 1, delta }` |
| A / B Filter On/Off beneath Filter Amt | Note 50 / 54 (`0x32/0x36`) | `{ type: 'fxmode', deck, slot: 1 }` |
| Browse encoder | CC 26 (`0x1a`) relative | `{ type: 'browse-move', delta }` |
| Directory / Browse press | Note 72 / 79 (`0x48/0x4f`) | `{ type: 'browse-directory' }` / `{ type: 'browse-enter' }` |
| A / B Load | Note 75 / 52 (`0x4b/0x34`) | `{ type: 'load-track', deck }`, without starting playback |

Fader CC `value` is clamped to 0…127 then divided by 127 (0…1); crossfader alone is inverted (`1 - normalized`) to preserve the verified hardware direction. Mixer converts faders to the UI's 0…100 range. EQ CC `value` is already dB: 0 → −10, 63/64 → 0, 127 → +10, piecewise-linear about the center and rounded to the existing 0.5 dB step. Gain CCs use the existing pitch range and leave physical pitch sliders unmapped. Pitch-bend button presses adjust the same pitch owner by exactly 0.1 percentage points, clamp at ±8%, and therefore immediately update media playback rate, displayed BPM, and later Sync calculations. Fine Pitch knobs move their sample selection by signed relative steps without playing; successive equal steps are not deduplicated. Tap buttons trigger/restart only their respective sample channel, with held Note On suppression and release re-arming. FX Amt and Filter Amt on CC 0/1/4/5 use signed two's-complement relative steps: 1…63 increase, 64…127 decode as `value - 128`, and 0 does not move. This boundary is confirmed by physical CC 0 capture: repeated 1s plus an accelerated 2 clockwise, then repeated 127s plus an accelerated 126 counterclockwise. Every relative FX message is dispatched, including identical consecutive bytes. The owning `FxKnob` adds the delta to the current mode's value, clamping effect selection to 0…5 and strength to 0…100%; turning farther into an effect-selection end stop preserves the current strength. Each button beneath those knobs invokes that slot's same mode-toggle callback as click/Enter/Space; neither button is a bypass. All FX stay in their deck's serial rack. Relative browse turns are dispatched even when consecutive messages have the same byte value. Browse actions operate the two-column crate; loading never starts playback. `band` is `treble`, `mid`, or `bass` respectively. Mixer routes EQ and FX through narrow Deck callbacks to the same React owners used by their mouse controls. Killed bands keep −40 dB effective gain while rotation updates the retained selection; unkill restores it. Loop actions call the existing ready-guarded `transportAction(deck, 'in'/'out')`: In captures a fresh start; Out captures a later end and enables the loop, or exits an already-active loop, exactly like the screen buttons. Note Off and zero-velocity Note On only clear held state; neither invokes an app action. Repeated Note On while held and unchanged decoded absolute CC values are suppressed. A new valid release/press remains a new action; no arbitrary timing debounce is imposed.

Jog messages are also never absolute-deduplicated, so repeated equal steps reach the owning deck. While playing, each signed unit adds `0.0015` to a temporary rate offset, bounded to ±`0.04`; another step refreshes the `150 ms` idle deadline. The stored pitch is unchanged, and idle restores the latest pitch/Sync base rather than the value present when jogging began. While paused or ended, each signed unit seeks `0.02 s`, clamped to finite media duration, without calling play. That seek is intentional: existing seek listeners cancel scheduled Sync and an active loop exits only if the seek lands outside it. Playing jog never writes `currentTime`. Pause, ended, track replacement, MIDI disconnect, and component teardown clear the timer/offset; track identity and audio-element checks prevent a stale timeout from modifying a replacement track. Native `ratechange` still reschedules loop deadlines and forces effective-BPM/beat-FX recomputation, but a temporary jog rate does not overwrite stored pitch.

## Adapter contract

### Browse / Gain provenance and acceptance boundary

The XML above was freshly retrieved during implementation closeout with the same SHA-256.
Its input rows name CC13/14 `pregain`, CC26 `NumarkTotalControl.selectKnob`, Note72
`NumarkTotalControl.toggleDirectoryMode`, and Note75/52 `LoadSelectedTrack` for Channel1/2.
The app deliberately maps Gain to its existing ±8% pitch state, not gain.

Numark's official diagram identifies the physical FX Amt / Filter Amt knobs as CC0/1 for
Deck A and CC4/5 for Deck B. The buttons immediately beneath them are Notes49/50 and
Notes53/54 respectively. Mixxx independently assigns all eight numbers as inputs: its rows
commented `Select` use Notes49/53, its rows commented `Filter On/Off` use Notes50/54, and
its flanger parameter section includes CC0/1/4/5. The XML's historical Mixxx behavior is
not copied; only the input assignments feed WebDeckDJ FX slots 1/2. This remains
manufacturer/source-level evidence, not a packet capture from Carlos's particular unit.

Numark's official MIDI diagram places Note79 and CC26 together on the center TRACK encoder;
its legend identifies the paired values as the knob's MIDI CC and press Note. This app maps
that source-verified physical press to folder-enter rather than copying Mixxx's historical
`LoadSelectedIntoFirstStopped` behavior. No physical packet capture or attached-hardware
acceptance was performed.

[Mixxx's accompanying script](https://raw.githubusercontent.com/mixxxdj/mixxx/main/res/controllers/Numark-Total-Control-scripts.js)
was also retrieved, SHA-256 `1630779e5dfd5cc6f00233633987928f8f3929f761932aa70b97405618deca59`.
`selectKnob` subtracts 128 when the incoming value exceeds 63. The adapter preserves those
signed relative values, ignores zero, and never deduplicates successive equal browse steps.
Crate wraparound uses staged arithmetic because this shipped JSX compiler drops grouping
parentheses in arithmetic expressions. Folder changes use functional state updates.

The same signed decoding is used for Fine Pitch CC3/7 and repeated equal steps are likewise
dispatched. Tap input Notes58/62 replace only the former tempo-tap behavior at the app mapping
boundary; WebDeckDJ had no separate tap-tempo owner to retain. Par On/Off is not mapped to
Samples. The two channels share one imported sample array/storage path but have separate
selection state, audio elements, object URLs, restart tokens, errors, and cleanup lifecycles.

The shared Help/MIDI corner owns only presentation; Mixer owns the single inert adapter.
Disconnect stays available with an adapter, including pending permission, pending open,
no-controller and unplugged states. It invalidates late continuations and removes the
hotplug subscription. Only a fresh user Connect action may acquire access again.

Current local closeout evidence lives in `/tmp/dj-audit-implementation-result.md`.
The historical verification below describes its original task, not current device state.

```js
import { createTotalControlMidi } from './js/midi/numark-total-control.mjs';
const midi = createTotalControlMidi({
  onAction(action) { /* call the CURRENT owning UI action */ },
  onStatus(status) { /* render status.message with role=status */ }
});
// Directly from a user click, not a mount effect or after awaited module loading:
button.onclick = () => midi.connect();
// If several matching inputs exist, use one of status.inputs[].id:
// another explicit click -> midi.connect({ inputId: chosenId });
// Refresh callbacks after component updates, rather than reconnecting:
midi.setCallbacks({ onAction: currentActionHandler, onStatus: currentStatusHandler });
// Explicit opt-out, keeping the object reusable:
midi.disconnect();
// Component teardown, including while permission/open is pending:
midi.destroy();
```

`connect()` resolves after permission and selection have been processed; **use `onStatus` to observe the asynchronous input open**, rather than interpreting the returned Promise as proof of a usable device. Status has `{ code, message, input, inputs }`. Codes: `idle`, `requesting`, `connecting`, `connected`, `no-controller`, `choose-controller`, `insecure`, `unsupported`, `gesture-required`, `denied`, `error`, `action-error`, `destroyed`. There is no raw-message diagnostics UI.

Only a matching **input** is opened; MIDI outputs are never even enumerated. A single match is selected automatically after consent. Multiple matches fail closed until `connect({inputId})` selects one. The chosen ID is retained while unplugged, so another controller cannot silently take over. If a browser assigns a new ID after replugging, Disconnect then Connect selects afresh. No-controller status keeps the access-level hotplug listener alive until disconnect/destroy. Repeated Connect calls cannot stack listeners. Open/close operations are serialized per port; teardown invalidates permission completion, suppresses pending input-open callbacks, removes our listeners, and closes only our selected input. Use one adapter instance per mounted mixer; do not intentionally share this input with a second adapter in the same page.

Web MIDI API reference checked: <https://www.w3.org/TR/webmidi/>. It defines `requestMIDIAccess`, `sysex`, secure-context exposure, input open/close, and statechange events. The request is exactly `{ sysex: false }`. Browser denial and restrictive Permissions Policy are surfaced, not bypassed. The adapter checks `navigator.userActivation.isActive` where available; callers must still use an actual gesture on browsers without that field.

## Historical handoff — superseded by current implementation

The remaining suggested patches and original verification below describe the earlier adapter-only handoff, not current implementation instructions or current hardware state. The current JSX/HTML owners and mapping above are authoritative; in particular, do not restore the old JSX dynamic import or direct-volume ownership.

The following blocks are a **handoff**, not applied changes. Re-read the main writer's final `js/components/mixer.jsx` before applying. At inspection, it owned `togglePlayPause(deck)`, `transportAction(deck, action)`, `setCrossfader`, both audio refs, `leftTrack`/`rightTrack`, markers, and native media listeners that update playing/progress/seek state. Use those owners; do not click/query DOM controls or call the audio utility directly from the MIDI module.

Inside `Mixer`, before its final `return`, add:

```jsx
  const midiRef = React.useRef(null);
  const midiActionRef = React.useRef(null);
  const [midiStatus, setMidiStatus] = React.useState({ code: 'loading', message: 'Loading MIDI…' });

  React.useLayoutEffect(() => {
    midiActionRef.current = (action) => {
      if (action.type === 'crossfader') {
        setCrossfader(Math.round(action.value * 100));
        return;
      }
      const deck = action.deck;
      const track = deck === 'left' ? leftTrack : rightTrack;
      if (!track) return; // Same disabled-track boundary as the existing UI.
      if (action.type === 'play') togglePlayPause(deck);
      else if (action.type === 'cue' || action.type === 'setcue') transportAction(deck, action.type);
      // Leave volume unassigned unless the optional owner bridge below is added.
    };
  });

  React.useEffect(() => {
    let cancelled = false;
    let midi = null;
    // Native dynamic import: avoid routing this module through the known JSX emitter defects.
    const url = new URL('./js/midi/numark-total-control.mjs', document.baseURI).href;
    import(url).then((module) => {
      if (cancelled) return;
      midi = module.createTotalControlMidi({
        onAction: (action) => { if (midiActionRef.current) midiActionRef.current(action); },
        onStatus: setMidiStatus
      });
      midiRef.current = midi;
      setMidiStatus(midi.getStatus());
    }).catch(() => {
      if (!cancelled) setMidiStatus({ code: 'error', message: 'MIDI module could not load' });
    });
    return () => {
      cancelled = true;
      midiActionRef.current = null;
      midiRef.current = null;
      if (midi) midi.destroy();
    };
  }, []);
```

Put this compact sibling block immediately before the existing shared-transport card (do not insert it into the fixed transport grid or change its CSS):

```jsx
      <div className="d-flex align-items-center gap-2 mb-2">
        <button type="button" className="btn btn-sm btn-outline-light"
          disabled={midiStatus.code === 'loading' || midiStatus.code === 'requesting' || midiStatus.code === 'connecting'}
          onClick={() => {
            if (!midiRef.current) return;
            if (midiStatus.input || midiStatus.code === 'no-controller') midiRef.current.disconnect();
            else midiRef.current.connect();
          }}>
          {midiStatus.input || midiStatus.code === 'no-controller' ? 'Disconnect MIDI' : 'Connect MIDI'}
        </button>
        <small role="status" aria-live="polite">{midiStatus.message}</small>
      </div>
```

Single-controller ownership is the expected case. If needed, a compact conditional native `select` for `midiStatus.inputs` can call `midiRef.current.connect({inputId: event.target.value})` in its user `onChange` handler, with an empty “Choose Total Control” option. Do not auto-select the first of several inputs. Alternatively disconnect competing hardware before retrying; no broad device-selection UI is required for Carlos's one controller.

This path requests permission **only** when Connect is clicked. Cue deliberately uses the app's **return-to-cue and pause** semantics, not the old inline demo's seek-only semantics. Play/pause uses the existing helper and existing native media listeners; crossfader updates React state so the visible fader and gain effect agree. Parent should retain any newer main-writer version of those same actions, including sync/loop integration.

## Optional exact volume owner bridge (CC 8/9)

It is acceptable to ship just the transport/crossfader subset above. To assign the two verified volume controls without audio-only updates:

1. In `Mixer`, add `const midiVolumeRef = React.useRef({ left: null, right: null });`, and pass `midiVolumeRef={midiVolumeRef}` to **both** `Deck` elements.
2. Add `midiVolumeRef` to `Deck`'s destructured props and pass it to its `EQ` element.
3. Add `midiVolumeRef` to `EQ`'s props. After its current `handleVolumeChange` definition add:

```jsx
  React.useLayoutEffect(() => {
    if (!midiVolumeRef) return;
    const key = name === 'A' ? 'left' : 'right';
    const apply = (value01) => handleVolumeChange(Math.round(value01 * 100));
    midiVolumeRef.current[key] = apply;
    return () => {
      if (midiVolumeRef.current[key] === apply) midiVolumeRef.current[key] = null;
    };
  });
```

4. In the `midiActionRef.current` handler, after the track guard, insert a volume branch before Play:

```jsx
      if (action.type === 'volume') {
        const apply = midiVolumeRef.current[deck];
        if (apply) apply(action.value);
      } else if (action.type === 'play') togglePlayPause(deck);
```

Keep the subsequent cue/setcue branch. Do not add a second volume state or mutate `audio.volume` in the adapter.

**Existing gain-path caveat:** at inspection, `EQ.handleVolumeChange` sets `nodesRef.current.gainNode.gain`, while `Mixer`'s crossfader effect also writes the supplied deck gain node. Thus volume and crossfader can overwrite each other's effective gains in the existing UI too. This adapter does not redesign that graph. For the smallest safe integration, leave CC 8/9 unassigned until the main owner chooses to reconcile that pre-existing interaction, or explicitly accept exact existing UI behavior. Do not claim independent multiplicative channel gain unless that graph is fixed and checked.

No soft takeover/pickup is implemented. The first changed mapped CC takes effect immediately; position mismatch may jump. Do not enable faders unexpectedly during active playback. Pickup is a future bounded addition, not an excuse to guess more hardware controls.

## Verification and remaining hardware acceptance

- Direct Node execution uses **explicitly synthetic** message bytes and mock MIDI ports, not attached hardware. No project suite, linter, dependency install, or browser session was run.
- Read-only `lsusb`, `aconnect -l`, and `/proc/asound/cards` did **not** show Numark/Total Control. ALSA listed System, Midi Through, and PipeWire clients; the only sound card was `sof-hda-dsp`. No MIDI connection/subscription was created.
- The new module is served at `http://127.0.0.1:8876/music/js/midi/numark-total-control.mjs`; compare served bytes against the source after any edit.
- Hardware acceptance remains: connect USB, wire this handoff after main-writer completion, let Carlos click Connect and grant browser MIDI permission, then check the supported controls against loaded decks and visible state. Confirm unplug/replug status and selected-device behavior. Mapping source is not proof that this unit emits those messages.
- The active DJ and BeatLab playback pages were not navigated, refreshed, instrumented, or granted permissions. No deployment, main-file modification, crate/database access, Git action, SFTP action, MIDI output, SysEx, or hardware-setting change occurred in this task.
