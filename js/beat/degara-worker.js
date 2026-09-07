/*
 * Private local main-DJ integration of Essentia.js 0.1.3 / Degara.
 * Essentia.js is AGPL-3.0-or-later; redistribution review is outstanding.
 * See ../../vendor/essentia-0.1.3/SOURCES.md. This worker invents no beat grid:
 * every returned tick is an actual Degara result within the analyzed PCM window.
 */
(function () {
  'use strict';

  const bootStart = performance.now();
  let engine = null;

  try {
    self.exports = {};
    importScripts(
      '../../vendor/essentia-0.1.3/essentia-wasm.umd.js',
      '../../vendor/essentia-0.1.3/essentia.js-core.umd.js'
    );
    engine = new Essentia(exports.EssentiaWASM);
    if (typeof engine.RhythmExtractor2013 !== 'function') {
      throw new Error('Degara is unavailable in the pinned Essentia build.');
    }
    postMessage({ type: 'ready', initMs: performance.now() - bootStart });
  } catch (error) {
    postMessage({ type: 'error', message: String(error.message || error) });
    if (engine) engine.shutdown();
    close();
    return;
  }

  onmessage = function (event) {
    const data = event.data || {};
    let input = null;
    let result = null;

    try {
      const mono = data.mono;
      if (data.sampleRate !== 44100 || !(mono instanceof Float32Array) || !mono.length) {
        throw new Error('Expected non-empty mono Float32 PCM at 44,100 Hz.');
      }

      const startedAt = performance.now();
      input = engine.arrayToVector(mono);
      const algorithmStartedAt = performance.now();
      result = engine.RhythmExtractor2013(input, 208, 'degara', 40);
      const algorithmMs = performance.now() - algorithmStartedAt;
      const seconds = mono.length / 44100;
      const rawTicks = result.ticks.size() ? Array.from(engine.vectorToArray(result.ticks)) : [];
      const ticks = rawTicks.filter(function (tick) {
        return Number.isFinite(tick) && tick >= 0 && tick < seconds;
      });
      const bpm = Number(result.bpm);

      if (!Number.isFinite(bpm) || bpm <= 0 || ticks.length < 2) {
        throw new Error('Degara did not return a usable tempo and beat map.');
      }

      postMessage({
        type: 'result',
        method: 'degara',
        bpm: bpm,
        confidence: null,
        ticks: ticks,
        sampleRate: 44100,
        startSample: 0,
        sampleCount: mono.length,
        seconds: seconds,
        algorithmMs: algorithmMs,
        workerMs: performance.now() - startedAt,
        initMs: data.initMs || null,
        wasmHeapBytes: exports.EssentiaWASM.HEAPU8.length
      });
    } catch (error) {
      postMessage({ type: 'error', message: String(error.message || error) });
    } finally {
      if (result) {
        Object.values(result).forEach(function (value) {
          if (value && typeof value.delete === 'function') value.delete();
        });
      }
      if (input) input.delete();
      if (engine) engine.shutdown();
      close();
    }
  };
}());
