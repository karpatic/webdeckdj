/*
 * Main DJ Degara analysis coordinator. Private local integration only; see
 * ../../vendor/essentia-0.1.3/SOURCES.md. The original authored detector is frozen at
 * ../../posterity/beat-detector/index.html before this replacement.
 */
(function (global) {
  'use strict';

  const SAMPLE_RATE = 44100;

  const cache = new WeakMap();
  const queue = [];
  let activeJob = null;
  let nextJobId = 1;

  const dj = global.dj = global.dj || {};
  const beat = dj.beat = dj.beat || {};

  function abortError() {
    const error = new Error('Beat analysis cancelled.');
    error.name = 'AbortError';
    return error;
  }

  function emit(job, phase, message) {
    if (typeof job.onStatus === 'function') {
      job.onStatus({ phase: phase, message: message, jobId: job.id });
    }
  }

  function settleResolve(job, value) {
    if (job.clientSettled) return;
    job.clientSettled = true;
    job.resolve(value);
  }

  function settleReject(job, error) {
    if (job.clientSettled) return;
    job.clientSettled = true;
    job.reject(error);
  }

  function finishJob(job) {
    if (job.finished) return;
    job.finished = true;
    job.worker = null;
    if (activeJob === job) activeJob = null;
    Promise.resolve().then(pump);
  }

  function failJob(job, error) {
    if (!job.cancelled) {
      emit(job, 'error', String(error.message || error));
      settleReject(job, error);
    }
    if (job.worker) job.worker.terminate();
    finishJob(job);
  }

  function runWorker(job, mono) {
    if (job.cancelled) {
      finishJob(job);
      return;
    }

    job.stage = 'worker';
    emit(job, 'starting', 'Starting Degara worker…');
    const workerUrl = new URL('js/beat/degara-worker.js', document.baseURI);
    const worker = new Worker(workerUrl);
    job.worker = worker;
    const workerStartedAt = performance.now();
    let initMs = null;
    let startupMs = null;

    worker.onerror = function (event) {
      if (job.cancelled || job.finished) return;
      failJob(job, new Error(event.message || 'Degara worker failed.'));
    };

    worker.onmessage = function (event) {
      if (job.cancelled || job.finished) return;
      const data = event.data || {};
      if (data.type === 'ready') {
        initMs = data.initMs;
        startupMs = performance.now() - workerStartedAt;
        emit(job, 'analyzing', 'Analyzing the full song with Degara…');
        worker.postMessage({ mono: mono, sampleRate: SAMPLE_RATE, initMs: initMs }, [mono.buffer]);
        return;
      }
      if (data.type === 'error') {
        failJob(job, new Error(data.message || 'Degara analysis failed.'));
        return;
      }
      if (data.type !== 'result') return;

      const result = Object.assign({}, data, {
        startupMs: startupMs,
        analysisWindowSeconds: job.duration,
        reused: false
      });
      cache.set(job.file, result);
      emit(job, 'complete', 'Detected ' + result.bpm.toFixed(1) + ' BPM from ' + result.ticks.length + ' beats.');
      settleResolve(job, result);
      worker.terminate();
      finishJob(job);
    };
  }

  async function decodeAndStart(job) {
    try {
      job.stage = 'reading';
      emit(job, 'reading', 'Reading local audio…');
      const encoded = await job.file.arrayBuffer();
      if (job.cancelled) {
        finishJob(job);
        return;
      }

      const OfflineContext = global.OfflineAudioContext || global.webkitOfflineAudioContext;
      if (!OfflineContext) throw new Error('44.1 kHz offline audio decoding is unavailable.');
      job.stage = 'decoding';
      emit(job, 'decoding', 'Decoding locally at 44.1 kHz…');
      const decoder = new OfflineContext(1, 1, SAMPLE_RATE);
      const decoded = await decoder.decodeAudioData(encoded);
      if (job.cancelled) {
        finishJob(job);
        return;
      }
      if (!decoded || decoded.sampleRate !== SAMPLE_RATE || !decoded.length) {
        throw new Error('The browser did not produce usable 44.1 kHz PCM.');
      }

      job.stage = 'preparing';
      emit(job, 'preparing', 'Preparing full-song mono audio…');
      const sampleCount = decoded.length;
      job.duration = sampleCount / SAMPLE_RATE;
      const mono = new Float32Array(sampleCount);
      const channelCount = Math.max(1, decoded.numberOfChannels);
      for (let channel = 0; channel < channelCount; channel += 1) {
        const samples = decoded.getChannelData(channel);
        const scale = 1 / channelCount;
        for (let index = 0; index < sampleCount; index += 1) {
          mono[index] += samples[index] * scale;
        }
      }
      if (job.cancelled) {
        finishJob(job);
        return;
      }
      runWorker(job, mono);
    } catch (error) {
      failJob(job, error);
    }
  }

  function pump() {
    if (activeJob) return;
    let job = queue.shift();
    while (job && job.cancelled) {
      finishJob(job);
      job = queue.shift();
    }
    if (!job) return;
    activeJob = job;
    decodeAndStart(job);
  }

  function analyzeFile(file, onStatus) {
    if (!(file instanceof Blob) || !file.size) {
      const error = new Error('A readable local audio file is required.');
      return { promise: Promise.reject(error), cancel: function () {} };
    }

    const cached = cache.get(file);
    if (cached) {
      const reused = Object.assign({}, cached, { reused: true });
      if (typeof onStatus === 'function') {
        onStatus({ phase: 'cached', message: 'Reusing cached Degara beat map.', jobId: 0 });
      }
      return { promise: Promise.resolve(reused), cancel: function () {} };
    }

    let resolvePromise;
    let rejectPromise;
    const promise = new Promise(function (resolve, reject) {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    const job = {
      id: nextJobId,
      file: file,
      onStatus: onStatus,
      resolve: resolvePromise,
      reject: rejectPromise,
      worker: null,
      stage: 'queued',
      cancelled: false,
      clientSettled: false,
      finished: false
    };
    nextJobId += 1;
    queue.push(job);
    emit(job, 'queued', activeJob ? 'Beat analysis queued…' : 'Beat analysis starting…');
    pump();

    return {
      promise: promise,
      cancel: function () {
        if (job.cancelled || job.finished) return;
        job.cancelled = true;
        emit(job, 'cancelled', 'Beat analysis cancelled.');
        settleReject(job, abortError());
        if (job.worker) {
          job.worker.terminate();
          finishJob(job);
        } else if (activeJob !== job) {
          finishJob(job);
        }
        // Native file reading/decode cannot be interrupted. A cancelled decoding job
        // retains the sole decode slot until its stale result settles, then is discarded.
      }
    };
  }

  beat.sampleRate = SAMPLE_RATE;
  beat.analysisWindowSeconds = null; // No duration cap; each result records its actual analyzed duration.
  beat.analyzeFile = analyzeFile;
  beat.getCachedAnalysis = function (file) { return cache.get(file) || null; };
}(window));
