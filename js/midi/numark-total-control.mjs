// Input assignments: pages/webmidi/controllers/numark-total-control.js:25-42.
// Status/channel decoding: pages/webmidi/ui.js:51-60. No SysEx.
// EQ/loop/pitch-step/FX/Fine Pitch/Tap/jog INPUT assignments verified against Mixxx and Numark sources;
// see docs/numark-midi.md for URL/hash. LED OUTPUT assignments are a separate table and are never
// substituted for the input notes below.
const notes = new Map([
  [67, { type: 'play', deck: 'left' }],
  [51, { type: 'cue', deck: 'left' }],
  [59, { type: 'setcue', deck: 'left' }],
  [76, { type: 'play', deck: 'right' }],
  [60, { type: 'cue', deck: 'right' }],
  [68, { type: 'setcue', deck: 'right' }],
  [0x50, { type: 'eqkill', deck: 'left', band: 'treble' }],
  [0x55, { type: 'eqkill', deck: 'left', band: 'mid' }],
  [0x53, { type: 'eqkill', deck: 'left', band: 'bass' }],
  [0x52, { type: 'eqkill', deck: 'right', band: 'treble' }],
  [0x51, { type: 'eqkill', deck: 'right', band: 'mid' }],
  [0x54, { type: 'eqkill', deck: 'right', band: 'bass' }],
  [0x49, { type: 'loopIn', deck: 'left' }],
  [0x4a, { type: 'loopOut', deck: 'left' }],
  [0x4d, { type: 'loopIn', deck: 'right' }],
  [0x4e, { type: 'loopOut', deck: 'right' }],
  // Verified Mixxx INPUT rows: physical pitch-bend minus/plus buttons.
  [0x41, { type: 'pitchStep', deck: 'left', delta: -0.1 }],
  [0x42, { type: 'pitchStep', deck: 'left', delta: 0.1 }],
  [0x45, { type: 'pitchStep', deck: 'right', delta: -0.1 }],
  [0x46, { type: 'pitchStep', deck: 'right', delta: 0.1 }],
  // Fine Pitch/Tap INPUT controls are repurposed for the two sample channels.
  [0x3a, { type: 'sampleTrigger', channel: 0 }],
  [0x3e, { type: 'sampleTrigger', channel: 1 }],
  [0x31, { type: 'fxmode', deck: 'left', slot: 0 }],
  [0x35, { type: 'fxmode', deck: 'right', slot: 0 }],
  [0x32, { type: 'fxmode', deck: 'left', slot: 1 }],
  [0x36, { type: 'fxmode', deck: 'right', slot: 1 }]
]);
const controllers = new Map([
  [0x00, { type: 'fxvalue', deck: 'left', slot: 0 }],
  [0x04, { type: 'fxvalue', deck: 'right', slot: 0 }],
  [0x01, { type: 'fxvalue', deck: 'left', slot: 1 }],
  [0x05, { type: 'fxvalue', deck: 'right', slot: 1 }],
  [0x03, { type: 'sampleMove', channel: 0 }],
  [0x07, { type: 'sampleMove', channel: 1 }],
  [8, { type: 'volume', deck: 'left' }],
  [9, { type: 'volume', deck: 'right' }],
  [10, { type: 'crossfader' }],
  [13, { type: 'pitch', deck: 'left' }],
  [14, { type: 'pitch', deck: 'right' }],
  // Manufacturer map + Mixxx INPUT rows: signed relative jog wheels.
  [0x19, { type: 'jog', deck: 'left' }],
  [0x18, { type: 'jog', deck: 'right' }],
  [0x10, { type: 'eqvalue', deck: 'left', band: 'treble' }],
  [0x12, { type: 'eqvalue', deck: 'left', band: 'mid' }],
  [0x14, { type: 'eqvalue', deck: 'left', band: 'bass' }],
  [0x11, { type: 'eqvalue', deck: 'right', band: 'treble' }],
  [0x13, { type: 'eqvalue', deck: 'right', band: 'mid' }],
  [0x15, { type: 'eqvalue', deck: 'right', band: 'bass' }]
]);
const browseController = 0x1a;
const browseNotes = new Map([
  [0x48, { type: 'browse-directory' }],
  // Provisional physical center-push assignment: upstream only names FirstStopped load.
  [0x4f, { type: 'browse-enter' }],
  [0x4b, { type: 'load-track', deck: 'left' }],
  [0x34, { type: 'load-track', deck: 'right' }]
]);

// Mixxx wiki "Numark Total Control Midi Codes", LED table. The table enumerates every
// output note from 48 through 86 exactly once. WebDeckDJ deliberately sends on channel 1.
export const TOTAL_CONTROL_LED_NOTES = Object.freeze(
  Array.from({ length: 0x56 - 0x30 + 1 }, (_, index) => 0x30 + index)
);

export const TOTAL_CONTROL_APP_LED_NOTES = Object.freeze({
  left: Object.freeze({
    samplePlaying: 0x30,
    fxStrengthMode: Object.freeze([0x33, 0x31]),
    pitchStep: Object.freeze({ decrease: 0x38, increase: 0x39 }),
    loopInSet: 0x3a,
    loopActive: 0x3b,
    cueAt: 0x3c,
    cueSet: 0x3d,
    playing: 0x3e,
    loaded: 0x3f,
    eqCentered: Object.freeze({ treble: 0x50, mid: 0x51, bass: 0x52 })
  }),
  right: Object.freeze({
    fxStrengthMode: Object.freeze([0x44, 0x45]),
    samplePlaying: 0x47,
    pitchStep: Object.freeze({ decrease: 0x48, increase: 0x49 }),
    loopInSet: 0x4a,
    loopActive: 0x4b,
    cueAt: 0x4c,
    cueSet: 0x4d,
    playing: 0x4e,
    loaded: 0x4f,
    eqCentered: Object.freeze({ treble: 0x53, mid: 0x54, bass: 0x55 })
  }),
  directoryMode: 0x56
});

export const TOTAL_CONTROL_PITCH_STEP_PULSE_MS = 180;

// Pure persistent app-state projection used by the adapter and direct tests. Momentary
// pitch-step LEDs are layered on by the adapter and therefore begin off in this snapshot.
export function getTotalControlLedState(appState = {}) {
  const state = new Map(TOTAL_CONTROL_LED_NOTES.map(note => [note, false]));
  const decks = appState.decks || {};
  ['left', 'right'].forEach(deck => {
    const deckState = decks[deck] || {};
    const output = TOTAL_CONTROL_APP_LED_NOTES[deck];
    state.set(output.playing, deckState.playing === true);
    state.set(output.loaded, deckState.loaded === true);
    state.set(output.cueAt, deckState.cueAt === true);
    state.set(output.cueSet, deckState.cueSet === true);
    state.set(output.loopInSet, deckState.loopInSet === true);
    state.set(output.loopActive, deckState.loopActive === true);
    state.set(output.samplePlaying, deckState.samplePlaying === true);
    const fxModes = Array.isArray(deckState.fxStrengthMode) ? deckState.fxStrengthMode : [];
    output.fxStrengthMode.forEach((note, slot) => state.set(note, fxModes[slot] === true));
    const eqCentered = deckState.eqCentered || {};
    Object.entries(output.eqCentered).forEach(([band, note]) => {
      state.set(note, eqCentered[band] === true);
    });
  });
  state.set(TOTAL_CONTROL_APP_LED_NOTES.directoryMode, appState.directoryMode === true);
  return state;
}

export function isTotalControlInput(input) {
  return input?.type === 'input' && /total(?:\s*track)?\s*control/i.test(
    `${input.manufacturer || ''} ${input.name || ''}`
  );
}

export function isTotalControlOutput(output) {
  return output?.type === 'output' && /total(?:\s*track)?\s*control/i.test(
    `${output.manufacturer || ''} ${output.name || ''}`
  );
}

// Pure decoder. Faders use 0..1; EQ uses -10..10 dB in the UI's 0.5 dB steps.
// Release/unmapped data is null.
// Like the source visualizer, accept the documented status family on any channel.
export function decodeTotalControl(data) {
  if (!data || data.length !== 3) return null;
  const [status, number, value] = data;
  if (!Number.isInteger(status) || status < 0x80 || status > 0xef ||
      !Number.isInteger(number) || number < 0 || number > 127 ||
      !Number.isFinite(value)) return null;
  const family = status & 0xf0;
  if (family === 0x90 && Number.isInteger(value) && value > 0 && value <= 127) {
    const action = notes.get(number) || browseNotes.get(number);
    return action ? { ...action } : null;
  }
  if (family === 0xb0) {
    if (number === browseController) {
      if (!Number.isInteger(value) || value < 0 || value > 127) return null;
      const midiValue = value;
      // Mixxx selectKnob uses two's complement: 1..63 up, 64..127 down; 0 does not move.
      const delta = midiValue <= 63 ? midiValue : midiValue - 128;
      return delta ? { type: 'browse-move', delta } : null;
    }
    const action = controllers.get(number);
    if (!action) return null;
    const midiValue = Math.max(0, Math.min(127, value));
    if (action.type === 'sampleMove' || action.type === 'fxvalue' || action.type === 'jog') {
      // Fine Pitch, FX encoders, and jog wheels are two's-complement relative:
      // 1..63 forward, 64..127 backward, and 0 is stationary.
      const delta = midiValue <= 63 ? midiValue : midiValue - 128;
      return delta ? { ...action, delta } : null;
    }
    if (action.type === 'eqvalue') {
      // Both center bytes are neutral; each half reaches the existing UI limit.
      const centered = midiValue < 63 ? (midiValue - 63) / 63
        : midiValue > 64 ? (midiValue - 64) / 63 : 0;
      return { ...action, value: Math.round(centered * 20) / 2 || 0 };
    }
    const normalized = midiValue / 127;
    if (action.type === 'pitch') {
      const centered = midiValue < 64 ? (midiValue - 63) / 63 : (midiValue - 64) / 63;
      return { ...action, value: Math.round(centered * 8 * 10) / 10 };
    }
    // Total Control crossfader runs opposite to the on-screen left-to-right axis.
    return { ...action, value: action.type === 'crossfader' ? 1 - normalized : normalized };
  }
  return null;
}

// A press is one action until a matching release. Reset on port detach/reconnect.
export function createTotalControlDispatcher(onAction, onPitchStepState) {
  const held = new Set();
  const ccValues = new Map();
  return {
    handle(data) {
      if (!data || data.length !== 3) return false;
      const [status, number, value] = data;
      const family = status & 0xf0;
      const key = (status & 0x0f) * 128 + number;
      if (Number.isInteger(status) && status >= 0x80 && status <= 0x9f &&
          Number.isInteger(number) && number >= 0 && number <= 127 &&
          Number.isInteger(value) && value >= 0 && value <= 127 &&
          (family === 0x80 || (family === 0x90 && value === 0))) {
        const wasHeld = held.delete(key);
        const releasedAction = notes.get(number);
        if (wasHeld && releasedAction?.type === 'pitchStep' && onPitchStepState) {
          onPitchStepState({ ...releasedAction, active: false, inputKey: key });
        }
        return false;
      }
      const action = decodeTotalControl(data);
      if (!action) return false;
      if (family === 0x90) {
        if (held.has(key)) return false;
        held.add(key);
        if (action.type === 'pitchStep' && onPitchStepState) {
          onPitchStepState({ ...action, active: true, inputKey: key });
        }
      } else {
        if (action.type === 'browse-move' || action.type === 'sampleMove' || action.type === 'fxvalue' || action.type === 'jog') {
          onAction(action);
          return true;
        }
        if (ccValues.get(key) === action.value) return false;
        ccValues.set(key, action.value);
      }
      onAction(action);
      return true;
    },
    reset() {
      if (onPitchStepState) {
        held.forEach(key => {
          const action = notes.get(key % 128);
          if (action?.type === 'pitchStep') onPitchStepState({ ...action, active: false, inputKey: key });
        });
      }
      held.clear();
      ccValues.clear();
    }
  };
}

// Constructing does nothing to MIDI. Call connect() directly in a click handler.
// The second argument is only an environment seam for synthetic direct checks.
export function createTotalControlMidi(callbacks = {}, environment = globalThis) {
  let handlers = callbacks;
  let lighting = { code: 'idle', message: '', output: null };
  let status = { code: 'idle', message: '', input: null, inputs: [], output: null, lighting };
  let access = null;
  let pending = null;
  let selectedId = null;
  let inputBinding = null;
  let outputBinding = null;
  let desiredLedState = getTotalControlLedState();
  const pitchStepSources = new Map();
  const pitchStepPulseTimers = new Map();
  let generation = 0;
  let destroyed = false;
  const portOperations = new WeakMap();
  const setTimer = typeof environment.setTimeout === 'function'
    ? environment.setTimeout.bind(environment)
    : globalThis.setTimeout.bind(globalThis);
  const clearTimer = typeof environment.clearTimeout === 'function'
    ? environment.clearTimeout.bind(environment)
    : globalThis.clearTimeout.bind(globalThis);

  function getPitchStepDescriptor(deck, delta) {
    if (deck !== 'left' && deck !== 'right') return null;
    const direction = Number(delta) < 0 ? 'decrease' : Number(delta) > 0 ? 'increase' : null;
    if (!direction) return null;
    return { deck, delta: direction === 'decrease' ? -0.1 : 0.1, direction,
      note: TOTAL_CONTROL_APP_LED_NOTES[deck].pitchStep[direction] };
  }

  function effectiveLedState(note) {
    return desiredLedState.get(note) === true || Boolean(pitchStepSources.get(note)?.size);
  }

  function publishPitchStep(descriptor, active) {
    if (!destroyed) handlers.onPitchStepFeedback?.({
      deck: descriptor.deck,
      delta: descriptor.delta,
      direction: descriptor.direction,
      active
    });
  }

  function setPitchStepSource(descriptor, source, active) {
    const previous = Boolean(pitchStepSources.get(descriptor.note)?.size);
    let sources = pitchStepSources.get(descriptor.note);
    if (active) {
      if (!sources) {
        sources = new Set();
        pitchStepSources.set(descriptor.note, sources);
      }
      sources.add(source);
    } else if (sources) {
      sources.delete(source);
      if (!sources.size) pitchStepSources.delete(descriptor.note);
    }
    const current = Boolean(pitchStepSources.get(descriptor.note)?.size);
    if (current === previous) return false;
    publishPitchStep(descriptor, current);
    if (outputBinding?.ready) syncLights(outputBinding);
    return true;
  }

  function clearPitchStepFeedback() {
    pitchStepPulseTimers.forEach(timer => clearTimer(timer));
    pitchStepPulseTimers.clear();
    const activeNotes = Array.from(pitchStepSources.keys());
    pitchStepSources.clear();
    activeNotes.forEach(note => {
      ['left', 'right'].forEach(deck => {
        const output = TOTAL_CONTROL_APP_LED_NOTES[deck].pitchStep;
        const direction = output.decrease === note ? 'decrease' : output.increase === note ? 'increase' : null;
        if (direction) publishPitchStep(getPitchStepDescriptor(deck, direction === 'decrease' ? -0.1 : 0.1), false);
      });
    });
  }

  const dispatcher = createTotalControlDispatcher(
    action => handlers.onAction?.(action),
    event => {
      const descriptor = getPitchStepDescriptor(event.deck, event.delta);
      if (descriptor) setPitchStepSource(descriptor, `midi:${event.inputKey}`, event.active);
    }
  );

  function publish(code, message, input = null, inputs = []) {
    status = { code, message, input, inputs, output: lighting.output, lighting };
    if (!destroyed) handlers.onStatus?.(status);
    return status;
  }
  function publishLighting(code, message, output = null, notify = true) {
    lighting = { code, message, output: output ? describe(output) : null };
    status = { ...status, output: lighting.output, lighting };
    if (notify && !destroyed) handlers.onStatus?.(status);
    return lighting;
  }
  function describe(port) {
    return { id: port.id, name: port.name || 'Numark Total Control', manufacturer: port.manufacturer || '' };
  }
  function sequence(port, operation) {
    const previous = portOperations.get(port) || Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    portOperations.set(port, next);
    return next;
  }
  function sendAllLightsOff(port) {
    let succeeded = true;
    TOTAL_CONTROL_LED_NOTES.forEach(note => {
      try { port.send([0x90, note, 0x00]); }
      catch (_) { succeeded = false; }
    });
    return succeeded;
  }
  function syncLights(current) {
    if (!current?.ready || outputBinding !== current || current.port.state !== 'connected') return false;
    let succeeded = true;
    desiredLedState.forEach((persistentEnabled, note) => {
      const enabled = persistentEnabled || effectiveLedState(note);
      if (current.sent.get(note) === enabled) return;
      try {
        current.port.send([0x90, note, enabled ? 0x7f : 0x00]);
        current.sent.set(note, enabled);
      } catch (_) {
        succeeded = false;
      }
    });
    if (!succeeded) {
      publishLighting('error', 'Controller input works, but an LED command failed', current.port);
    } else if (lighting.code !== 'connected' || lighting.output?.id !== current.port.id) {
      publishLighting('connected', `Lights: ${current.port.name || 'Total Control'}`, current.port);
    }
    return succeeded;
  }
  function detachOutput(clear = true) {
    const old = outputBinding;
    outputBinding = null;
    if (!old) return;
    // Queue clearing after any pending open. Sending is best-effort and never rejects input/audio work.
    sequence(old.port, async () => {
      if (clear && old.port.state === 'connected') sendAllLightsOff(old.port);
      try { await old.port.close(); } catch (_) { /* The input lifecycle remains independent. */ }
    }).catch(() => {});
  }
  function detachInput() {
    const old = inputBinding;
    inputBinding = null;
    dispatcher.reset();
    if (old) {
      if (old.ready) old.port.removeEventListener('midimessage', old.listener);
      // Serialize close after our pending open, and before any subsequent open.
      sequence(old.port, () => old.port.close()).catch(() => {});
    }
  }
  function normalizedIdentity(port) {
    return `${port.manufacturer || ''}|${port.name || ''}`.trim().replace(/\s+/g, ' ').toLowerCase();
  }
  function chooseOutput(input, candidates) {
    if (candidates.length === 1) return candidates[0];
    const identity = normalizedIdentity(input);
    const matchingIdentity = candidates.filter(port => normalizedIdentity(port) === identity);
    return matchingIdentity.length === 1 ? matchingIdentity[0] : null;
  }
  function reconcileOutput(input) {
    if (!access || destroyed || !input) return;
    const candidates = Array.from(access.outputs.values()).filter(
      port => isTotalControlOutput(port) && port.state === 'connected'
    );
    const port = chooseOutput(input, candidates);
    if (!port) {
      detachOutput();
      publishLighting(candidates.length > 1 ? 'ambiguous' : 'unavailable', candidates.length > 1
        ? 'Controller input works; multiple matching lighting outputs were found'
        : 'Controller input works; no matching lighting output was found');
      return;
    }
    if (outputBinding?.port === port) {
      if (!(outputBinding.ready && port.connection === 'closed')) return;
      detachOutput();
    } else {
      detachOutput();
    }
    const current = { port, ready: false, sent: new Map() };
    outputBinding = current;
    publishLighting('connecting', 'Connecting Total Control lights…', port);
    sequence(port, async () => {
      if (destroyed || outputBinding !== current) return;
      await port.open();
      if (destroyed || outputBinding !== current || port.state !== 'connected') return;
      current.ready = true;
      syncLights(current);
    }).catch(() => {
      if (outputBinding !== current || destroyed) return;
      outputBinding = null;
      publishLighting('error', 'Controller input works, but its lighting output could not open', port);
      sequence(port, () => port.close()).catch(() => {});
    });
  }
  function reconcile() {
    if (!access || destroyed) return;
    const candidates = Array.from(access.inputs.values()).filter(
      port => isTotalControlInput(port) && port.state === 'connected'
    );
    let port = selectedId === null ? null : candidates.find(item => item.id === selectedId);
    if (selectedId === null && candidates.length === 1) {
      port = candidates[0];
      selectedId = port.id;
    }
    if (!port) {
      detachOutput();
      detachInput();
      publishLighting('unavailable', 'Lights unavailable without a selected Total Control', null, false);
      if (selectedId === null && candidates.length > 1) {
        publish('choose-controller', 'Choose a Total Control input', null, candidates.map(describe));
      } else {
        publish('no-controller', selectedId === null
          ? 'No Total Control found — plug it in'
          : 'Total Control disconnected — reconnect the selected device');
      }
      return;
    }
    reconcileOutput(port);
    if (inputBinding?.port === port) {
      if (inputBinding.ready && port.connection === 'closed') {
        detachOutput();
        detachInput();
        publish('error', 'MIDI input closed — click Connect MIDI to retry');
      }
      return;
    }
    detachInput();
    const current = { port, ready: false, listener: null };
    current.listener = event => {
      if (destroyed || inputBinding !== current || !current.ready || port.state !== 'connected') return;
      try { dispatcher.handle(event.data); }
      catch (error) { publish('action-error', 'MIDI action failed — check the deck', describe(port)); }
    };
    inputBinding = current;
    publish('connecting', 'Connecting Total Control…', describe(port));
    sequence(port, async () => {
      if (destroyed || inputBinding !== current) return;
      await port.open();
      if (destroyed || inputBinding !== current || port.state !== 'connected') return;
      port.addEventListener('midimessage', current.listener);
      current.ready = true;
      publish('connected', `MIDI: ${port.name || 'Total Control'}`, describe(port));
    }).catch(() => {
      if (inputBinding !== current || destroyed) return;
      detachOutput();
      detachInput();
      publish('error', 'Cannot open Total Control — close conflicting MIDI apps and retry');
    });
  }
  function stop() {
    generation += 1;
    pending = null;
    if (access) access.removeEventListener('statechange', reconcile);
    access = null;
    detachOutput();
    clearPitchStepFeedback();
    detachInput();
    selectedId = null;
  }

  const preferenceKey = 'webdeckdj-midi-enabled';
  function remember(enabled) {
    try { environment.localStorage.setItem(preferenceKey, enabled ? 'true' : 'false'); }
    catch (_) { /* MIDI still works when browser storage is unavailable. */ }
  }

  const api = {
    async restore() {
      const token = generation;
      try {
        if (environment.localStorage.getItem(preferenceKey) !== 'true') return status;
        const permission = await environment.navigator.permissions.query({ name: 'midi', sysex: false });
        if (destroyed || token !== generation || permission.state !== 'granted') return status;
        return api.connect({ restoring: true });
      } catch (_) { return status; } // Unsupported permission queries require an explicit click.
    },
    getStatus() { return status; },
    setCallbacks(next = {}) { if (!destroyed) handlers = next; },
    setLedState(next = {}) {
      if (destroyed) return;
      desiredLedState = getTotalControlLedState(next);
      if (outputBinding?.ready) syncLights(outputBinding);
    },
    pulsePitchStep(deck, delta, duration = TOTAL_CONTROL_PITCH_STEP_PULSE_MS) {
      if (destroyed) return false;
      const descriptor = getPitchStepDescriptor(deck, delta);
      if (!descriptor) return false;
      const previousTimer = pitchStepPulseTimers.get(descriptor.note);
      if (previousTimer !== undefined) clearTimer(previousTimer);
      setPitchStepSource(descriptor, 'gui', true);
      const milliseconds = Number.isFinite(duration) && duration >= 0 ? duration : TOTAL_CONTROL_PITCH_STEP_PULSE_MS;
      const timer = setTimer(() => {
        if (pitchStepPulseTimers.get(descriptor.note) !== timer) return;
        pitchStepPulseTimers.delete(descriptor.note);
        setPitchStepSource(descriptor, 'gui', false);
      }, milliseconds);
      pitchStepPulseTimers.set(descriptor.note, timer);
      return true;
    },
    clearPitchStep(deck, delta) {
      if (destroyed) return false;
      const descriptor = getPitchStepDescriptor(deck, delta);
      if (!descriptor) return false;
      const timer = pitchStepPulseTimers.get(descriptor.note);
      if (timer !== undefined) clearTimer(timer);
      pitchStepPulseTimers.delete(descriptor.note);
      setPitchStepSource(descriptor, 'gui', false);
      return true;
    },
    connect({ inputId, restoring = false } = {}) {
      if (destroyed) return Promise.resolve(status);
      if (!environment.isSecureContext) {
        return Promise.resolve(publish('insecure', 'MIDI needs HTTPS or localhost'));
      }
      const navigator = environment.navigator;
      if (typeof navigator?.requestMIDIAccess !== 'function') {
        return Promise.resolve(publish('unsupported', 'Web MIDI is not supported in this browser'));
      }
      if (!restoring && navigator.userActivation?.isActive === false) {
        return Promise.resolve(publish('gesture-required', 'Click Connect MIDI to allow access'));
      }
      if (pending) return pending;
      if (access) {
        remember(true);
        if (inputId !== undefined) selectedId = inputId;
        reconcile();
        return Promise.resolve(status);
      }
      selectedId = inputId === undefined ? null : inputId;
      const token = ++generation;
      publish('requesting', 'Allow MIDI access in the browser…');
      let request;
      // Do not await/import/ask another permission before this gesture-bound call.
      try { request = navigator.requestMIDIAccess({ sysex: false }); }
      catch (error) { request = Promise.reject(error); }
      const task = Promise.resolve(request).then(result => {
        if (destroyed || token !== generation) return status;
        access = result;
        remember(true);
        access.addEventListener('statechange', reconcile);
        reconcile();
        return status;
      }).catch(error => {
        if (destroyed || token !== generation) return status;
        return publish(error?.name === 'NotAllowedError' || error?.name === 'SecurityError' ? 'denied' : 'error',
          error?.name === 'NotAllowedError' || error?.name === 'SecurityError'
            ? 'MIDI permission denied or blocked by site policy — allow it and retry'
            : 'MIDI access failed — retry in a supported browser');
      }).finally(() => { if (pending === task) pending = null; });
      pending = task;
      return task;
    },
    disconnect() {
      if (destroyed) return;
      remember(false);
      stop();
      publishLighting('idle', '', null, false);
      publish('idle', 'MIDI disconnected');
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stop();
      handlers = {};
      lighting = { code: 'destroyed', message: '', output: null };
      status = { code: 'destroyed', message: 'MIDI adapter disposed', input: null, inputs: [], output: null, lighting };
    }
  };
  return api;
}
