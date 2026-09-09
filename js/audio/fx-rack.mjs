export const EFFECT_NAMES = ['Filter', 'Echo', 'Reverb', 'Flanger', 'Phaser', 'Beat Repeat'];

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
export const getBeatRepeatTiming = (beat, amount) => {
  const bpm = beat && Number(beat.bpm);
  const sourceBpm = beat && Number(beat.sourceBpm);
  const rate = beat && Number(beat.rate);
  const anchor = beat && Number(beat.anchor);
  const mediaTime = beat && Number(beat.mediaTime);
  if (!(amount > 0) || !(bpm > 0) || !(sourceBpm > 0) || !(rate > 0) ||
      !Number.isFinite(anchor) || !Number.isFinite(mediaTime)) {
    return { segmentSeconds: 0, waitSeconds: 0 };
  }
  const division = amount < 0.34 ? 2 : amount < 0.67 ? 4 : 8;
  const segmentSeconds = 60 / bpm * 4 / division;
  const sourceSegmentSeconds = 60 / sourceBpm * 4 / division;
  const elapsed = mediaTime - anchor;
  const waitSeconds = ((sourceSegmentSeconds - elapsed % sourceSegmentSeconds) % sourceSegmentSeconds) / rate;
  return { segmentSeconds, waitSeconds };
};
const ramp = (parameter, value, context, seconds = 0.025) => {
  const now = context.currentTime;
  parameter.cancelScheduledValues(now);
  parameter.setTargetAtTime(value, now, seconds);
};

const makeImpulse = context => {
  const length = Math.min(Math.ceil(context.sampleRate * 1.8), context.sampleRate * 2);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  let seed = 0x4f1bbcdc;
  for (let channel = 0; channel < 2; channel += 1) {
    const samples = impulse.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const noise = seed / 0x80000000 - 1;
      samples[index] = noise * Math.pow(1 - index / length, 2.6);
    }
  }
  return impulse;
};

let workletContexts = new WeakMap();
const prepareWorklet = context => {
  if (!context.audioWorklet) return Promise.resolve(false);
  let pending = workletContexts.get(context);
  if (!pending) {
    pending = context.audioWorklet.addModule(new URL('./fx-worklet.mjs', import.meta.url)).then(() => true).catch(() => false);
    workletContexts.set(context, pending);
  }
  return pending;
};

class EffectSlot {
  constructor(context, impulse, hasWorklet) {
    this.context = context;
    this.impulse = impulse;
    this.hasWorklet = hasWorklet;
    this.input = context.createGain();
    this.output = context.createGain();
    this.dry = context.createGain();
    this.wet = context.createGain();
    this.input.connect(this.dry);
    this.dry.connect(this.output);
    this.wet.connect(this.output);
    this.dry.gain.value = 1;
    this.wet.gain.value = 0;
    this.effectName = EFFECT_NAMES[0];
    this.strength = 0;
    this.beat = null;
    this.effect = null;
    this.select(this.effectName);
  }

  destroyEffect() {
    if (!this.effect) return;
    this.input.disconnect(this.effect.input);
    this.effect.output.disconnect(this.wet);
    if (this.effect.stop) this.effect.stop();
    this.effect = null;
  }

  select(name) {
    if (!EFFECT_NAMES.includes(name)) return;
    this.destroyEffect();
    this.effectName = name;
    this.strength = 0;
    const now = this.context.currentTime;
    this.wet.gain.cancelScheduledValues(now);
    this.wet.gain.setValueAtTime(0, now);
    ramp(this.dry.gain, 1, this.context);
    this.effect = this.createEffect(name);
    this.input.connect(this.effect.input);
    this.effect.output.connect(this.wet);
    this.applyParameters();
  }

  createEffect(name) {
    const context = this.context;
    if (name === 'Filter') {
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 18000;
      filter.Q.value = 0.7;
      return { input: filter, output: filter, filter };
    }
    if (name === 'Echo') {
      const input = context.createGain();
      const output = context.createGain();
      const delay = context.createDelay(1);
      const feedback = context.createGain();
      input.connect(delay); delay.connect(output); delay.connect(feedback); feedback.connect(delay);
      delay.delayTime.value = 0.28; feedback.gain.value = 0.25;
      return { input, output, delay, feedback };
    }
    if (name === 'Reverb') {
      const convolver = context.createConvolver();
      convolver.buffer = this.impulse;
      return { input: convolver, output: convolver, convolver };
    }
    if (name === 'Flanger') {
      const input = context.createGain();
      const output = context.createGain();
      const delay = context.createDelay(0.05);
      const feedback = context.createGain();
      const oscillator = context.createOscillator();
      const depth = context.createGain();
      input.connect(delay); delay.connect(output); delay.connect(feedback); feedback.connect(delay);
      oscillator.connect(depth); depth.connect(delay.delayTime);
      delay.delayTime.value = 0.006; feedback.gain.value = 0.25;
      oscillator.frequency.value = 0.22; depth.gain.value = 0.0035; oscillator.start();
      return { input, output, delay, feedback, oscillator, depth, stop: () => oscillator.stop() };
    }
    if (name === 'Phaser') {
      const input = context.createGain();
      const output = context.createGain();
      const oscillator = context.createOscillator();
      const depth = context.createGain();
      const filters = [];
      let previous = input;
      for (let index = 0; index < 4; index += 1) {
        const filter = context.createBiquadFilter();
        filter.type = 'allpass'; filter.frequency.value = 700 + index * 260; filter.Q.value = 0.8;
        previous.connect(filter); previous = filter; filters.push(filter);
      }
      previous.connect(output); oscillator.connect(depth);
      filters.forEach(filter => depth.connect(filter.frequency));
      oscillator.frequency.value = 0.16; depth.gain.value = 420; oscillator.start();
      return { input, output, oscillator, depth, filters, stop: () => oscillator.stop() };
    }
    if (name === 'Beat Repeat' && this.hasWorklet) {
      const worklet = new AudioWorkletNode(context, 'webdeck-beat-repeat', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2]
      });
      return { input: worklet, output: worklet, worklet };
    }
    const passthrough = context.createGain();
    return { input: passthrough, output: passthrough, unavailable: true };
  }

  setStrength(value) {
    this.strength = clamp01(value);
    this.applyParameters();
  }

  setBeat(beat) {
    const previous = this.beat;
    this.beat = beat;
    const rhythmChanged = !previous || !beat || previous.bpm !== beat.bpm ||
      previous.sourceBpm !== beat.sourceBpm || previous.anchor !== beat.anchor || previous.rate !== beat.rate;
    if (this.effectName === 'Beat Repeat' && rhythmChanged) this.applyParameters();
  }

  applyParameters() {
    const amount = this.strength;
    const context = this.context;
    const effect = this.effect;
    const availableBeat = this.effectName !== 'Beat Repeat' || Boolean(this.beat && this.hasWorklet && !effect.unavailable);
    const activeAmount = availableBeat ? amount : 0;
    ramp(this.dry.gain, Math.cos(activeAmount * Math.PI / 2), context);
    ramp(this.wet.gain, Math.sin(activeAmount * Math.PI / 2), context);
    if (this.effectName === 'Filter') {
      const cutoff = 18000 * Math.pow(350 / 18000, amount);
      ramp(effect.filter.frequency, cutoff, context, 0.04);
      ramp(effect.filter.Q, 0.7 + amount * 5, context, 0.04);
    } else if (this.effectName === 'Echo') {
      ramp(effect.delay.delayTime, 0.32 - amount * 0.14, context, 0.04);
      ramp(effect.feedback.gain, 0.18 + amount * 0.47, context, 0.04);
    } else if (this.effectName === 'Flanger') {
      ramp(effect.feedback.gain, 0.18 + amount * 0.42, context, 0.04);
      ramp(effect.depth.gain, 0.0015 + amount * 0.004, context, 0.04);
      effect.oscillator.frequency.setTargetAtTime(0.12 + amount * 0.65, context.currentTime, 0.04);
    } else if (this.effectName === 'Phaser') {
      ramp(effect.depth.gain, 180 + amount * 720, context, 0.04);
      effect.oscillator.frequency.setTargetAtTime(0.1 + amount * 0.8, context.currentTime, 0.04);
    } else if (this.effectName === 'Beat Repeat' && effect.worklet) {
      const timing = getBeatRepeatTiming(this.beat, activeAmount);
      const segmentSeconds = timing.segmentSeconds;
      const waitSeconds = timing.waitSeconds;
      effect.worklet.port.postMessage({ type: 'configure', enabled: segmentSeconds > 0, segmentSeconds, waitSeconds });
    }
  }

  isAvailable() {
    return this.effectName !== 'Beat Repeat' || Boolean(this.beat && this.hasWorklet && !this.effect.unavailable);
  }

  destroy() {
    this.destroyEffect();
    this.input.disconnect(); this.dry.disconnect(); this.wet.disconnect(); this.output.disconnect();
  }
}

export async function createDeckFxRack(context) {
  const hasWorklet = await prepareWorklet(context);
  const impulse = makeImpulse(context);
  const slots = [new EffectSlot(context, impulse, hasWorklet), new EffectSlot(context, impulse, hasWorklet)];
  slots[0].output.connect(slots[1].input);
  return {
    input: slots[0].input,
    output: slots[1].output,
    select(slot, effect) { if (slots[slot]) slots[slot].select(effect); },
    setStrength(slot, value) { if (slots[slot]) slots[slot].setStrength(value); },
    setBeat(beat) { slots.forEach(item => item.setBeat(beat)); },
    isAvailable(slot) { return Boolean(slots[slot] && slots[slot].isAvailable()); },
    destroy() {
      slots[0].output.disconnect(slots[1].input);
      slots.forEach(item => item.destroy());
    }
  };
}
