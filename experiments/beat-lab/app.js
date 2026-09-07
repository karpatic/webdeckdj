/* Beat Lab — AGPL-3.0-or-later. Standalone; no DJ imports or storage. */
'use strict';
const $ = (selector, root = document) => root.querySelector(selector);
const SAMPLE_RATE = 44100;
const ENGINE_NAMES = {degara: 'Essentia · Degara', 'music-tempo': 'music-tempo · BeatRoot JS'};
let context, activeJob = null;
const tracks = [];
function audioContext() {
  if (!context) context = new AudioContext();
  return context;
}
function status(t, text) { $('.status', t.el).textContent = text; }
function updateControls() {
  for (const t of tracks) {
    $('.analyze', t.el).disabled = !t.file || !t.valid || !!activeJob;
    $('.cancel', t.el).disabled = activeJob?.track !== t || activeJob.cancelled;
    for (const name of ['play', 'pause', 'stop', 'seek']) $('.' + name, t.el).disabled = !t.buffer;
    for (const name of ['bpm', 'half', 'double', 'offset', 'reset']) $('.' + name, t.el).disabled = !t.result?.ticks.length;
  }
  $('#sync').disabled = !tracks.every(t => t.result?.ticks.length > 1 && t.buffer);
}
function clearClicks(t) {
  for (const node of t.clickNodes) { try { node.stop(); } catch (_) {} node.disconnect(); }
  t.clickNodes.clear();
  t.scheduledUntil = -Infinity;
}
function position(t) {
  if (!t.source) return t.position;
  return Math.min(t.buffer.duration, t.position + Math.max(0, context.currentTime - t.startedAt) * t.rate);
}
function pause(t) {
  t.transportId++;
  t.position = position(t);
  const source = t.source;
  t.source = null;
  if (source) { source.onended = null; try { source.stop(); } catch (_) {} source.disconnect(); }
  clearClicks(t);
}
function stop(t) { pause(t); t.position = 0; }
function playAt(t, when, offset = t.position) {
  pause(t);
  const ac = audioContext();
  t.position = Math.max(0, Math.min(offset, t.buffer.duration - 0.001));
  t.startedAt = when;
  const source = ac.createBufferSource();
  source.buffer = t.buffer;
  source.playbackRate.value = t.rate;
  source.connect(t.gain || (t.gain = ac.createGain()));
  t.gain.gain.value = Number($('.volume', t.el).value);
  t.gain.connect(ac.destination);
  t.source = source;
  source.onended = () => { if (t.source === source) { pause(t); t.position = t.buffer.duration; } };
  source.start(when, t.position);
}
async function play(t) {
  if (!t.buffer) return;
  const generation = t.generation;
  const transportId = ++t.transportId;
  try {
    await audioContext().resume();
    if (generation !== t.generation || transportId !== t.transportId || !t.buffer) return;
    playAt(t, context.currentTime + 0.03, position(t) >= t.buffer.duration - 0.02 ? 0 : position(t));
  } catch (e) { status(t, 'Playback error: ' + e.message); }
}
function cancelAnalysis(t) {
  const job = activeJob;
  if (!job || job.track !== t) return;
  job.cancelled = true;
  clearTimeout(job.timer);
  if (job.worker) { job.worker.terminate(); activeJob = null; status(t, 'Cancelled — worker terminated. Previous completed result retained.'); }
  else status(t, 'Cancelled — discarding native decode when it returns; new analysis waits.');
  updateControls();
}
function finishJob(job) {
  clearTimeout(job.timer);
  job.worker?.terminate();
  if (activeJob === job) activeJob = null;
  updateControls();
}
async function loadFile(t, file) {
  cancelAnalysis(t); stop(t); t.generation++;
  t.metadataCleanup?.();
  t.file = null; t.valid = false; t.buffer = null; t.result = null; t.history = []; t.runNumber = 0;
  t.ticks = []; t.rate = 1; t.duration = 0;
  $('.bpm', t.el).value = ''; $('.offset', t.el).value = '0';
  $('.metrics', t.el).textContent = 'No measured result yet.';
  $('.history', t.el).replaceChildren(Object.assign(document.createElement('li'), {textContent: 'No completed runs.'}));
  updateControls();
  if (!file) { status(t, 'Choose a local audio file.'); return; }
  if (!file.size) { status(t, 'Choose a nonempty audio file.'); return; }
  const generation = t.generation;
  // Metadata-only preflight, never played. Revoke the blob URL on all completion paths.
  const media = document.createElement('audio');
  const url = URL.createObjectURL(file);
  const cleanup = () => { clearTimeout(timer); media.onloadedmetadata = media.onerror = null; media.removeAttribute('src'); media.load(); URL.revokeObjectURL(url); if (t.metadataCleanup === cleanup) t.metadataCleanup = null; };
  const timer = setTimeout(() => { cleanup(); if (generation === t.generation) status(t, 'Metadata timed out. Try an ordinary MP3 or WAV excerpt.'); }, 15000);
  t.metadataCleanup = cleanup;
  media.preload = 'metadata';
  media.onloadedmetadata = () => {
    const duration = media.duration; cleanup();
    if (generation !== t.generation) return;
    if (!Number.isFinite(duration) || duration <= 0) {
      status(t, 'Could not read a valid audio duration.'); return;
    }
    t.file = file; t.valid = true; t.duration = duration;
    status(t, `${file.name} · ${duration.toFixed(2)} s · ready to Analyze (no autoplay).`);
    updateControls();
  };
  media.onerror = () => { cleanup(); if (generation === t.generation) status(t, 'Cannot read audio metadata; try MP3 or WAV.'); };
  media.src = url;
  status(t, `Reading metadata: ${file.name}`);
}
function resultText(data) {
  return `Run #${data.runNumber} · ${ENGINE_NAMES[data.method]} · ${data.bpm.toFixed(3)} BPM · confidence unavailable\n` +
    `Window [0, ${data.seconds.toFixed(6)}) s · samples [0, ${data.sampleCount}) @ ${data.sampleRate} Hz mono · ${data.ticks.length} ticks` +
    (data.ticks.length ? ` · first ${data.ticks[0].toFixed(6)} s` : '') + '\n' +
    `Compute ${(data.algorithmMs / 1000).toFixed(3)} s · worker ${(data.workerMs / 1000).toFixed(3)} s · startup ${data.startupMs.toFixed(0)} ms (library init ${data.initMs.toFixed(0)} ms) · total ${(data.totalMs / 1000).toFixed(3)} s · ${data.reusedDecode ? 'reused decode' : 'includes file read/decode'}`;
}
function renderHistory(t) {
  $('.history', t.el).replaceChildren(...t.history.map(data => {
    const li = document.createElement('li');
    const peer = t.history.find(other => other.method !== data.method &&
      other.sampleCount === data.sampleCount && other.sampleRate === data.sampleRate && other.startSample === data.startSample);
    const label = document.createElement('span');
    label.textContent = resultText(data) + (peer ? ` · Same input/window as run #${peer.runNumber}. ` : ' · No other-engine run for this exact window yet. ');
    const button = document.createElement('button');
    button.textContent = t.result === data ? 'Selected beat map' : 'Use this beat map';
    button.disabled = t.result === data;
    button.onclick = () => {
      selectResult(t, data);
      status(t, `Selected run #${data.runNumber} — original detected ticks restored; no reanalysis. Playback position/rate unchanged.`);
    };
    li.append(label, button);
    return li;
  }));
}
function selectResult(t, data) {
  t.result = data;
  $('.bpm', t.el).value = ''; $('.offset', t.el).value = '0';
  rebuildTicks(t);
  $('.metrics', t.el).textContent = 'Selected beat map · ' + resultText(data);
  renderHistory(t);
  updateControls();
  $('#sync-status').textContent = 'Beat map changed. Playback rates unchanged; align again if needed.';
}
async function analyze(t) {
  if (activeJob || !t.file || !t.valid) return;
  const job = {track: t, generation: t.generation, cancelled: false, start: performance.now(), reusedDecode: !!t.buffer};
  activeJob = job; updateControls();
  const method = $('.engine', t.el).value;
  const seconds = Number($('#window').value);
  const current = () => !job.cancelled && job.generation === t.generation && activeJob === job;
  try {
    status(t, 'Decoding locally to 44,100 Hz…');
    if (!t.buffer) {
      const file = t.file;
      const encoded = await file.arrayBuffer();
      if (!current()) { finishJob(job); return; }
      // decodeAudioData resamples to the offline context's sample rate. No audible context needed.
      const decoder = new OfflineAudioContext(1, 1, SAMPLE_RATE);
      const decoded = await decoder.decodeAudioData(encoded);
      if (!current()) { finishJob(job); return; }
      if (decoded.numberOfChannels > 2 || decoded.sampleRate !== SAMPLE_RATE)
        throw new Error('Analysis requires mono/stereo audio decoded at 44.1 kHz.');
      t.buffer = decoded;
      $('.seek', t.el).max = decoded.duration;
    }
    updateControls();
    const length = Math.min(t.buffer.length, seconds * SAMPLE_RATE);
    const channels = Array.from({length: t.buffer.numberOfChannels}, (_, i) => t.buffer.getChannelData(i).slice(0, length));
    job.workerStart = performance.now();
    const worker = job.worker = new Worker(`analysis-worker.js?engine=${encodeURIComponent(method)}`);
    status(t, `Starting ${ENGINE_NAMES[method]} · first ${(length / SAMPLE_RATE).toFixed(1)} s…`);
    job.timer = setTimeout(() => { if (current()) { cancelAnalysis(t); status(t, 'Analysis exceeded 120 s; worker terminated. Try a 30-second window.'); } }, 120000);
    worker.onerror = event => { if (current()) { status(t, 'Worker failed: ' + event.message); finishJob(job); } };
    worker.onmessage = ({data}) => {
      if (!current()) return;
      if (data.type === 'ready') {
        if (!data.methods.includes(method)) { status(t, 'Method unavailable in this build.'); finishJob(job); return; }
        job.startupMs = performance.now() - job.workerStart; job.initMs = data.initMs;
        status(t, `Analyzing ${ENGINE_NAMES[method]} in a disposable worker…`);
        worker.postMessage({channels, method, sampleRate: SAMPLE_RATE}, channels.map(c => c.buffer));
      } else if (data.type === 'error') { status(t, 'Analysis error: ' + data.message); finishJob(job); }
      else if (data.type === 'result') {
        data.totalMs = performance.now() - job.start; data.startupMs = job.startupMs; data.initMs = job.initMs;
        data.reusedDecode = job.reusedDecode; data.runNumber = ++t.runNumber;
        t.history.push(data); t.history = t.history.slice(-8);
        selectResult(t, data);
        status(t, data.ticks.length > 1 ? 'Complete. Listen to check beat phase; this is an estimate, not ground truth.' : 'No usable beat grid found. Try another excerpt or engine.');
        finishJob(job);
      }
    };
  } catch (e) { if (current()) status(t, 'Analysis failed: ' + e.message); finishJob(job); }
}
function effectiveBpm(t) {
  const manual = Number($('.bpm', t.el).value);
  return Number.isFinite(manual) && manual >= 20 && manual <= 400 ? manual : t.result?.bpm;
}
function rebuildTicks(t) {
  clearClicks(t);
  if (!t.result) return;
  const input = $('.bpm', t.el), offsetInput = $('.offset', t.el);
  const manual = Number(input.value);
  if (input.value && (!Number.isFinite(manual) || manual < 20 || manual > 400)) { input.value = ''; status(t, 'Manual BPM must be 20–400; restored detected ticks.'); }
  const offset = Math.max(-2000, Math.min(2000, Number(offsetInput.value) || 0)) / 1000;
  offsetInput.value = offset * 1000;
  const end = t.result.seconds;
  if (input.value && t.result.ticks.length) {
    const step = 60 / manual, anchor = t.result.ticks[0] + offset;
    t.ticks = [];
    for (let at = anchor; at < end; at += step) if (at >= 0) t.ticks.push(at);
  } else t.ticks = t.result.ticks.map(at => at + offset).filter(at => at >= 0 && at < end);
  $('canvas', t.el).setAttribute('aria-label', `${t.ticks.length} ${input.value ? 'manual uniform' : 'detected'} beat ticks over ${end.toFixed(1)} seconds, offset ${offset * 1000} milliseconds`);
}
function draw(t) {
  const canvas = $('canvas', t.el), g = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  const end = t.result?.seconds || t.duration || 60, p = position(t);
  g.clearRect(0, 0, w, h);
  g.font = '15px monospace';
  for (let s = 0; s <= end; s += 10) { const x = s / end * w; g.strokeStyle = '#29343f'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); g.fillStyle = '#8b9baa'; g.fillText(`${s}s`, x + 3, h - 8); }
  g.strokeStyle = t.id === 'A' ? '#68d7c0' : '#91a9ff';
  g.beginPath(); for (const tick of t.ticks) { const x = tick / end * w; g.moveTo(x, 12); g.lineTo(x, 75); } g.stroke();
  if (p <= end) { g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(p / end * w, 0); g.lineTo(p / end * w, h); g.stroke(); }
  $('.clock', t.el).textContent = `${p.toFixed(2)} / ${(t.buffer?.duration || t.duration || 0).toFixed(2)} s · ${t.rate.toFixed(3)}×`;
  if (document.activeElement !== $('.seek', t.el)) $('.seek', t.el).value = p;
}
function scheduleClicks(t) {
  if (!context || !t.source || !$('.clicks', t.el).checked || document.hidden) return;
  const now = context.currentTime, horizon = now + 0.12;
  for (const tick of t.ticks) {
    if (tick < t.position) continue;
    const at = t.startedAt + (tick - t.position) / t.rate;
    if (at < now + 0.005 || at <= t.scheduledUntil || at > horizon) continue;
    const osc = context.createOscillator(), gain = context.createGain();
    osc.frequency.value = t.id === 'A' ? 1300 : 1800;
    gain.gain.setValueAtTime(0.06, at); gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.025);
    osc.connect(gain); gain.connect(context.destination);
    t.clickNodes.add(osc);
    osc.onended = () => { t.clickNodes.delete(osc); osc.disconnect(); gain.disconnect(); };
    osc.start(at); osc.stop(at + 0.03); t.scheduledUntil = at;
  }
}
for (const id of ['A', 'B']) {
  const el = $('#track-template').content.firstElementChild.cloneNode(true);
  const t = {id, el, generation: 0, transportId: 0, file: null, buffer: null, result: null, ticks: [], history: [], runNumber: 0, source: null, clickNodes: new Set(), rate: 1, position: 0};
  tracks.push(t); $('#tracks').append(el); $('h2', el).textContent = `Track ${id}`;
  $('.file', el).onchange = event => loadFile(t, event.target.files[0]);
  $('.analyze', el).onclick = () => analyze(t);
  $('.cancel', el).onclick = () => cancelAnalysis(t);
  $('.play', el).onclick = () => play(t);
  $('.pause', el).onclick = () => pause(t);
  $('.stop', el).onclick = () => stop(t);
  $('.seek', el).oninput = event => { const playing = !!t.source; pause(t); t.position = Number(event.target.value); if (playing) playAt(t, context.currentTime + 0.01); };
  $('.volume', el).oninput = event => { if (t.gain) t.gain.gain.value = Number(event.target.value); };
  $('.clicks', el).onchange = () => clearClicks(t);
  for (const field of ['bpm', 'offset']) $('.' + field, el).onchange = () => rebuildTicks(t);
  for (const [name, factor] of [['half', 0.5], ['double', 2]]) $('.' + name, el).onclick = () => { $('.bpm', el).value = Math.max(20, Math.min(400, effectiveBpm(t) * factor)).toFixed(3); rebuildTicks(t); };
  $('.reset', el).onclick = () => { $('.bpm', el).value = ''; $('.offset', el).value = '0'; rebuildTicks(t); };
}
$('#sync').onclick = async () => {
  const [a, b] = tracks, out = $('#sync-status');
  if (!a.source || !a.result || !b.result) { out.textContent = 'Play A first; both tracks must be analyzed.'; return; }
  const aSource = a.source, bTransport = b.transportId, aResult = a.result, bResult = b.result;
  await audioContext().resume();
  if (a.source !== aSource || b.transportId !== bTransport || a.result !== aResult || b.result !== bResult) { out.textContent = 'Transport or beat map changed; alignment cancelled.'; return; }
  const rate = effectiveBpm(a) * a.rate / effectiveBpm(b);
  if (!Number.isFinite(rate) || rate < 0.5 || rate > 2) { out.textContent = 'Rate outside 0.5–2×. Correct half/double BPM first.'; return; }
  const nextA = a.ticks.find(tick => tick > position(a) + 0.18 * a.rate);
  const nextB = b.ticks.find(tick => tick >= position(b));
  if (nextA === undefined || nextB === undefined) { out.textContent = 'No next analyzed beat here. Seek both tracks back inside their analysis windows.'; return; }
  const when = a.startedAt + (nextA - a.position) / a.rate;
  pause(b); b.rate = rate; playAt(b, when, nextB);
  out.textContent = `One-shot: B ${nextB.toFixed(3)} s → A ${nextA.toFixed(3)} s; B rate ${rate.toFixed(5)}×. No ongoing lock.`;
};
$('#rate-reset').onclick = () => { const b = tracks[1], playing = !!b.source; pause(b); b.rate = 1; if (playing) playAt(b, context.currentTime + 0.01); $('#sync-status').textContent = 'B rate reset to 1×; no sync active.'; };
$('#stop-all').onclick = () => { for (const t of tracks) { stop(t); cancelAnalysis(t); } $('#sync-status').textContent = 'Stopped. No sync active.'; };
$('#tutorial').onclick = async () => {
  const button = $('#tutorial'); button.disabled = true;
  const generation = tracks[0].generation;
  try {
    const response = await fetch('../../examples/dj-tutorial/01-start-here-find-the-beat.mp3');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    if (generation !== tracks[0].generation) return;
    $('.file', tracks[0].el).value = '';
    await loadFile(tracks[0], new File([blob], '01-start-here-find-the-beat.mp3', {type: 'audio/mpeg'}));
  } catch (e) { status(tracks[0], 'Local tutorial unavailable: ' + e.message + '. Choose your own file instead.'); }
  finally { button.disabled = false; }
};
setInterval(() => { for (const t of tracks) scheduleClicks(t); }, 25);
function frame() { for (const t of tracks) draw(t); requestAnimationFrame(frame); }
requestAnimationFrame(frame);
document.addEventListener('visibilitychange', () => { if (document.hidden) for (const t of tracks) clearClicks(t); });
window.addEventListener('pagehide', () => {
  for (const t of tracks) {
    stop(t); cancelAnalysis(t); t.metadataCleanup?.(); t.buffer = null;
    t.gain?.disconnect(); t.gain = null;
  }
  context?.close(); context = null;
  updateControls();
});
updateControls();
