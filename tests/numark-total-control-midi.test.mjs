import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TOTAL_CONTROL_APP_LED_NOTES,
  TOTAL_CONTROL_LED_NOTES,
  TOTAL_CONTROL_PITCH_STEP_PULSE_MS,
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

function makeEnvironment(access, extras = {}) {
  const storage = new Map();
  return Object.assign({
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
  }, extras);
}

class FakeClock {
  constructor() {
    this.now = 0;
    this.nextId = 1;
    this.tasks = new Map();
  }

  setTimeout(callback, delay) {
    const id = this.nextId;
    this.nextId += 1;
    this.tasks.set(id, { callback, at: this.now + delay });
    return id;
  }

  clearTimeout(id) {
    this.tasks.delete(id);
  }

  tick(milliseconds) {
    const end = this.now + milliseconds;
    while (true) {
      let nextId = null;
      let nextTask = null;
      this.tasks.forEach((task, id) => {
        if (task.at <= end && (!nextTask || task.at < nextTask.at)) {
          nextId = id;
          nextTask = task;
        }
      });
      if (!nextTask) break;
      this.now = nextTask.at;
      this.tasks.delete(nextId);
      nextTask.callback();
    }
    this.now = end;
  }
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
  assert.equal(leds.get(TOTAL_CONTROL_APP_LED_NOTES.left.pitchStep.decrease), false);
  assert.equal(leds.get(TOTAL_CONTROL_APP_LED_NOTES.left.pitchStep.increase), false);
  assert.equal(leds.get(TOTAL_CONTROL_APP_LED_NOTES.right.pitchStep.decrease), false);
  assert.equal(leds.get(TOTAL_CONTROL_APP_LED_NOTES.right.pitchStep.increase), false);
});

test('physical pitch-step presses light the verified output notes until release without repeating actions', async () => {
  const input = new MockPort({ id: 'input-1', type: 'input' });
  const output = new MockPort({ id: 'output-1', type: 'output' });
  const actions = [];
  const feedback = [];
  const midi = createTotalControlMidi({
    onAction: action => actions.push(action),
    onPitchStepFeedback: event => feedback.push(event)
  }, makeEnvironment(new MockAccess([input], [output])));
  await midi.connect();
  await settle();
  output.messages.length = 0;

  const mappings = [
    { input: 65, deck: 'left', delta: -0.1, direction: 'decrease', output: 56 },
    { input: 66, deck: 'left', delta: 0.1, direction: 'increase', output: 57 },
    { input: 69, deck: 'right', delta: -0.1, direction: 'decrease', output: 72 },
    { input: 70, deck: 'right', delta: 0.1, direction: 'increase', output: 73 }
  ];

  mappings.forEach(mapping => {
    const actionCount = actions.length;
    const messageCount = output.messages.length;
    input.emitMidi([0x90, mapping.input, 0x7f]);
    assert.deepEqual(actions.at(-1), { type: 'pitchStep', deck: mapping.deck, delta: mapping.delta });
    assert.equal(actions.length, actionCount + 1);
    assert.deepEqual(feedback.at(-1), {
      deck: mapping.deck, delta: mapping.delta, direction: mapping.direction, active: true
    });
    assert.deepEqual(output.messages.at(-1), [0x90, mapping.output, 0x7f]);

    input.emitMidi([0x90, mapping.input, 0x7f]);
    assert.equal(actions.length, actionCount + 1, 'held Note On stays suppressed');
    assert.equal(output.messages.length, messageCount + 1, 'held Note On does not resend its LED');

    input.emitMidi([0x90, mapping.input, 0x00]);
    assert.deepEqual(feedback.at(-1), {
      deck: mapping.deck, delta: mapping.delta, direction: mapping.direction, active: false
    });
    assert.deepEqual(output.messages.at(-1), [0x90, mapping.output, 0x00]);
    assert.equal(output.messages.length, messageCount + 2);
  });

  midi.destroy();
});

test('GUI pitch-step feedback emits a bounded 180 ms pulse and clears on blur-style cancellation and disconnect', async () => {
  const input = new MockPort({ id: 'input-1', type: 'input' });
  const output = new MockPort({ id: 'output-1', type: 'output' });
  const clock = new FakeClock();
  const feedback = [];
  const midi = createTotalControlMidi({ onPitchStepFeedback: event => feedback.push(event) }, makeEnvironment(
    new MockAccess([input], [output]),
    { setTimeout: clock.setTimeout.bind(clock), clearTimeout: clock.clearTimeout.bind(clock) }
  ));
  await midi.connect();
  await settle();
  output.messages.length = 0;

  assert.equal(TOTAL_CONTROL_PITCH_STEP_PULSE_MS, 180);
  assert.equal(midi.pulsePitchStep('left', -0.1), true);
  assert.deepEqual(output.messages, [[0x90, 56, 0x7f]]);
  assert.equal(feedback.at(-1).active, true);
  clock.tick(179);
  assert.deepEqual(output.messages, [[0x90, 56, 0x7f]], 'pulse remains lit before its exact deadline');
  clock.tick(1);
  assert.deepEqual(output.messages.at(-1), [0x90, 56, 0x00]);
  assert.equal(feedback.at(-1).active, false);

  output.messages.length = 0;
  midi.pulsePitchStep('left', -0.1);
  input.emitMidi([0x90, 65, 0x7f]);
  assert.deepEqual(output.messages, [[0x90, 56, 0x7f]], 'overlapping GUI and physical sources deduplicate on');
  clock.tick(180);
  assert.deepEqual(output.messages, [[0x90, 56, 0x7f]], 'GUI pulse expiry cannot clear a held physical press');
  input.emitMidi([0x90, 65, 0x00]);
  assert.deepEqual(output.messages.at(-1), [0x90, 56, 0x00]);

  midi.pulsePitchStep('right', 0.1);
  assert.deepEqual(output.messages.at(-1), [0x90, 73, 0x7f]);
  assert.equal(midi.clearPitchStep('right', 0.1), true);
  assert.deepEqual(output.messages.at(-1), [0x90, 73, 0x00]);
  clock.tick(180);
  assert.deepEqual(output.messages.at(-1), [0x90, 73, 0x00], 'cancelled pulse cannot fire again');

  midi.pulsePitchStep('left', 0.1);
  midi.disconnect();
  await settle();
  assert.equal(feedback.at(-1).active, false);
  assert.equal(clock.tasks.size, 0);
  assert.deepEqual(output.messages.slice(-39), TOTAL_CONTROL_LED_NOTES.map(note => [0x90, note, 0x00]));

  await midi.connect();
  await settle();
  output.messages.length = 0;
  midi.pulsePitchStep('right', -0.1);
  input.emitMidi([0x90, 66, 0x7f]);
  assert.deepEqual(output.messages, [[0x90, 72, 0x7f], [0x90, 57, 0x7f]]);
  midi.destroy();
  await settle();
  assert.equal(clock.tasks.size, 0, 'component-style teardown cancels GUI pulse timers');
  assert.deepEqual(output.messages.slice(-39), TOTAL_CONTROL_LED_NOTES.map(note => [0x90, note, 0x00]));
  const messageCount = output.messages.length;
  clock.tick(180);
  assert.equal(output.messages.length, messageCount, 'teardown leaves no late LED writes');
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

// Author: Codex app agent, 2026-09-11
test('monitor inputs and PFL output are distinct from transport Cue', async () => {
  const { createTotalControlDispatcher } = await import('../js/midi/numark-total-control.mjs');
  const actions = [];
  const dispatcher = createTotalControlDispatcher(action => actions.push(action));
  for (const [note, deck] of [[0x30, 'left'], [0x37, 'right']]) {
    for (const channel of [0, 15]) {
      dispatcher.handle([0x90 + channel, note, 127]);
      dispatcher.handle([0x90 + channel, note, 127]);
      dispatcher.handle([0x90 + channel, note, 0]);
      dispatcher.handle([0x90 + channel, note, 127]);
      dispatcher.handle([0x80 + channel, note, 64]);
      assert.deepEqual(actions.splice(0), [{ type: 'pfl', deck }, { type: 'pfl', deck }]);
    }
  }
  for (const [cc, type] of [[22, 'monitorMix'], [15, 'monitorVolume']]) {
    for (const value of [0, 64, 127]) assert.deepEqual(decodeTotalControl([0xb0, cc, value]), { type, value: value / 127 });
  }
  for (const [note, deck] of [[51, 'left'], [60, 'right']]) assert.deepEqual(decodeTotalControl([0x90, note, 127]), { type: 'cue', deck });
  const state = getTotalControlLedState({ decks: { left: { pfl: true }, right: { pfl: false } } });
  assert.equal(state.get(0x35), true);
  assert.equal(state.get(0x40), false);
  assert.equal(state.get(0x3c), false);
  assert.equal(state.get(0x4c), false);
});
