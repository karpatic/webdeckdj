/* Beat Lab — AGPL-3.0-or-later. One disposable worker per analysis. */
const method = new URLSearchParams(self.location.search).get('engine') || 'degara';
const bootStart = performance.now();
let engine;
try {
  if (method === 'degara') {
    // The pinned UMD WASM bundle includes the binary and ends with exports.EssentiaWASM.
    self.exports = {};
    importScripts('vendor/essentia-wasm.umd.js', 'vendor/essentia.js-core.umd.js');
    engine = new Essentia(exports.EssentiaWASM);
    if (typeof engine.RhythmExtractor2013 !== 'function') throw new Error('Degara unavailable.');
  } else if (method === 'music-tempo') {
    importScripts('vendor/music-tempo-1.0.3.min.js');
    if (typeof MusicTempo !== 'function') throw new Error('music-tempo unavailable.');
  } else throw new Error('Unknown engine.');
  postMessage({type: 'ready', initMs: performance.now() - bootStart, methods: [method]});
} catch (error) {
  postMessage({type: 'error', message: String(error.message || error)});
  engine?.shutdown();
  close();
}
onmessage = ({data}) => {
  let input, result;
  try {
    const {channels} = data;
    if (data.method !== method || data.sampleRate !== 44100 ||
        !channels?.length || channels.length > 2 || !(channels[0] instanceof Float32Array) ||
        !channels[0].length || channels[0].length > 44100 * 90)
      throw new Error('Expected at most 90 seconds of mono/stereo 44.1 kHz PCM.');
    const start = performance.now();
    // Identical Float32 downmix for both engines, from the same cached decoded prefix.
    const mono = channels[0];
    if (channels.length === 2) {
      if (!(channels[1] instanceof Float32Array) || channels[1].length !== mono.length)
        throw new Error('Channel length mismatch.');
      for (let i = 0; i < mono.length; i++) mono[i] = (mono[i] + channels[1][i]) * 0.5;
    }
    let bpm, ticks, algorithmMs;
    if (method === 'degara') {
      input = engine.arrayToVector(mono);
      const algorithmStart = performance.now();
      result = engine.RhythmExtractor2013(input, 208, 'degara', 40);
      algorithmMs = performance.now() - algorithmStart;
      bpm = result.bpm;
      // vectorToArray throws for empty vectors in 0.1.3; check size first.
      ticks = result.ticks.size() ? Array.from(engine.vectorToArray(result.ticks)) : [];
    } else {
      const algorithmStart = performance.now();
      // 1.0.3 uses hopSize=441 and timeStep=0.01, not a sampleRate parameter.
      // Match Degara's configured 40–208 BPM induction range; all other defaults retained.
      const analysis = new MusicTempo(mono, {
        hopSize: 441, timeStep: 441 / 44100, minBeatInterval: 60 / 208, maxBeatInterval: 60 / 40
      });
      algorithmMs = performance.now() - algorithmStart;
      bpm = Number(analysis.tempo); // Upstream returns a string rounded to 3 decimal places.
      ticks = Array.from(analysis.beats);
    }
    if (!Number.isFinite(bpm) || bpm <= 0 || ticks.some(tick => !Number.isFinite(tick)))
      throw new Error('Engine did not return a usable tempo/beat result.');
    postMessage({type: 'result', method, bpm, confidence: null, ticks,
      sampleRate: 44100, startSample: 0, sampleCount: mono.length,
      seconds: mono.length / 44100, algorithmMs, workerMs: performance.now() - start,
      wasmHeapBytes: method === 'degara' ? exports.EssentiaWASM.HEAPU8.length : null});
  } catch (error) {
    postMessage({type: 'error', message: String(error.message || error)});
  } finally {
    if (result) for (const value of Object.values(result))
      if (value && typeof value.delete === 'function') value.delete();
    input?.delete();
    engine?.shutdown();
    close();
  }
};
