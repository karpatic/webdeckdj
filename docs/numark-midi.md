# Numark Total Control — input-only integration

## Delivery boundary

`js/midi/numark-total-control.mjs` is executable native JavaScript with no dependencies, MIDI output, SysEx, storage, DOM mutation, or audio calls. It is wired through the native `window.webDeckMidiReady` bridge in `dj.html` to Mixer semantic actions. Importing/constructing the adapter does not request permission or acquire a port.

## Mapping provenance

Historical source paths below are relative to the local GitHub workspace root.

- `pages/webmidi/controllers/numark-total-control.js:25–42` supplies the original nine inputs, explicitly labelled “minimal useful mapping.” Device matching comes from lines 12–14.
- `pages/webmidi/ui.js:51–60` masks status with `0xf0`; Note On requires positive velocity and CC is `0xb0`. The adapter follows this channel-independent decoding. Release tracking uses the original MIDI channel, not a guessed fixed channel.
- `www/musicfs/midi.html:85–140` independently contains the same six notes and three CCs in the previous inline audio demo. That earlier demo used exactly `0x90`/`0xb0`; the current visualizer generalizes to status families. Its debounce and direct audio handling are **not** copied.
- `www/musicmidi/Numark-Total-Control-scripts.js` is a fuller Mixxx-style **behavior script**, but not a fuller input-number mapping. Its lines 14–20 define **LED/output** numbers (including play `0x3e`/`0x4e`), and lines 52–58 send MIDI output. They must not be mistaken for button input notes. Jog code at 114–144 discusses two's-complement motion but supplies no incoming jog CC assignment; its Mixxx engine scaling is not transplanted into this app.
- EQ and Loop In/Out assignments were fetched and verified from [Mixxx's Numark Total Control input XML](https://raw.githubusercontent.com/mixxxdj/mixxx/main/res/controllers/Numark%20Total%20Control.midi.xml). Fetched XML SHA-256: `be7294d8711be9f935ccbf61f06890cb18efbc3f6c0564850b72c3c97f1df173`. Only `controls/control` rows were parsed, never `outputs/output`. High maps to Treble; Low maps to Bass. Only assignment facts are recorded: no external behavior code or Mixxx gain scaling is copied. This is not a full hardware map or physical-unit acceptance claim.

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
| Browse encoder | CC 26 (`0x1a`) relative | `{ type: 'browse-move', delta }` |
| Directory / provisional folder-enter | Note 72 / 79 (`0x48/0x4f`) | `{ type: 'browse-directory' }` / `{ type: 'browse-enter' }` |
| A / B Load | Note 75 / 52 (`0x4b/0x34`) | `{ type: 'load-track', deck }`, without starting playback |

Fader CC `value` is clamped to 0…127 then divided by 127 (0…1); crossfader alone is inverted (`1 - normalized`) to preserve the verified hardware direction. Mixer converts faders to the UI's 0…100 range. EQ CC `value` is already dB: 0 → −10, 63/64 → 0, 127 → +10, piecewise-linear about the center and rounded to the existing 0.5 dB step. Gain CCs use the existing pitch range and leave physical pitch sliders unmapped. Relative browse turns are dispatched even when consecutive messages have the same byte value. Browse actions operate the two-column crate; loading never starts playback. `band` is `treble`, `mid`, or `bass` respectively. Mixer routes EQ through a narrow Deck/EQ callback registration to the same selected-gain and kill state used by mouse controls. Killed bands keep −40 dB effective gain while rotation updates the retained selection; unkill restores it. Loop actions call the existing ready-guarded `transportAction(deck, 'in'/'out')`: In captures a fresh start; Out captures a later end and enables the loop, or exits an already-active loop, exactly like the screen buttons. Note Off and zero-velocity Note On only clear held state; neither invokes an app action. Repeated Note On while held and unchanged decoded CC values are suppressed. A new valid release/press remains a new action; no arbitrary timing debounce is imposed.

## Adapter contract

### Browse / Gain provenance and acceptance boundary

The XML above was freshly retrieved during implementation closeout with the same SHA-256.
Its input rows name CC13/14 `pregain`, CC26 `NumarkTotalControl.selectKnob`, Note72
`NumarkTotalControl.toggleDirectoryMode`, and Note75/52 `LoadSelectedTrack` for Channel1/2.
The app deliberately maps Gain to its existing ±8% pitch state, not gain.

**Note79 is provisional.** The XML names it `LoadSelectedIntoFirstStopped`; it does not
identify the physical center-push switch. This app currently interprets it as folder-enter,
not Mixxx's loading behavior. Neither a physical packet capture nor hardware acceptance was
performed. The popup labels that uncertainty; mouse folder selection remains available.

[Mixxx's accompanying script](https://raw.githubusercontent.com/mixxxdj/mixxx/main/res/controllers/Numark-Total-Control-scripts.js)
was also retrieved, SHA-256 `1630779e5dfd5cc6f00233633987928f8f3929f761932aa70b97405618deca59`.
`selectKnob` subtracts 128 when the incoming value exceeds 63. The adapter preserves those
signed relative values, ignores zero, and never deduplicates successive equal browse steps.
Crate wraparound uses staged arithmetic because this shipped JSX compiler drops grouping
parentheses in arithmetic expressions. Folder changes use functional state updates.

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
