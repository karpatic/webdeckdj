// Input assignments: pages/webmidi/controllers/numark-total-control.js:25-42.
// Status/channel decoding: pages/webmidi/ui.js:51-60. No MIDI output or SysEx.
// EQ/loop INPUT assignments verified against Mixxx Numark Total Control.midi.xml;
// see docs/numark-midi.md for URL/hash. Output/LED assignments are not inputs.
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
  [0x4e, { type: 'loopOut', deck: 'right' }]
]);
const controllers = new Map([
  [8, { type: 'volume', deck: 'left' }],
  [9, { type: 'volume', deck: 'right' }],
  [10, { type: 'crossfader' }],
  [13, { type: 'pitch', deck: 'left' }],
  [14, { type: 'pitch', deck: 'right' }],
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

export function isTotalControlInput(input) {
  return input?.type === 'input' && /total(?:\s*track)?\s*control/i.test(
    `${input.manufacturer || ''} ${input.name || ''}`
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
export function createTotalControlDispatcher(onAction) {
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
        held.delete(key);
        return false;
      }
      const action = decodeTotalControl(data);
      if (!action) return false;
      if (family === 0x90) {
        if (held.has(key)) return false;
        held.add(key);
      } else {
        if (action.type === 'browse-move') {
          onAction(action);
          return true;
        }
        if (ccValues.get(key) === action.value) return false;
        ccValues.set(key, action.value);
      }
      onAction(action);
      return true;
    },
    reset() { held.clear(); ccValues.clear(); }
  };
}

// Constructing does nothing to MIDI. Call connect() directly in a click handler.
// The second argument is only an environment seam for synthetic direct checks.
export function createTotalControlMidi(callbacks = {}, environment = globalThis) {
  let handlers = callbacks;
  let status = { code: 'idle', message: '', input: null, inputs: [] };
  let access = null;
  let pending = null;
  let selectedId = null;
  let binding = null;
  let generation = 0;
  let destroyed = false;
  const portOperations = new WeakMap();
  const dispatcher = createTotalControlDispatcher(action => handlers.onAction?.(action));

  function publish(code, message, input = null, inputs = []) {
    status = { code, message, input, inputs };
    if (!destroyed) handlers.onStatus?.(status);
    return status;
  }
  function describe(input) {
    return { id: input.id, name: input.name || 'Numark Total Control', manufacturer: input.manufacturer || '' };
  }
  function sequence(port, operation) {
    const previous = portOperations.get(port) || Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    portOperations.set(port, next);
    return next;
  }
  function detach() {
    const old = binding;
    binding = null;
    dispatcher.reset();
    if (old) {
      if (old.ready) old.port.removeEventListener('midimessage', old.listener);
      // Serialize close after our pending open, and before any subsequent open.
      sequence(old.port, () => old.port.close()).catch(() => {});
    }
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
      detach();
      if (selectedId === null && candidates.length > 1) {
        publish('choose-controller', 'Choose a Total Control input', null, candidates.map(describe));
      } else {
        publish('no-controller', selectedId === null
          ? 'No Total Control found — plug it in'
          : 'Total Control disconnected — reconnect the selected device');
      }
      return;
    }
    if (binding?.port === port) {
      if (binding.ready && port.connection === 'closed') {
        detach();
        publish('error', 'MIDI input closed — click Connect MIDI to retry');
      }
      return;
    }
    detach();
    const current = { port, ready: false, listener: null };
    current.listener = event => {
      if (destroyed || binding !== current || !current.ready || port.state !== 'connected') return;
      try { dispatcher.handle(event.data); }
      catch (error) { publish('action-error', 'MIDI action failed — check the deck', describe(port)); }
    };
    binding = current;
    publish('connecting', 'Connecting Total Control…', describe(port));
    sequence(port, async () => {
      if (destroyed || binding !== current) return;
      await port.open();
      if (destroyed || binding !== current || port.state !== 'connected') return;
      port.addEventListener('midimessage', current.listener);
      current.ready = true;
      publish('connected', `MIDI: ${port.name || 'Total Control'}`, describe(port));
    }).catch(() => {
      if (binding !== current || destroyed) return;
      detach();
      publish('error', 'Cannot open Total Control — close conflicting MIDI apps and retry');
    });
  }
  function stop() {
    generation += 1;
    pending = null;
    if (access) access.removeEventListener('statechange', reconcile);
    access = null;
    detach();
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
      publish('idle', 'MIDI disconnected');
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stop();
      handlers = {};
      status = { code: 'destroyed', message: 'MIDI adapter disposed', input: null, inputs: [] };
    }
  };
  return api;
}
