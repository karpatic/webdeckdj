window.dj = window.dj || {};
// One output owner: stereo master normally, discrete mono cue/master for a splitter.
const createOutputRouter = (context) => {
  const gain = (value = 1) => {
    const node = context.createGain();
    node.gain.value = value;
    return node;
  };
  const master = gain();
  const stereo = gain();
  const cue = gain();
  const cueLevel = gain();
  const cueBlend = gain();
  const masterBlend = gain(0);
  const split = gain(0);
  const merger = context.createChannelMerger(2);
  // Explicit speaker downmix is (L + R) / 2, and retains unity for mono inputs.
  const mono = () => {
    const node = gain();
    node.channelCount = 1;
    node.channelCountMode = 'explicit';
    node.channelInterpretation = 'speakers';
    return node;
  };
  const cueMono = mono();
  const masterMono = mono();
  master.connect(stereo).connect(context.destination);
  master.connect(masterMono);
  cue.connect(cueBlend).connect(cueLevel);
  master.connect(masterBlend).connect(cueLevel);
  cueLevel.connect(cueMono).connect(merger, 0, 0);
  masterMono.connect(merger, 0, 1);
  split.channelCount = 2;
  split.channelCountMode = 'explicit';
  split.channelInterpretation = 'discrete';
  merger.connect(split).connect(context.destination);
  const pfl = { left: gain(0), right: gain(0) };
  pfl.left.connect(cue);
  pfl.right.connect(cue);
  const set = (node, value) => node.gain.setTargetAtTime(value, context.currentTime, 0.005);
  return {
    master, pfl,
    update({ enabled = false, left = false, right = false, mix = 0, volume = 1, masterVolume = 1 }) {
      set(stereo, enabled ? 0 : 1);
      set(split, enabled ? 1 : 0);
      // Average selected decks to retain headroom when both are cued.
      const count = Number(left) + Number(right);
      set(pfl.left, left ? 1 / count : 0);
      set(pfl.right, right ? 1 / count : 0);
      set(cueBlend, 1 - mix);
      set(masterBlend, mix);
      set(cueLevel, volume);
      set(master, masterVolume);
    }
  };
};
window.dj.createOutputRouter = createOutputRouter;
let _outputRouter = null;
const getOutputRouter = () => _outputRouter || (_outputRouter = window.dj.createOutputRouter(window.dj.audio.getAudioContext()));
const sampleSources = new WeakMap();
const routeSample = (element) => {
  if (!sampleSources.has(element)) {
    const source = window.dj.audio.getAudioContext().createMediaElementSource(element);
    source.connect(getOutputRouter().master);
    sampleSources.set(element, source);
  }
  window.dj.audio.resumeAudioContext();
};

window.dj.getOutputRouter = getOutputRouter;
window.dj.routeSample = routeSample;
