class BeatRepeatProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Four seconds covers the longest supported two-beat slice at the detector's
    // conservative 40 BPM floor, including the deck's -8% rate limit.
    this.capacity = Math.ceil(sampleRate * 4);
    this.buffers = [new Float32Array(this.capacity), new Float32Array(this.capacity)];
    this.segmentFrames = 0;
    this.waitFrames = 0;
    this.writeFrame = 0;
    this.readFrame = 0;
    this.capturing = false;
    this.repeating = false;
    this.enabled = false;
    this.port.onmessage = (event) => {
      const data = event.data || {};
      if (data.type !== 'configure') return;
      const frames = Math.round(Number(data.segmentSeconds) * sampleRate);
      this.enabled = Boolean(data.enabled) && frames > 0 && frames <= this.capacity;
      this.segmentFrames = this.enabled ? frames : 0;
      this.waitFrames = this.enabled ? Math.max(0, Math.round(Number(data.waitSeconds) * sampleRate) || 0) : 0;
      this.writeFrame = 0;
      this.readFrame = 0;
      this.capturing = this.enabled && this.waitFrames === 0;
      this.repeating = false;
    };
  }

  process(inputs, outputs) {
    const input = inputs[0] || [];
    const output = outputs[0] || [];
    const frameCount = output[0] ? output[0].length : 128;
    for (let frame = 0; frame < frameCount; frame += 1) {
      if (this.enabled && !this.capturing && !this.repeating) {
        if (this.waitFrames > 0) this.waitFrames -= 1;
        else this.capturing = true;
      }
      for (let channel = 0; channel < output.length; channel += 1) {
        const source = input[channel] || input[0];
        const drySample = source ? source[frame] : 0;
        let sample = drySample;
        if (this.capturing && this.segmentFrames) {
          this.buffers[Math.min(channel, 1)][this.writeFrame] = drySample;
        } else if (this.repeating && this.segmentFrames) {
          sample = this.buffers[Math.min(channel, 1)][this.readFrame];
        }
        output[channel][frame] = sample;
      }
      if (this.capturing) {
        this.writeFrame += 1;
        if (this.writeFrame >= this.segmentFrames) {
          this.capturing = false;
          this.repeating = true;
          this.readFrame = 0;
        }
      } else if (this.repeating) {
        this.readFrame = (this.readFrame + 1) % this.segmentFrames;
      }
    }
    return true;
  }
}

registerProcessor('webdeck-beat-repeat', BeatRepeatProcessor);
