import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TOTAL_CONTROL_APP_LED_NOTES,
  TOTAL_CONTROL_LED_NOTES,
  createTotalControlMidi,
  decodeTotalControl,
  getTotalControlLedState,
  isTotalControlOutput
} from '../js/midi/numark-total-control.mjs';

const settle = async () => {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
};

class MockPort {
  constructor({ id, type, name = 'Numark Total Control', manufacturer = 'Numark', openError = null, sendErrorNote = null }) {
    this.id = id;
    this.type = type;
    this.name = name;
    this.manufacturer = manufacturer;
    this.state = 'connected';
    this.connection = 'closed';
    this.openError = openError;
    this.sendErrorNote = sendErrorNote;
    this.openCalls = 0;
    this.closeCalls = 0;
    this.messages = [];
    this.listeners = new Map();
  }

  async open() {
    this.openCalls += 1;
    if (this.openError) throw this.openError;
    this.connection = 'open';
    return this;
  }

  async close() {
    this.closeCalls += 1;
    this.connection = 'closed';
    return this;
  }

  send(data) {
    if (this.sendErrorNote === data[1]) {
      this.sendErrorNote = null;
      throw new Error('synthetic send failure');
    }
    this.messages.push(Array.from(data));
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  emitMidi(data) {
    this.listeners.get('midimessage')?.forEach(listener => listener({ data }));
  }
}

class DeferredOpenPort extends MockPort {
  constructor(options) {
    super(options);
    this.openPromise = new Promise(resolve => { this.resolveOpen = resolve; });
  }

  async open() {
    this.openCalls += 1;
    await this.openPromise;
    this.connection = 'open';
    return this;
  }
}

class MockAccess {
  constructor(inputs = [], outputs = []) {
    this.inputs = new Map(inputs.map(port => [port.id, port]));
    this.outputs = new Map(outputs.map(port => [port.id, port]));
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  emitStateChange() {
    this.listeners.get('statechange')?.forEach(listener => listener({}));
  }
}

function makeEnvironment(access) {
  const storage = new Map();
  return {
    isSecureContext: true,
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value)
    },
    navigator: {
      userActivation: { isActive: true },
      requestMIDIAccess: async options => {
        assert.deepEqual(options, { sysex: false });
        return access;
      },
      permissions: { query: async () => ({ state: 'granted' }) }
    }
  };
}

function fullAppState() {
  return {
    directoryMode: true,
    decks: {
      left: {
        loaded: true, playing: true, cueAt: false, cueSet: true,
        loopInSet: true, loopActive: true, samplePlaying: true,
        fxStrengthMode: [true, false],
        eqCentered: { treble: true, mid: false, bass: true }
      },
      right: {
        loaded: true, playing: false, cueAt: true, cueSet: true,
        loopInSet: true, loopActive: false, samplePlaying: true,
        fxStrengthMode: [false, true],
        eqCentered: { treble: false, mid: true, bass: false }
      }
    }
  };
}

test('verified state projection keeps input notes distinct from LED output notes', () => {
  assert.deepEqual(decodeTotalControl([0x90, 67, 0x7f]), { type: 'play', deck: 'left' });
  const leds = getTotalControlLedState(fullAppState());
  const expectedOn = [48, 51, 58, 59, 61, 62, 63, 69, 71, 74, 76, 77, 79, 80, 82, 84, 86];
  assert.equal(leds.size, 39);
  assert.deepEqual(Array.from(leds.keys()), TOTAL_CONTROL_LED_NOTES);
  assert.deepEqual(Array.from(leds).filter(([, enabled]) => enabled).map(([note]) => note), expectedOn);
  assert.equal(leds.get(TOTAL_CONTROL_APP_LED_NOTES.left.playing), true);
  assert.equal(TOTAL_CONTROL_APP_LED_NOTES.left.playing, 62);
  assert.equal(leds.get(67), false, 'input Note 67 is not the left Play LED');
  assert.equal(leds.get(80), true, 'left treble center indicator');
  assert.equal(leds.get(81), false, 'left mid is away from center');
  assert.equal(leds.get(86), true, 'directory-mode indicator');
});

test('matching output receives exact channel-1 bytes, initial sync, GUI updates, and deduplication', async () => {
  const input = new MockPort({ id: 'input-1', type: 'input' });
  const output = new MockPort({ id: 'output-1', type: 'output' });
  const access = new MockAccess([input], [output]);
  const actions = [];
  const midi = createTotalControlMidi({ onAction: action => actions.push(action) }, makeEnvironment(access));
  midi.setLedState(fullAppState());
  await midi.connect();
  await settle();

  assert.equal(input.openCalls, 1);
  assert.equal(output.openCalls, 1);
  assert.equal(output.messages.length, 39);
  output.messages.forEach(message => {
    assert.equal(message[0], 0x90);
    assert.ok(TOTAL_CONTROL_LED_NOTES.includes(message[1]));
    assert.ok(message[2] === 0x00 || message[2] === 0x7f);
  });
  assert.deepEqual(output.messages.find(message => message[1] === 62), [0x90, 62, 0x7f]);
  assert.deepEqual(output.messages.find(message => message[1] === 67), [0x90, 67, 0x00]);

  input.emitMidi([0x90, 67, 0x7f]);
  assert.deepEqual(actions, [{ type: 'play', deck: 'left' }]);
  assert.equal(output.messages.length, 39, 'input is not blindly echoed to lighting');

  midi.setLedState(fullAppState());
  assert.equal(output.messages.length, 39, 'identical app state is deduplicated');
  const paused = fullAppState();
  paused.decks.left.playing = false;
  midi.setLedState(paused);
  assert.deepEqual(output.messages.at(-1), [0x90, 62, 0x00]);
  assert.equal(output.messages.length, 40);

  midi.destroy();
  await settle();
  assert.equal(output.closeCalls, 1);
  assert.deepEqual(output.messages.slice(-39), TOTAL_CONTROL_LED_NOTES.map(note => [0x90, note, 0x00]));
});

test('unrelated or ambiguous outputs are never opened and input stays connected', async () => {
  const input = new MockPort({ id: 'input-1', type: 'input' });
  const unrelated = new MockPort({ id: 'other', type: 'output', name: 'Other MIDI Device', manufacturer: 'Other' });
  const statuses = [];
  const midi = createTotalControlMidi({ onStatus: status => statuses.push(status) }, makeEnvironment(new MockAccess([input], [unrelated])));
  await midi.connect();
  await settle();
  assert.equal(midi.getStatus().code, 'connected');
  assert.equal(midi.getStatus().lighting.code, 'unavailable');
  assert.equal(unrelated.openCalls, 0);
  assert.equal(unrelated.messages.length, 0);
  midi.destroy();

  const input2 = new MockPort({ id: 'input-2', type: 'input' });
  const outputA = new MockPort({ id: 'output-a', type: 'output' });
  const outputB = new MockPort({ id: 'output-b', type: 'output' });
  const ambiguous = createTotalControlMidi({}, makeEnvironment(new MockAccess([input2], [outputA, outputB])));
  await ambiguous.connect();
  await settle();
  assert.equal(ambiguous.getStatus().code, 'connected');
  assert.equal(ambiguous.getStatus().lighting.code, 'ambiguous');
  assert.equal(outputA.openCalls + outputB.openCalls, 0);
  ambiguous.destroy();
  assert.ok(statuses.some(status => status.code === 'connected'));
});

test('multiple matching outputs select only the unique exact input identity', async () => {
  const input = new MockPort({ id: 'input-1', type: 'input', name: 'Total Control Port 1' });
  const paired = new MockPort({ id: 'output-1', type: 'output', name: 'Total Control Port 1' });
  const other = new MockPort({ id: 'output-2', type: 'output', name: 'Total Control Port 2' });
  const midi = createTotalControlMidi({}, makeEnvironment(new MockAccess([input], [paired, other])));
  await midi.connect();
  await settle();
  assert.equal(midi.getStatus().code, 'connected');
  assert.equal(midi.getStatus().lighting.code, 'connected');
  assert.equal(paired.openCalls, 1);
  assert.equal(other.openCalls, 0);
  assert.equal(other.messages.length, 0);
  midi.destroy();
});

test('output open and send failures do not break input actions', async () => {
  const input = new MockPort({ id: 'input-1', type: 'input' });
  const failedOutput = new MockPort({ id: 'output-1', type: 'output', openError: new Error('busy') });
  const actions = [];
  const midi = createTotalControlMidi({ onAction: action => actions.push(action) }, makeEnvironment(new MockAccess([input], [failedOutput])));
  await midi.connect();
  await settle();
  assert.equal(midi.getStatus().code, 'connected');
  assert.equal(midi.getStatus().lighting.code, 'error');
  input.emitMidi([0x90, 67, 0x7f]);
  assert.equal(actions.length, 1);
  midi.destroy();

  const input2 = new MockPort({ id: 'input-2', type: 'input' });
  const flakyOutput = new MockPort({ id: 'output-2', type: 'output', sendErrorNote: 62 });
  const midi2 = createTotalControlMidi({}, makeEnvironment(new MockAccess([input2], [flakyOutput])));
  midi2.setLedState(fullAppState());
  await midi2.connect();
  await settle();
  assert.equal(midi2.getStatus().code, 'connected');
  assert.equal(midi2.getStatus().lighting.code, 'error');
  midi2.setLedState(fullAppState());
  assert.deepEqual(flakyOutput.messages.at(-1), [0x90, 62, 0x7f]);
  assert.equal(midi2.getStatus().lighting.code, 'connected');
  midi2.destroy();
});

test('output reconnect performs a full current-state sync without reopening input', async () => {
  const input = new MockPort({ id: 'input-1', type: 'input' });
  const output = new MockPort({ id: 'output-1', type: 'output' });
  const access = new MockAccess([input], [output]);
  const midi = createTotalControlMidi({}, makeEnvironment(access));
  midi.setLedState(fullAppState());
  await midi.connect();
  await settle();
  assert.equal(output.messages.length, 39);

  output.state = 'disconnected';
  output.connection = 'closed';
  access.emitStateChange();
  await settle();
  assert.equal(midi.getStatus().code, 'connected');
  assert.equal(midi.getStatus().lighting.code, 'unavailable');

  output.state = 'connected';
  access.emitStateChange();
  await settle();
  assert.equal(input.openCalls, 1);
  assert.equal(output.openCalls, 2);
  assert.equal(output.messages.length, 78);
  assert.deepEqual(output.messages.slice(-39), output.messages.slice(0, 39));
  midi.destroy();
});

test('explicit disconnect clears every known LED, closes both selected ports, and remains reusable', async () => {
  const input = new MockPort({ id: 'input-1', type: 'input' });
  const output = new MockPort({ id: 'output-1', type: 'output' });
  const access = new MockAccess([input], [output]);
  const midi = createTotalControlMidi({}, makeEnvironment(access));
  midi.setLedState(fullAppState());
  await midi.connect();
  await settle();
  midi.disconnect();
  await settle();
  assert.equal(midi.getStatus().code, 'idle');
  assert.equal(input.closeCalls, 1);
  assert.equal(output.closeCalls, 1);
  assert.deepEqual(output.messages.slice(-39), TOTAL_CONTROL_LED_NOTES.map(note => [0x90, note, 0x00]));

  await midi.connect();
  await settle();
  assert.equal(input.openCalls, 2);
  assert.equal(output.openCalls, 2);
  assert.equal(midi.getStatus().code, 'connected');
  midi.destroy();
});

test('destroy during a pending output open clears reachable LEDs and closes without late callbacks', async () => {
  const input = new MockPort({ id: 'input-1', type: 'input' });
  const output = new DeferredOpenPort({ id: 'output-1', type: 'output' });
  const access = new MockAccess([input], [output]);
  const statuses = [];
  const midi = createTotalControlMidi({ onStatus: status => statuses.push(status) }, makeEnvironment(access));
  await midi.connect();
  await settle();
  midi.destroy();
  const statusCountAtDestroy = statuses.length;
  output.resolveOpen();
  await settle();
  assert.equal(statuses.length, statusCountAtDestroy);
  assert.equal(output.closeCalls, 1);
  assert.deepEqual(output.messages, TOTAL_CONTROL_LED_NOTES.map(note => [0x90, note, 0x00]));
});

test('output matcher accepts only Numark Total Control-style output names', () => {
  assert.equal(isTotalControlOutput({ type: 'output', name: 'TOTAL CONTROL', manufacturer: 'Numark' }), true);
  assert.equal(isTotalControlOutput({ type: 'output', name: 'TotalTrack Control', manufacturer: 'Numark' }), true);
  assert.equal(isTotalControlOutput({ type: 'input', name: 'Total Control', manufacturer: 'Numark' }), false);
  assert.equal(isTotalControlOutput({ type: 'output', name: 'Other Controller', manufacturer: 'Numark' }), false);
});
