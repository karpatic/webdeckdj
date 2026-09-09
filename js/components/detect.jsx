import React from "react";

/*
 * Main beat analysis now uses only pinned Essentia.js 0.1.3 Degara in a disposable
 * local worker. The exact pre-integration authored detector is preserved at
 * ../../posterity/beat-detector/index.html. See ../../vendor/essentia-0.1.3/SOURCES.md;
 * this private local integration has not been cleared for redistribution.
 */
// Index of the latest measured beat, including an exact tick; -1 before the first.
const beatAtTime = (ticks, time) => {
  let low = 0;
  let high = ticks.length;
  for (let search = 0; low < high; search += 1) {
    const sum = low + high;
    const middle = Math.floor(sum / 2);
    if (ticks[middle] <= time) low = middle + 1;
    else high = middle;
  }
  return low - 1;
};

const BeatDetector = ({
  waveformEnabled = true,
  spectrumEnabled = true,
  automaticAnalysisEnabled = true,
  previewWaveform = null,
  name,
  track,
  audioRef,
  analyser,
  isPlaying,
  pitch = 0,
  syncControl,
  markers,
  onBeatDetected,
  onAnalysisChange,
  onBeatMapChange,
  renderDeckControls
}) => {
  const [analysis, setAnalysis] = React.useState({
    phase: 'idle',
    message: 'Load a track for beat analysis.',
    result: null,
    error: ''
  });
  const [isBeat, setIsBeat] = React.useState(false);
  const waveformCanvasRef = React.useRef(null);
  const spectrumCanvasRef = React.useRef(null);
  const requestRef = React.useRef();
  const beatIndexRef = React.useRef(0);
  const lastMediaTimeRef = React.useRef(null);
  const beatTimerRef = React.useRef(null);
  const activeFileRef = React.useRef(null);
  const trackFile = track ? track.file : null;
  // Never render or scan a map belonging to a different File, even before effects run.
  const currentResult = analysis.file === trackFile ? analysis.result : null;

  const clearBeatPulse = React.useCallback(() => {
    if (beatTimerRef.current !== null) window.clearTimeout(beatTimerRef.current);
    beatTimerRef.current = null;
    setIsBeat(false);
  }, []);

  const pulseBeat = React.useCallback(() => {
    if (beatTimerRef.current !== null) window.clearTimeout(beatTimerRef.current);
    setIsBeat(true);
    if (onBeatDetected) onBeatDetected(true);
    beatTimerRef.current = window.setTimeout(() => {
      beatTimerRef.current = null;
      setIsBeat(false);
    }, 80);
  }, [onBeatDetected]);

  React.useLayoutEffect(() => {
    activeFileRef.current = trackFile;
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    requestRef.current = undefined;
    beatIndexRef.current = 0;
    lastMediaTimeRef.current = null;
    clearBeatPulse();

    if (!track || !track.file) {
      setAnalysis({ file: trackFile, phase: 'idle', message: 'Load a track for beat analysis.', result: null, error: '' });
      if (onAnalysisChange) onAnalysisChange(null);
      return undefined;
    }

    const cached = window.dj.beat.getCachedAnalysis(track.file);
    setAnalysis({ file: trackFile, phase: cached ? 'cached' : 'reading',
      message: cached ? 'Reusing cached Degara beat map.' : 'Reading track for beat analysis.',
      result: cached, error: '' });
    if (onAnalysisChange) onAnalysisChange(cached);
    if (!automaticAnalysisEnabled) {
      setAnalysis({
        file: trackFile,
        phase: cached ? 'cached-off' : 'disabled',
        message: cached ? 'Cached beat map retained; automatic analysis is off.' : 'Automatic beat analysis is off.',
        result: cached,
        error: ''
      });
      return undefined;
    }

    let stale = false;
    const handle = window.dj.beat.analyzeFile(track.file, (status) => {
      if (stale) return;
      setAnalysis((current) => ({
        file: trackFile,
        phase: status.phase,
        message: status.message,
        result: current.file === trackFile ? current.result : cached,
        error: status.phase === 'error' ? status.message : ''
      }));
    });
    handle.promise.then((result) => {
      if (stale) return;
      beatIndexRef.current = 0;
      lastMediaTimeRef.current = null;
      setAnalysis({
        file: trackFile,
        phase: result.reused ? 'cached' : 'complete',
        message: result.reused ? 'Reusing cached Degara beat map.' : 'Degara analysis complete.',
        result: result,
        error: ''
      });
      if (onAnalysisChange) onAnalysisChange(result);
    }).catch((error) => {
      if (stale || error.name === 'AbortError') return;
      setAnalysis({ file: trackFile, phase: 'error', message: error.message, result: null, error: error.message });
      if (onAnalysisChange) onAnalysisChange(null);
    });

    return () => {
      stale = true;
      handle.cancel();
    };
  }, [trackFile, automaticAnalysisEnabled, onAnalysisChange, clearBeatPulse]);

  const scanMeasuredBeats = React.useCallback(() => {
    const result = currentResult;
    if (activeFileRef.current !== trackFile) return;
    const audio = audioRef.current;
    if (!result || !audio || !Array.isArray(result.ticks) || !result.ticks.length) return;
    const currentTime = audio.currentTime;
    if (!Number.isFinite(currentTime)) return;
    const previousTime = lastMediaTimeRef.current;

    if (previousTime === null || currentTime < previousTime || currentTime - previousTime > 1.5) {
      const nextTick = window.dj.beat.findNextTick(result.ticks, currentTime);
      beatIndexRef.current = nextTick === null ? result.ticks.length : result.ticks.indexOf(nextTick);
      lastMediaTimeRef.current = currentTime;
      return;
    }

    let index = beatIndexRef.current;
    let crossedBeat = false;
    for (let tickIndex = index; tickIndex < result.ticks.length; tickIndex += 1) {
      const tick = result.ticks[tickIndex];
      if (tick > currentTime + 0.015) break;
      if (tick > previousTime + 0.001) crossedBeat = true;
      index = tickIndex + 1;
    }
    beatIndexRef.current = index;
    lastMediaTimeRef.current = currentTime;
    if (crossedBeat) pulseBeat();
  }, [currentResult, trackFile, audioRef, pulseBeat]);

  const animate = React.useCallback(() => {
    if (!analyser) return;
    if (spectrumEnabled && spectrumCanvasRef.current && window.dj && window.dj.visual) {
      window.dj.visual.drawVisualization(analyser, spectrumCanvasRef.current, true);
    }
    if (waveformEnabled && waveformCanvasRef.current && window.dj && window.dj.visual) {
      window.dj.visual.drawWaveformVisualization(analyser, waveformCanvasRef.current, true);
    }
    scanMeasuredBeats();
    requestRef.current = requestAnimationFrame(animate);
  }, [analyser, waveformEnabled, spectrumEnabled, scanMeasuredBeats]);

  const needsAnimation = waveformEnabled || spectrumEnabled || Boolean(currentResult);

  React.useEffect(() => {
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
      requestRef.current = undefined;
    }
    lastMediaTimeRef.current = null;
    if (isPlaying && analyser && needsAnimation) {
      [spectrumCanvasRef.current, waveformCanvasRef.current].forEach((canvas) => {
        if (!canvas) return;
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
      });
      requestRef.current = requestAnimationFrame(animate);
    } else {
      clearBeatPulse();
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      requestRef.current = undefined;
    };
  }, [isPlaying, animate, analyser, needsAnimation, clearBeatPulse]);

  React.useEffect(() => {
    if (!waveformEnabled && !spectrumEnabled) return undefined;
    const handleResize = () => {
      [spectrumCanvasRef.current, waveformCanvasRef.current].forEach((canvas) => {
        if (!canvas) return;
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
      });
      if (isPlaying && analyser) {
        if (spectrumEnabled && spectrumCanvasRef.current) {
          window.dj.visual.drawVisualization(analyser, spectrumCanvasRef.current, true);
        }
        if (waveformEnabled && waveformCanvasRef.current) {
          window.dj.visual.drawWaveformVisualization(analyser, waveformCanvasRef.current, true);
        }
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isPlaying, analyser, waveformEnabled, spectrumEnabled]);

  React.useEffect(() => () => {
    if (beatTimerRef.current !== null) window.clearTimeout(beatTimerRef.current);
  }, []);

  const scrollCanvasRef = React.useRef(null);
  const [previewSeconds, setPreviewSeconds] = React.useState(35);
  const [downbeat, setDownbeat] = React.useState(null);
  const [barBeat, setBarBeat] = React.useState(-1);
  const barBeatRef = React.useRef(-1);
  const aligned = Boolean(currentResult && currentResult.ticks.length);
  // Assume the first measured beat starts a bar until the user corrects it.
  const downbeatIndex = downbeat && downbeat.file === trackFile && downbeat.result === currentResult
    ? downbeat.index : 0;
  React.useEffect(() => {
    if (onBeatMapChange) onBeatMapChange(currentResult, downbeatIndex);
  }, [currentResult, downbeatIndex, onBeatMapChange]);
  const markDownbeat = () => {
    const audio = audioRef.current;
    const ticks = currentResult && currentResult.ticks;
    if (!audio || !ticks || !ticks.length || !Number.isFinite(audio.currentTime)) return;
    let index = Math.max(0, beatAtTime(ticks, audio.currentTime));
    const next = index + 1;
    if (next < ticks.length && ticks[next] - audio.currentTime < audio.currentTime - ticks[index]) index = next;
    setDownbeat({ file: trackFile, result: currentResult, index });
  };
  const previewPast = previewSeconds === 8 ? 2 : 5;
  const currentWaveform = previewWaveform && previewWaveform.file === trackFile ? previewWaveform.data : null;
  // Drawing only: no decoding. Layout cleanup clears the old map before paint.
  React.useLayoutEffect(() => {
    const canvas = scrollCanvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio || !trackFile) return;
    let stopped = false;
    let frame = null;
    const draw = () => {
      if (stopped) return;
      window.dj.visual.drawScrollingTrack(canvas, audio.currentTime, audio.duration, currentResult, currentWaveform, previewSeconds, name, downbeatIndex, markers);
      let active = -1;
      if (aligned && Number.isFinite(audio.currentTime) && !audio.ended) {
        const index = beatAtTime(currentResult.ticks, audio.currentTime + 0.015);
        const offset = index - downbeatIndex;
        const wrapped = offset % 4 + 4;
        if (index >= 0) active = wrapped % 4;
      }
      if (active !== barBeatRef.current) {
        barBeatRef.current = active;
        setBarBeat(active);
      }
    };
    const animatePreview = () => {
      frame = null;
      if (stopped) return;
      draw();
      if (!audio.paused && !audio.ended) frame = requestAnimationFrame(animatePreview);
    };
    const update = () => {
      if (stopped) return;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      animatePreview();
    };
    const events = ['play', 'pause', 'ended', 'seeking', 'seeked', 'timeupdate',
      'loadedmetadata', 'durationchange', 'emptied', 'ratechange'];
    events.forEach(event => audio.addEventListener(event, update));
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    update();
    return () => {
      stopped = true;
      if (frame !== null) cancelAnimationFrame(frame);
      events.forEach(event => audio.removeEventListener(event, update));
      observer.disconnect();
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [trackFile, currentResult, currentWaveform, previewSeconds, audioRef, isPlaying, downbeatIndex, aligned, name, markers]);

  const result = currentResult;
  // Mixer pitch state rerenders on knob/Sync changes and native ratechange, even paused.
  let playbackRate = 1 + pitch / 100;
  const audio = audioRef.current;
  if (audio && Number.isFinite(audio.playbackRate) && audio.playbackRate > 0) playbackRate = audio.playbackRate;
  const effectiveBpm = result ? result.bpm * playbackRate : null;
  const bpmValue = effectiveBpm === null ? '—' : effectiveBpm.toFixed(1);
  let detail = analysis.file === trackFile ? analysis.message : 'Load a track for beat analysis.';
  if (result) {
    if (analysis.phase === 'complete' || analysis.phase === 'cached') {
      detail = result.ticks.length + ' measured beats · first ' + result.seconds.toFixed(0) + 's';
    }
  }

  const bpmControl = (
    <div className="deck-beat-controls">
      <div className="deck-bpm-stack">
        <span
          className={isBeat && result ? 'deck-bpm-readout is-beat' : 'deck-bpm-readout'}
          role="status"
          aria-live="polite"
          title={result ? 'Effective BPM at the current playback rate; Degara beat light follows measured tick times.' : detail}
        >
          [bpm: {bpmValue}]</span>
        <div className="bar-beats">
          {syncControl}
          <button type="button" onClick={markDownbeat} disabled={!result || !result.ticks.length}
            aria-label={`Deck ${name}: set beat 1`}
            title="First detected beat is assumed to be beat 1. Tap to correct it; snaps to the nearest measured beat.">down</button>
        </div>
      </div>
      <span className="bar-boxes" role="img"
        aria-label={aligned && barBeat >= 0 ? `Beat ${barBeat + 1} of 4` : 'Waiting for a measured beat'}>
        {[0, 1, 2, 3].map(beat => <span key={beat}
          className={aligned && barBeat === beat ? 'is-active' : ''} aria-hidden="true"></span>)}
      </span>
    </div>
  );

  const scrollPreview = (
    <div className="track-scroll-slot">
      <canvas
        ref={scrollCanvasRef}
        className="track-scroll-preview"
        width="72"
        height="240"
        role="img"
        aria-label={`Deck ${name}: vertical ${previewSeconds}-second scrolling waveform preview`}
        aria-describedby={`deck-${name}-preview-help`}
      ></canvas>
      <button
        type="button"
        className="track-preview-toggle"
        aria-label={`Deck ${name}: ${previewSeconds}-second preview; switch to ${previewSeconds === 35 ? 8 : 35} seconds`}
        title="Switch preview: 35s (5 past / 30 ahead) or 8s (2 past / 6 ahead)"
        onClick={() => setPreviewSeconds(previewSeconds === 35 ? 8 : 35)}
      >{previewSeconds}s</button>
      <span id={`deck-${name}-preview-help`} className="visually-hidden">
        Time increases from top to bottom: {previewPast} seconds above the fixed white playhead and {previewSeconds - previewPast} below.
        The full-file audio waveform moves upward during playback when detailed timelines are enabled and ready.
        Edge ticks are measured beats: downbeats are longer and four-bar starts are longest; no ticks are guessed.
        Cue and selected loop markers remain visible when they fall inside this window.
        Blank space lies outside the song. Pitch changes scrolling speed, not the track-time scale.
      </span>
    </div>
  );

  return (
    <div className="mb-3">
      {typeof renderDeckControls === 'function' && renderDeckControls(bpmControl, scrollPreview)}

      {waveformEnabled || spectrumEnabled ? <div className="deck-live-visuals mb-3">
        {waveformEnabled && <canvas
          ref={waveformCanvasRef}
          className="realtime-waveform"
          aria-label={`Deck ${name} realtime waveform`}
          height="80"
        ></canvas>}
        {spectrumEnabled && <canvas
          ref={spectrumCanvasRef}
          className="transformed-visualization"
          aria-label={`Deck ${name} transformed frequency visualization`}
          height="80"
        ></canvas>}
      </div> : null}
    </div>
  );
};

export default BeatDetector;
