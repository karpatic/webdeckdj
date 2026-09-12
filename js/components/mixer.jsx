import React from "react";  
import Deck from "./deck.jsx";
import RotaryControl from "./rotary.jsx";

const emptyMarkers = (trackUrl) => ({ trackUrl, cue: 0, cueSet: false, in: null, out: null, active: false, kind: null, autoStartIndex: null, message: "" });
const jogIdleMilliseconds = 150;
const jogRatePerStep = 0.0015;
const jogRateLimit = 0.04;
const jogSeekSecondsPerStep = 0.02;
const pitchStepFeedbackMilliseconds = 180;

const SampleKnob = ({ deck, channel, samples, control }) => {
  const selectedIndex = Math.max(0, samples.findIndex(sample => sample.id === control.selectedId));
  const selectedSample = samples[selectedIndex];
  return (
    <div className="shared-sample-control">
      <RotaryControl
        id={`mixer-samples-${channel}`} label={null} min={0} max={Math.max(0, samples.length - 1)} step={1}
        value={selectedIndex} singleTap={true} disabled={!selectedSample}
        onChange={(index) => { if (samples[index]) control.select(samples[index].id); }}
        onTap={() => { if (selectedSample) control.trigger(selectedSample.id); }}
        accessibleName={selectedSample ? `Deck ${deck} Samples${channel}: play ${selectedSample.label}; arrow keys select sample` : `Deck ${deck} Samples${channel} — import a Samples MP3 directory`}
        title="Turn / arrow keys select a sample; stationary click, Enter or Space restarts the selected clip"
        formatValue={() => selectedSample ? selectedSample.label : 'Import Samples'}
      />
      <small id={`samples-${channel}-playback-status`} role="status">{control.error}</small>
    </div>
  );
};

const Mixer = ({ 
  fxSamples,
  sampleChannels,
  settings,
  leftTrack, 
  rightTrack,
  getLeftAnalyzer,
  getRightAnalyzer,
  crateMidiRef,
  crateDirectoryMode,
  onMidiApiChange,
  onMidiStatusChange
}) => {
  // Audio references
  const leftAudioRef = React.useRef(null);
  const rightAudioRef = React.useRef(null);
  
  // Track the current tracks to detect changes
  const prevLeftTrackRef = React.useRef(null);
  const prevRightTrackRef = React.useRef(null);
  
  // Audio context
  const [audioContext, setAudioContext] = React.useState(null);
  
  // Gain nodes for crossfader control
  const [leftGainNode, setLeftGainNode] = React.useState(null);
  const [rightGainNode, setRightGainNode] = React.useState(null);
  
  const [monitor, setMonitor] = React.useState({ enabled: false, left: false, right: false, mix: 0, volume: 1, masterVolume: 1 });
  const changeMonitor = (key, value) => setMonitor(current => {
    const next = { ...current };
    next[key] = typeof value === 'function' ? value(current[key]) : value;
    return next;
  });
  React.useEffect(() => {
    if (audioContext) window.dj.getOutputRouter().update(monitor);
  }, [audioContext, monitor]);

  // Store nodes references
  const nodesRef = React.useRef({
    left: {},
    right: {}
  });
  
  // Playback state
  const [leftIsPlaying, setLeftIsPlaying] = React.useState(false);
  const [rightIsPlaying, setRightIsPlaying] = React.useState(false);
  
  // Crossfader state (0 = left, 100 = right)
  const [crossfader, setCrossfader] = React.useState(50);
  const [leftVolume, setLeftVolume] = React.useState(100);
  const [rightVolume, setRightVolume] = React.useState(100);

  const changeDeckVolume = (deck, value) => {
    if (!Number.isFinite(value)) return;
    const volume = Math.max(0, Math.min(100, value));
    if (deck === 'left') setLeftVolume(volume);
    else if (deck === 'right') setRightVolume(volume);
  };
  
  // Track progress state
  const [leftProgress, setLeftProgress] = React.useState({ currentTime: 0, duration: 0 });
  const [rightProgress, setRightProgress] = React.useState({ currentTime: 0, duration: 0 });
  const [leftPitch, setLeftPitch] = React.useState(0);
  const [rightPitch, setRightPitch] = React.useState(0);
  const [leftRateRevision, setLeftRateRevision] = React.useState(0);
  const [rightRateRevision, setRightRateRevision] = React.useState(0);
  const [leftAnalysis, setLeftAnalysis] = React.useState(null);
  const [rightAnalysis, setRightAnalysis] = React.useState(null);
  const [leftBeatMap, setLeftBeatMap] = React.useState({ result: null, downbeatIndex: 0 });
  const [rightBeatMap, setRightBeatMap] = React.useState({ result: null, downbeatIndex: 0 });
  const [leftMarkers, setLeftMarkers] = React.useState(() => emptyMarkers(null));
  const [rightMarkers, setRightMarkers] = React.useState(() => emptyMarkers(null));
  const [autoLoopBeats, setAutoLoopBeats] = React.useState({ left: 4, right: 4 });
  const [syncStatus, setSyncStatus] = React.useState('');
  const [activeSyncDeck, setActiveSyncDeck] = React.useState(null);
  const syncRef = React.useRef({ token: 0, rafId: null });
  const syncActivityRef = React.useRef(null);
  if (!syncActivityRef.current) {
    syncActivityRef.current = window.dj.beat.createSyncActivity(setActiveSyncDeck);
  }
  const loopSeekRef = React.useRef({ left: null, right: null });
  const manualActionVersionRef = React.useRef({ left: 0, right: 0 });
  const basePitchRef = React.useRef({ left: 0, right: 0 });
  const trackKeyRef = React.useRef({ left: null, right: null });
  const jogRef = React.useRef({
    left: { timer: null, audio: null, trackKey: null, offset: 0 },
    right: { timer: null, audio: null, trackKey: null, offset: 0 }
  });
  trackKeyRef.current.left = leftTrack?.url || null;
  trackKeyRef.current.right = rightTrack?.url || null;

  const seekForLoop = (deck, audio, target) => {
    if (!audio || !Number.isFinite(target)) return;
    if (Math.abs(audio.currentTime - target) < 0.001) return;
    loopSeekRef.current[deck] = { audio: audio, target: target };
    audio.currentTime = target;
  };

  const cancelScheduledSync = React.useCallback((message) => {
    const current = syncRef.current;
    if (current.rafId !== null && current.rafId !== undefined) {
      cancelAnimationFrame(current.rafId);
    }
    if (current.finishTimer !== null && current.finishTimer !== undefined) {
      window.clearTimeout(current.finishTimer);
    }
    if (current.resumePending && current.followerWasPaused && current.followerAudio) {
      const actionVersion = manualActionVersionRef.current[current.followerDeck];
      if (actionVersion === current.manualActionVersion) current.followerAudio.pause();
    }
    let nextToken = Number(current.token);
    if (!Number.isFinite(nextToken)) nextToken = 0;
    nextToken += 1;
    syncRef.current = { token: nextToken, rafId: null };
    syncActivityRef.current.clear();
    if (message) setSyncStatus(message);
  }, []);

  const isApplyingSyncSeek = React.useCallback((deck) => {
    const current = syncRef.current;
    const audio = deck === 'left' ? leftAudioRef.current : rightAudioRef.current;
    return current.applyingDeck === deck && audio &&
      Math.abs(audio.currentTime - current.appliedTargetTime) < 0.05 &&
      performance.now() <= current.ignoreSeekingUntil;
  }, []);

  const isJogNudgeActive = React.useCallback((deck, audio) => {
    const state = jogRef.current[deck];
    return Boolean(state && state.audio === audio && state.trackKey === trackKeyRef.current[deck]);
  }, []);

  const clearJogNudge = React.useCallback((deck) => {
    const state = jogRef.current[deck];
    if (!state) return;
    if (state.timer !== null) window.clearTimeout(state.timer);
    const audio = state.audio;
    const trackKey = state.trackKey;
    state.timer = null;
    state.audio = null;
    state.trackKey = null;
    state.offset = 0;
    const currentAudio = deck === 'left' ? leftAudioRef.current : rightAudioRef.current;
    const stillCurrent = audio && audio === currentAudio && trackKey === trackKeyRef.current[deck];
    if (stillCurrent) window.dj.audio.applyPitchBend(audio, basePitchRef.current[deck]);
  }, []);

  const clearAllJogNudges = React.useCallback(() => {
    clearJogNudge('left');
    clearJogNudge('right');
  }, [clearJogNudge]);

  const applyPitchWithActiveJog = React.useCallback((deck, audio, pitch) => {
    const state = jogRef.current[deck];
    if (!state || state.audio !== audio || state.trackKey !== trackKeyRef.current[deck]) {
      window.dj.audio.applyPitchBend(audio, pitch);
      return;
    }
    let rate = 1 + pitch / 100;
    rate += state.offset;
    rate = Math.max(0.5, Math.min(2, rate));
    audio.playbackRate = rate;
  }, []);

  const changeDeckPitch = React.useCallback((deck, value, manual) => {
    if (manual) cancelScheduledSync('Sync cancelled by manual pitch change.');
    let nextValue = Number(value);
    if (!Number.isFinite(nextValue)) return;
    nextValue = Math.max(-8, Math.min(8, nextValue));
    nextValue = Math.round(nextValue * 10) / 10;
    const audio = deck === 'left' ? leftAudioRef.current : rightAudioRef.current;
    basePitchRef.current[deck] = nextValue;
    if (audio) applyPitchWithActiveJog(deck, audio, nextValue);
    if (deck === 'left') setLeftPitch(nextValue);
    else setRightPitch(nextValue);
  }, [cancelScheduledSync, applyPitchWithActiveJog]);

  const adjustDeckPitch = React.useCallback((deck, delta) => {
    cancelScheduledSync('Sync cancelled by manual pitch change.');
    const setPitch = deck === 'left' ? setLeftPitch : setRightPitch;
    const audio = deck === 'left' ? leftAudioRef.current : rightAudioRef.current;
    setPitch(current => {
      const combined = Number(current) + Number(delta);
      let nextValue = Math.round(combined * 10) / 10;
      nextValue = Math.max(-8, Math.min(8, nextValue));
      basePitchRef.current[deck] = nextValue;
      if (audio) applyPitchWithActiveJog(deck, audio, nextValue);
      return nextValue;
    });
  }, [cancelScheduledSync, applyPitchWithActiveJog]);

  const jogDeck = React.useCallback((deck, delta) => {
    if ((deck !== 'left' && deck !== 'right') || !Number.isFinite(delta) || delta === 0) return;
    const audio = deck === 'left' ? leftAudioRef.current : rightAudioRef.current;
    const trackKey = trackKeyRef.current[deck];
    if (!audio || !trackKey) return;

    if (audio.paused || audio.ended) {
      clearJogNudge(deck);
      const duration = audio.duration;
      if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(audio.currentTime)) return;
      cancelScheduledSync('Sync cancelled by manual jog.');
      manualActionVersionRef.current[deck] += 1;
      const movement = delta * jogSeekSecondsPerStep;
      let target = audio.currentTime + movement;
      target = Math.max(0, Math.min(duration, target));
      if (Math.abs(target - audio.currentTime) >= 0.001) audio.currentTime = target;
      return;
    }

    cancelScheduledSync('Sync cancelled by manual jog.');
    manualActionVersionRef.current[deck] += 1;
    const state = jogRef.current[deck];
    if (state.audio !== audio || state.trackKey !== trackKey) {
      clearJogNudge(deck);
      state.audio = audio;
      state.trackKey = trackKey;
      state.offset = 0;
    }
    let nextOffset = state.offset + delta * jogRatePerStep;
    nextOffset = Math.max(-jogRateLimit, Math.min(jogRateLimit, nextOffset));
    state.offset = nextOffset;
    applyPitchWithActiveJog(deck, audio, basePitchRef.current[deck]);
    if (state.timer !== null) window.clearTimeout(state.timer);
    state.timer = window.setTimeout(() => clearJogNudge(deck), jogIdleMilliseconds);
  }, [cancelScheduledSync, clearJogNudge, applyPitchWithActiveJog]);

  const handleLeftAnalysisChange = React.useCallback((result) => {
    if (syncActivityRef.current.getActiveDeck()) cancelScheduledSync('Sync cancelled because Deck A analysis changed.');
    setLeftAnalysis(result);
  }, [cancelScheduledSync]);
  const handleRightAnalysisChange = React.useCallback((result) => {
    if (syncActivityRef.current.getActiveDeck()) cancelScheduledSync('Sync cancelled because Deck B analysis changed.');
    setRightAnalysis(result);
  }, [cancelScheduledSync]);
  const handleLeftBeatMapChange = React.useCallback((result, downbeatIndex) => setLeftBeatMap({ result, downbeatIndex }), []);
  const handleRightBeatMapChange = React.useCallback((result, downbeatIndex) => setRightBeatMap({ result, downbeatIndex }), []);

  React.useEffect(() => {
    if (leftAudioRef.current) applyPitchWithActiveJog('left', leftAudioRef.current, leftPitch);
  }, [leftTrack, leftPitch, applyPitchWithActiveJog]);

  React.useEffect(() => {
    if (rightAudioRef.current) applyPitchWithActiveJog('right', rightAudioRef.current, rightPitch);
  }, [rightTrack, rightPitch, applyPitchWithActiveJog]);

  React.useEffect(() => () => {
    syncActivityRef.current.destroy();
    cancelScheduledSync('');
  }, [cancelScheduledSync]);
  React.useEffect(() => () => clearAllJogNudges(), [clearAllJogNudges]);

  const transportAction = (deck, action) => {
    cancelScheduledSync('Sync cancelled by manual transport change.');
    manualActionVersionRef.current[deck] += 1;
    const isLeft = deck === 'left';
    const audio = isLeft ? leftAudioRef.current : rightAudioRef.current;
    const markers = isLeft ? leftMarkers : rightMarkers;
    const setMarkers = isLeft ? setLeftMarkers : setRightMarkers;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const position = Math.min(audio.duration, Math.max(0, audio.currentTime));
    if (action === 'setcue') {
      setMarkers(current => ({ ...current, cue: position, cueSet: true, message: '' }));
    } else if (action === 'cue') {
      audio.pause();
      audio.currentTime = Math.min(audio.duration, Math.max(0, markers.cue));
    } else if (action === 'in') {
      setMarkers(current => ({ ...current, in: position, out: null, active: false, kind: null, autoStartIndex: null, message: '' }));
    } else if (markers.active) {
      setMarkers(current => ({ ...current, active: false, kind: null, autoStartIndex: null, message: '' }));
    } else if (markers.in === null || position <= markers.in) {
      setMarkers(current => ({ ...current, message: 'Loop Out must be later than Loop In.' }));
    } else {
      setMarkers(current => ({ ...current, out: position, active: true, kind: 'manual', autoStartIndex: null, message: '' }));
      // Capturing Out starts at In without changing the paused state.
      seekForLoop(deck, audio, markers.in);
    }
  };

  const getAutoLoopAvailability = (deck, beats, startIndex) => {
    const isLeft = deck === 'left';
    const audio = isLeft ? leftAudioRef.current : rightAudioRef.current;
    const beatMap = isLeft ? leftBeatMap : rightBeatMap;
    if (!audio) return { enabled: false, reason: 'Load this deck before using Auto Loop.', plan: null };
    return window.dj.beat.getAutoLoopPlan({
      result: beatMap.result,
      beats: beats,
      duration: audio.duration,
      currentTime: audio.currentTime,
      startIndex: startIndex
    });
  };

  const toggleAutoLoop = (deck) => {
    cancelScheduledSync('Sync cancelled by manual transport change.');
    manualActionVersionRef.current[deck] += 1;
    const isLeft = deck === 'left';
    const audio = isLeft ? leftAudioRef.current : rightAudioRef.current;
    const markers = isLeft ? leftMarkers : rightMarkers;
    const setMarkers = isLeft ? setLeftMarkers : setRightMarkers;
    if (!audio) return;
    if (markers.active && markers.kind === 'auto') {
      setMarkers(current => ({ ...current, active: false, kind: null, autoStartIndex: null, message: '' }));
      return;
    }
    const beats = autoLoopBeats[deck];
    const availability = getAutoLoopAvailability(deck, beats, null);
    if (!availability.enabled) {
      setMarkers(current => ({ ...current, message: availability.reason }));
      return;
    }
    const plan = availability.plan;
    setMarkers(current => ({ ...current, in: plan.start, out: plan.end, active: true, kind: 'auto', autoStartIndex: plan.startIndex, message: '' }));
    seekForLoop(deck, audio, plan.start);
  };

  const cycleAutoLoop = (deck) => {
    const currentBeats = autoLoopBeats[deck];
    let nextBeats = 4;
    if (currentBeats === 4) nextBeats = 8;
    else if (currentBeats === 8) nextBeats = 16;
    const isLeft = deck === 'left';
    const markers = isLeft ? leftMarkers : rightMarkers;
    const setMarkers = isLeft ? setLeftMarkers : setRightMarkers;
    const audio = isLeft ? leftAudioRef.current : rightAudioRef.current;
    if (markers.active && markers.kind === 'auto') {
      const availability = getAutoLoopAvailability(deck, nextBeats, markers.autoStartIndex);
      if (!availability.enabled) {
        setMarkers(current => ({ ...current, message: availability.reason }));
        return;
      }
      const plan = availability.plan;
      setMarkers(current => ({ ...current, in: plan.start, out: plan.end, autoStartIndex: plan.startIndex, message: '' }));
      let outside = false;
      if (audio) outside = audio.currentTime < plan.start || audio.currentTime >= plan.end;
      if (outside) {
        seekForLoop(deck, audio, plan.start);
      }
    }
    setAutoLoopBeats(current => {
      const next = { ...current };
      next[deck] = nextBeats;
      return next;
    });
  };

  // One deadline per actively playing loop; no new RAF or idle polling.
  // Native seeking events still reach the existing beat-history reset handlers.
  React.useEffect(() => {
    const cleanups = [];
    const decks = [
      { deck: 'left', audio: leftAudioRef.current, track: leftTrack, markers: leftMarkers, setMarkers: setLeftMarkers },
      { deck: 'right', audio: rightAudioRef.current, track: rightTrack, markers: rightMarkers, setMarkers: setRightMarkers }
    ];
    decks.forEach(({ deck, audio, track, markers, setMarkers }) => {
      if (!audio || !markers.active || markers.trackUrl !== track?.url) return;
      let timer = null;
      let disposed = false;
      const clearDeadline = () => { if (timer !== null) window.clearTimeout(timer); timer = null; };
      const exitLoop = () => {
        if (disposed) return;
        clearDeadline();
        disposed = true;
        if (loopSeekRef.current[deck]?.audio === audio) loopSeekRef.current[deck] = null;
        setMarkers(current => ({ ...current, active: false, kind: null, autoStartIndex: null }));
      };
      const syncLoop = () => {
        clearDeadline();
        if (disposed || audio.seeking) return;
        const duration = audio.duration;
        if (!Number.isFinite(duration) || duration <= 0) return;
        const end = Math.min(markers.out, duration);
        if (markers.in === null || end <= markers.in) { exitLoop(); return; }
        if (audio.currentTime >= end) {
          const wasEnded = audio.ended;
          if (audio.paused && !wasEnded) return;
          seekForLoop(deck, audio, markers.in);
          if (wasEnded) audio.play().catch(exitLoop);
          return; // seeked reschedules, preserving all existing seek listeners.
        }
        if (audio.paused || audio.playbackRate <= 0) return;
        const remaining = end - audio.currentTime;
        const delay = remaining / audio.playbackRate * 1000;
        timer = window.setTimeout(syncLoop, Math.max(10, Math.min(delay, 2147483647)));
      };
      const onSeeking = () => {
        clearDeadline();
        const pending = loopSeekRef.current[deck];
        if (pending && pending.audio === audio) return;
        const end = Math.min(markers.out, audio.duration);
        const outside = audio.currentTime < markers.in || audio.currentTime >= end;
        if (outside) exitLoop();
      };
      const onSeeked = () => {
        const pending = loopSeekRef.current[deck];
        if (pending && pending.audio === audio) {
          loopSeekRef.current[deck] = null;
          const end = Math.min(markers.out, audio.duration);
          if (pending.target < markers.in || pending.target >= end) return;
        }
        syncLoop();
      };
      const events = ['play', 'pause', 'timeupdate', 'ratechange', 'durationchange', 'ended'];
      events.forEach(event => audio.addEventListener(event, syncLoop));
      audio.addEventListener('seeking', onSeeking);
      audio.addEventListener('seeked', onSeeked);
      syncLoop();
      cleanups.push(() => {
        disposed = true;
        clearDeadline();
        events.forEach(event => audio.removeEventListener(event, syncLoop));
        audio.removeEventListener('seeking', onSeeking);
        audio.removeEventListener('seeked', onSeeked);
      });
    });
    return () => cleanups.forEach(cleanup => cleanup());
  }, [leftTrack, rightTrack, leftMarkers, rightMarkers]);

  // Add state for analyzer nodes
  const [leftAnalyser, setLeftAnalyser] = React.useState(null);
  const [rightAnalyser, setRightAnalyser] = React.useState(null);

  // Initialize audio context
  React.useEffect(() => {
    const initializeAudio = async () => {
      try {
        console.log('window.js', window.dj)
        const audioCtx = window.dj.audio.getAudioContext();
        await window?.dj.audio.resumeAudioContext();
        setAudioContext(audioCtx);
        console.log("Audio context initialized in mixer component");
      } catch (err) {
        console.error("Failed to initialize audio context:", err);
      }
    };
    
    initializeAudio();
    return () => {};
  }, []);

  // Store gain nodes in our ref object for direct access
  React.useEffect(() => {
    if (leftGainNode) {
      nodesRef.current.left = {
        ...nodesRef.current.left,
        gainNode: leftGainNode
      };
      console.log("Left gain node stored in mixer component");
    }
  }, [leftGainNode]);

  React.useEffect(() => {
    if (rightGainNode) {
      nodesRef.current.right = {
        ...nodesRef.current.right,
        gainNode: rightGainNode
      };
      console.log("Right gain node stored in mixer component");
    }
  }, [rightGainNode]);

  // Both UI and MIDI update controlled volume/crossfade state; only this effect writes gains.
  React.useEffect(() => {
    if (audioContext) {
      window.dj.audio.updateCrossfader(
        leftGainNode, 
        rightGainNode, 
        crossfader,
        leftVolume,
        rightVolume
      );
    }
  }, [crossfader, leftVolume, rightVolume, leftGainNode, rightGainNode, audioContext]);

  // Handle left analyzer creation
  const handleLeftAnalyserCreated = React.useCallback((analyzer) => {
    console.log("Left analyzer created in Mixer");
    setLeftAnalyser(analyzer);
    
    // Send to parent immediately if available
    if (analyzer && typeof getLeftAnalyzer === 'function') {
      console.log("Sending left analyzer to parent component immediately");
      getLeftAnalyzer(analyzer);
    }
  }, [getLeftAnalyzer]);
  
  // Handle right analyzer creation
  const handleRightAnalyserCreated = React.useCallback((analyzer) => {
    console.log("Right analyzer created in Mixer");
    setRightAnalyser(analyzer);
    
    // Send to parent immediately if available
    if (analyzer && typeof getRightAnalyzer === 'function') {
      console.log("Sending right analyzer to parent component immediately");
      getRightAnalyzer(analyzer);
    }
  }, [getRightAnalyzer]);

  // Pass analyzer nodes to parent when they're available
  React.useEffect(() => {
    if (leftAnalyser && typeof getLeftAnalyzer === 'function') {
      console.log("Sending left analyzer to parent component");
      getLeftAnalyzer(leftAnalyser);
    }
  }, [leftAnalyser, getLeftAnalyzer]);
  
  React.useEffect(() => {
    if (rightAnalyser && typeof getRightAnalyzer === 'function') {
      console.log("Sending right analyzer to parent component");
      getRightAnalyzer(rightAnalyser);
    }
  }, [rightAnalyser, getRightAnalyzer]);

  // Update progress for the specified deck
  const updateProgress = (deck, currentTime, duration) => {
    const validDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
    const validCurrentTime = validDuration && Number.isFinite(currentTime)
      ? Math.min(validDuration, Math.max(0, currentTime))
      : 0;
    const nextProgress = { currentTime: validCurrentTime, duration: validDuration };

    if (deck === "left") {
      setLeftProgress(nextProgress);
    } else {
      setRightProgress(nextProgress);
    }
  };

  // Format time in MM:SS format
  const formatTime = (time) => {
    if (isNaN(time)) return "00:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Toggle play/pause for a deck
  const togglePlayPause = (deck) => {
    cancelScheduledSync('Sync cancelled by manual play/pause.');
    manualActionVersionRef.current[deck] += 1;
    const audio = deck === "left" ? leftAudioRef.current : rightAudioRef.current;
    if (!audio) return;

    window.dj.audio.resumeAudioContext().then(() => {
      if (!audio.paused && !audio.ended) {
        audio.pause();
        return;
      }

      if (audio.ended) {
        const markers = deck === 'left' ? leftMarkers : rightMarkers;
        audio.currentTime = markers.active ? markers.in : 0;
      }
      audio.play().catch((err) => console.error(`Failed to play ${deck} deck:`, err));
    });
  };

  // Handle track changes for left deck
  React.useEffect(() => {
    const leftAudio = leftAudioRef.current;

    // Check if the track URL has changed
    if (prevLeftTrackRef.current?.url !== leftTrack?.url) {
      console.log("Left track changed, updating audio element");
      cancelScheduledSync('Sync cancelled because Deck A changed.');
      clearJogNudge('left');
      prevLeftTrackRef.current = leftTrack;
      setLeftMarkers(emptyMarkers(leftTrack?.url));
      setLeftAnalysis(null);

      setLeftIsPlaying(false);
      updateProgress("left", 0, 0);
      if (leftAudio) {
        leftAudio.pause();
        if (leftTrack) leftAudio.load();
      }
    }

    if (!leftAudio) return;

    let animationFrameId;
    const syncProgress = () => {
      updateProgress("left", leftAudio.currentTime, leftAudio.duration);
    };

    const stopProgressSync = () => {
      if (animationFrameId !== undefined) cancelAnimationFrame(animationFrameId);
      animationFrameId = undefined;
    };

    const syncDuringPlayback = () => {
      syncProgress();
      animationFrameId = settings.detailedTimeline && !leftAudio.paused && !leftAudio.ended
        ? requestAnimationFrame(syncDuringPlayback)
        : undefined;
    };

    const startProgressSync = () => {
      stopProgressSync();
      syncProgress();
      if (settings.detailedTimeline && !leftAudio.paused && !leftAudio.ended) {
        animationFrameId = requestAnimationFrame(syncDuringPlayback);
      }
    };

    const handlePlay = () => {
      setLeftIsPlaying(true);
      startProgressSync();
    };

    const handlePause = () => {
      clearJogNudge('left');
      if (syncActivityRef.current.getActiveDeck()) cancelScheduledSync('Sync cancelled because playback stopped.');
      setLeftIsPlaying(false);
      stopProgressSync();
      syncProgress();
    };

    const handleSeeking = () => {
      syncProgress();
      if (!isApplyingSyncSeek('left')) cancelScheduledSync('Sync cancelled by Deck A seek.');
    };

    const handleSeeked = () => {
      syncProgress();
      const scheduled = syncRef.current;
      if (scheduled.applyingDeck === 'left') {
        scheduled.applyingDeck = null;
        scheduled.ignoreSeekingUntil = 0;
      }
      if (!leftAudio.paused && !leftAudio.ended) startProgressSync();
    };

    const handleRateChange = () => {
      setLeftRateRevision(current => current + 1);
      if (isJogNudgeActive('left', leftAudio)) return;
      const rate = leftAudio.playbackRate;
      const difference = rate - 1;
      if (Number.isFinite(rate) && rate > 0) {
        const nextPitch = Math.round(difference * 1000) / 10;
        basePitchRef.current.left = nextPitch;
        setLeftPitch(nextPitch);
      }
    };
    leftAudio.addEventListener('ratechange', handleRateChange);
    leftAudio.addEventListener('timeupdate', syncProgress);
    leftAudio.addEventListener('loadedmetadata', syncProgress);
    leftAudio.addEventListener('durationchange', syncProgress);
    leftAudio.addEventListener('seeking', handleSeeking);
    leftAudio.addEventListener('seeked', handleSeeked);
    leftAudio.addEventListener('play', handlePlay);
    leftAudio.addEventListener('pause', handlePause);
    leftAudio.addEventListener('ended', handlePause);
    syncProgress();
    if (!leftAudio.paused && !leftAudio.ended) startProgressSync();

    return () => {
      clearJogNudge('left');
      stopProgressSync();
      leftAudio.removeEventListener('ratechange', handleRateChange);
      leftAudio.removeEventListener('timeupdate', syncProgress);
      leftAudio.removeEventListener('loadedmetadata', syncProgress);
      leftAudio.removeEventListener('durationchange', syncProgress);
      leftAudio.removeEventListener('seeking', handleSeeking);
      leftAudio.removeEventListener('seeked', handleSeeked);
      leftAudio.removeEventListener('play', handlePlay);
      leftAudio.removeEventListener('pause', handlePause);
      leftAudio.removeEventListener('ended', handlePause);
    };
  }, [leftTrack, settings.detailedTimeline, cancelScheduledSync, isApplyingSyncSeek, clearJogNudge, isJogNudgeActive]);
  
  // Handle track changes for right deck
  React.useEffect(() => {
    const rightAudio = rightAudioRef.current;

    // Check if the track URL has changed
    if (prevRightTrackRef.current?.url !== rightTrack?.url) {
      console.log("Right track changed, updating audio element");
      cancelScheduledSync('Sync cancelled because Deck B changed.');
      clearJogNudge('right');
      prevRightTrackRef.current = rightTrack;
      setRightMarkers(emptyMarkers(rightTrack?.url));
      setRightAnalysis(null);

      setRightIsPlaying(false);
      updateProgress("right", 0, 0);
      if (rightAudio) {
        rightAudio.pause();
        if (rightTrack) rightAudio.load();
      }
    }

    if (!rightAudio) return;

    let animationFrameId;
    const syncProgress = () => {
      updateProgress("right", rightAudio.currentTime, rightAudio.duration);
    };

    const stopProgressSync = () => {
      if (animationFrameId !== undefined) cancelAnimationFrame(animationFrameId);
      animationFrameId = undefined;
    };

    const syncDuringPlayback = () => {
      syncProgress();
      animationFrameId = settings.detailedTimeline && !rightAudio.paused && !rightAudio.ended
        ? requestAnimationFrame(syncDuringPlayback)
        : undefined;
    };

    const startProgressSync = () => {
      stopProgressSync();
      syncProgress();
      if (settings.detailedTimeline && !rightAudio.paused && !rightAudio.ended) {
        animationFrameId = requestAnimationFrame(syncDuringPlayback);
      }
    };

    const handlePlay = () => {
      setRightIsPlaying(true);
      startProgressSync();
    };

    const handlePause = () => {
      clearJogNudge('right');
      if (syncActivityRef.current.getActiveDeck()) cancelScheduledSync('Sync cancelled because playback stopped.');
      setRightIsPlaying(false);
      stopProgressSync();
      syncProgress();
    };

    const handleSeeking = () => {
      syncProgress();
      if (!isApplyingSyncSeek('right')) cancelScheduledSync('Sync cancelled by Deck B seek.');
    };

    const handleSeeked = () => {
      syncProgress();
      const scheduled = syncRef.current;
      if (scheduled.applyingDeck === 'right') {
        scheduled.applyingDeck = null;
        scheduled.ignoreSeekingUntil = 0;
      }
      if (!rightAudio.paused && !rightAudio.ended) startProgressSync();
    };

    const handleRateChange = () => {
      setRightRateRevision(current => current + 1);
      if (isJogNudgeActive('right', rightAudio)) return;
      const rate = rightAudio.playbackRate;
      const difference = rate - 1;
      if (Number.isFinite(rate) && rate > 0) {
        const nextPitch = Math.round(difference * 1000) / 10;
        basePitchRef.current.right = nextPitch;
        setRightPitch(nextPitch);
      }
    };
    rightAudio.addEventListener('ratechange', handleRateChange);
    rightAudio.addEventListener('timeupdate', syncProgress);
    rightAudio.addEventListener('loadedmetadata', syncProgress);
    rightAudio.addEventListener('durationchange', syncProgress);
    rightAudio.addEventListener('seeking', handleSeeking);
    rightAudio.addEventListener('seeked', handleSeeked);
    rightAudio.addEventListener('play', handlePlay);
    rightAudio.addEventListener('pause', handlePause);
    rightAudio.addEventListener('ended', handlePause);
    syncProgress();
    if (!rightAudio.paused && !rightAudio.ended) startProgressSync();

    return () => {
      clearJogNudge('right');
      stopProgressSync();
      rightAudio.removeEventListener('ratechange', handleRateChange);
      rightAudio.removeEventListener('timeupdate', syncProgress);
      rightAudio.removeEventListener('loadedmetadata', syncProgress);
      rightAudio.removeEventListener('durationchange', syncProgress);
      rightAudio.removeEventListener('seeking', handleSeeking);
      rightAudio.removeEventListener('seeked', handleSeeked);
      rightAudio.removeEventListener('play', handlePlay);
      rightAudio.removeEventListener('pause', handlePause);
      rightAudio.removeEventListener('ended', handlePause);
    };
  }, [rightTrack, settings.detailedTimeline, cancelScheduledSync, isApplyingSyncSeek, clearJogNudge, isJogNudgeActive]);

  const startSync = (followerDeck) => {
    const followerIsLeft = followerDeck === 'left';
    const leaderAudio = followerIsLeft ? rightAudioRef.current : leftAudioRef.current;
    const followerAudio = followerIsLeft ? leftAudioRef.current : rightAudioRef.current;
    const leaderTrack = followerIsLeft ? rightTrack : leftTrack;
    const followerTrack = followerIsLeft ? leftTrack : rightTrack;
    const leaderResult = followerIsLeft ? rightAnalysis : leftAnalysis;
    const followerResult = followerIsLeft ? leftAnalysis : rightAnalysis;
    const leaderLoopActive = followerIsLeft ? rightMarkers.active : leftMarkers.active;
    const followerLoopActive = followerIsLeft ? leftMarkers.active : rightMarkers.active;
    const availability = window.dj.beat.getSyncPlan({
      leaderAudio: leaderAudio,
      followerAudio: followerAudio,
      leaderTrack: leaderTrack,
      followerTrack: followerTrack,
      leaderResult: leaderResult,
      followerResult: followerResult,
      leaderLoopActive: leaderLoopActive,
      followerLoopActive: followerLoopActive,
      maximumPitch: 8
    });

    if (!availability.enabled) {
      setSyncStatus(availability.reason);
      return;
    }

    cancelScheduledSync('');
    const token = syncRef.current.token;
    const plan = availability.plan;
    changeDeckPitch(followerDeck, plan.pitch, false);
    const schedule = {
      token: token,
      rafId: null,
      finishTimer: null,
      applyingDeck: null,
      ignoreSeekingUntil: 0,
      resumePending: false,
      followerWasPaused: plan.followerWasPaused,
      followerAudio: followerAudio,
      followerDeck: followerDeck,
      manualActionVersion: manualActionVersionRef.current[followerDeck],
      lastLeaderTime: leaderAudio.currentTime
    };
    syncRef.current = schedule;
    const followerName = followerIsLeft ? 'A' : 'B';
    const leaderName = followerIsLeft ? 'B' : 'A';
    setSyncStatus('Deck ' + followerName + ' tempo set to ' + plan.pitch.toFixed(1) + '%. Waiting for Deck ' + leaderName + ' measured beat.');

    const finishAligned = () => {
      if (syncRef.current !== schedule) return;
      syncActivityRef.current.activate(followerDeck);
      setSyncStatus('Deck ' + followerName + ' aligned to Deck ' + leaderName + ' on measured beats at ' + plan.pitch.toFixed(1) + '%.');
      schedule.finishTimer = window.setTimeout(() => {
        if (syncRef.current === schedule) syncRef.current = { token: token, rafId: null };
      }, 600);
    };

    const waitForBeat = () => {
      if (syncRef.current !== schedule || syncRef.current.token !== token) return;
      if (leaderTrack.url !== plan.leaderTrackUrl || followerTrack.url !== plan.followerTrackUrl ||
          leaderResult !== plan.leaderResult || followerResult !== plan.followerResult) {
        cancelScheduledSync('Sync cancelled because track analysis changed.');
        return;
      }
      if (leaderAudio.paused || leaderAudio.ended || leaderAudio.seeking || followerAudio.ended) {
        cancelScheduledSync('Sync cancelled because the leader stopped or a track ended.');
        return;
      }
      if (leaderAudio.currentTime + 0.03 < schedule.lastLeaderTime) {
        cancelScheduledSync('Sync cancelled by leader seek.');
        return;
      }
      schedule.lastLeaderTime = leaderAudio.currentTime;
      if (leaderAudio.currentTime < plan.leaderTick - 0.015) {
        schedule.rafId = requestAnimationFrame(waitForBeat);
        return;
      }

      schedule.rafId = null;
      schedule.applyingDeck = followerDeck;
      schedule.appliedTargetTime = plan.followerTick;
      schedule.ignoreSeekingUntil = performance.now() + 1000;
      followerAudio.currentTime = plan.followerTick;

      if (!plan.followerWasPaused) {
        finishAligned();
        return;
      }

      schedule.resumePending = true;
      const actionVersion = schedule.manualActionVersion;
      followerAudio.play().then(() => {
        schedule.resumePending = false;
        if (syncRef.current !== schedule || syncRef.current.token !== token) {
          if (manualActionVersionRef.current[followerDeck] === actionVersion) followerAudio.pause();
          return;
        }
        finishAligned();
      }).catch((error) => {
        schedule.resumePending = false;
        if (syncRef.current !== schedule) return;
        cancelScheduledSync('Tempo matched, but Deck ' + followerName + ' could not start: ' + error.message);
      });
    };

    schedule.rafId = requestAnimationFrame(waitForBeat);
  };

  const syncAToB = window.dj.beat.getSyncPlan({
    leaderAudio: rightAudioRef.current,
    followerAudio: leftAudioRef.current,
    leaderTrack: rightTrack,
    followerTrack: leftTrack,
    leaderResult: rightAnalysis,
    followerResult: leftAnalysis,
    leaderLoopActive: rightMarkers.active,
    followerLoopActive: leftMarkers.active,
    maximumPitch: 8
  });
  const syncBToA = window.dj.beat.getSyncPlan({
    leaderAudio: leftAudioRef.current,
    followerAudio: rightAudioRef.current,
    leaderTrack: leftTrack,
    followerTrack: rightTrack,
    leaderResult: leftAnalysis,
    followerResult: rightAnalysis,
    leaderLoopActive: leftMarkers.active,
    followerLoopActive: rightMarkers.active,
    maximumPitch: 8
  });

  const leftReady = Boolean(leftTrack) && leftProgress.duration > 0;
  const rightReady = Boolean(rightTrack) && rightProgress.duration > 0;
  const leftAutoLoopAvailability = getAutoLoopAvailability('left', autoLoopBeats.left, null);
  const rightAutoLoopAvailability = getAutoLoopAvailability('right', autoLoopBeats.right, null);
  const leftAutoLoopActive = leftMarkers.active && leftMarkers.kind === 'auto';
  const rightAutoLoopActive = rightMarkers.active && rightMarkers.kind === 'auto';
  let leftAutoLoopDisabled = !leftReady;
  let rightAutoLoopDisabled = !rightReady;
  if (!leftAutoLoopAvailability.enabled && !leftAutoLoopActive) leftAutoLoopDisabled = true;
  if (!rightAutoLoopAvailability.enabled && !rightAutoLoopActive) rightAutoLoopDisabled = true;
  let visibleSyncStatus = syncStatus;
  if (!visibleSyncStatus && !syncAToB.enabled) visibleSyncStatus = syncAToB.reason;

  const midiRef = React.useRef(null);
  const midiActionRef = React.useRef(null);
  const midiEQRef = React.useRef({ left: null, right: null });
  const midiFxRef = React.useRef({ left: [null, null], right: [null, null] });
  const midiJogCleanupRef = React.useRef(null);
  const pitchStepFallbackTimersRef = React.useRef(new Map());
  const [pitchStepFeedback, setPitchStepFeedback] = React.useState({
    left: { decrease: false, increase: false },
    right: { decrease: false, increase: false }
  });
  const [midiEqCentered, setMidiEqCentered] = React.useState({
    left: { treble: true, mid: true, bass: true },
    right: { treble: true, mid: true, bass: true }
  });
  const [midiFxStrengthMode, setMidiFxStrengthMode] = React.useState({
    left: [false, false], right: [false, false]
  });
  const [midiStatus, setMidiStatus] = React.useState({ code: 'loading', message: 'Loading MIDI…' });
  midiJogCleanupRef.current = clearAllJogNudges;
  const updatePitchStepFeedback = React.useCallback((event) => {
    const deck = event?.deck;
    const direction = event?.direction;
    if ((deck !== 'left' && deck !== 'right') || (direction !== 'decrease' && direction !== 'increase')) return;
    const active = event.active === true;
    setPitchStepFeedback(current => {
      if (current[deck][direction] === active) return current;
      const next = { left: { ...current.left }, right: { ...current.right } };
      next[deck][direction] = active;
      return next;
    });
  }, []);
  const clearFallbackPitchStep = React.useCallback((deck, delta) => {
    const direction = Number(delta) < 0 ? 'decrease' : 'increase';
    const key = deck + ':' + direction;
    const timer = pitchStepFallbackTimersRef.current.get(key);
    if (timer !== undefined) window.clearTimeout(timer);
    pitchStepFallbackTimersRef.current.delete(key);
    updatePitchStepFeedback({ deck: deck, direction: direction, active: false });
  }, [updatePitchStepFeedback]);
  const pulsePitchStep = React.useCallback((deck, delta) => {
    if (midiRef.current?.pulsePitchStep(deck, delta)) return;
    const direction = Number(delta) < 0 ? 'decrease' : 'increase';
    const key = deck + ':' + direction;
    const previous = pitchStepFallbackTimersRef.current.get(key);
    if (previous !== undefined) window.clearTimeout(previous);
    updatePitchStepFeedback({ deck: deck, direction: direction, active: true });
    const timer = window.setTimeout(() => {
      if (pitchStepFallbackTimersRef.current.get(key) !== timer) return;
      pitchStepFallbackTimersRef.current.delete(key);
      updatePitchStepFeedback({ deck: deck, direction: direction, active: false });
    }, pitchStepFeedbackMilliseconds);
    pitchStepFallbackTimersRef.current.set(key, timer);
  }, [updatePitchStepFeedback]);
  const cancelPitchStep = React.useCallback((deck, delta) => {
    if (midiRef.current) midiRef.current.clearPitchStep(deck, delta);
    else clearFallbackPitchStep(deck, delta);
  }, [clearFallbackPitchStep]);
  React.useEffect(() => {
    const clearGuiFeedback = () => {
      ['left', 'right'].forEach(deck => {
        [-0.1, 0.1].forEach(delta => cancelPitchStep(deck, delta));
      });
    };
    window.addEventListener('blur', clearGuiFeedback);
    return () => {
      window.removeEventListener('blur', clearGuiFeedback);
      pitchStepFallbackTimersRef.current.forEach(timer => window.clearTimeout(timer));
      pitchStepFallbackTimersRef.current.clear();
    };
  }, [cancelPitchStep]);
  const updateMidiEqCentered = React.useCallback((deck, nextValues) => {
    if (deck !== 'left' && deck !== 'right') return;
    setMidiEqCentered(current => {
      const previous = current[deck];
      if (previous.treble === nextValues.treble && previous.mid === nextValues.mid && previous.bass === nextValues.bass) return current;
      const next = { ...current };
      next[deck] = { ...nextValues };
      return next;
    });
  }, []);
  const updateMidiFxStrengthMode = React.useCallback((deck, slot, enabled) => {
    if ((deck !== 'left' && deck !== 'right') || (slot !== 0 && slot !== 1)) return;
    setMidiFxStrengthMode(current => {
      if (current[deck][slot] === enabled) return current;
      const modes = [...current[deck]];
      modes[slot] = enabled;
      const next = { ...current };
      next[deck] = modes;
      return next;
    });
  }, []);

  // Stage the fallback because the shipped JSX emitter drops grouping parentheses here.
  const leftTrackKey = leftTrack?.url || null;
  const rightTrackKey = rightTrack?.url || null;
  const leftMarkersCurrent = leftMarkers.trackUrl === leftTrackKey;
  const rightMarkersCurrent = rightMarkers.trackUrl === rightTrackKey;
  const leftCueAt = leftReady && leftMarkersCurrent && !leftIsPlaying &&
    Math.abs(leftProgress.currentTime - leftMarkers.cue) < 0.05;
  const rightCueAt = rightReady && rightMarkersCurrent && !rightIsPlaying &&
    Math.abs(rightProgress.currentTime - rightMarkers.cue) < 0.05;
  const midiLedState = React.useMemo(() => ({
    directoryMode: crateDirectoryMode === true,
    decks: {
      left: {
        pfl: monitor.left, loaded: Boolean(leftTrack), playing: leftIsPlaying, cueAt: leftCueAt,
        cueSet: leftMarkersCurrent && leftMarkers.cueSet === true,
        loopInSet: leftMarkersCurrent && leftMarkers.in !== null,
        loopActive: leftMarkersCurrent && leftMarkers.active === true,
        samplePlaying: Boolean(sampleChannels[0]?.playingId),
        eqCentered: midiEqCentered.left,
        fxStrengthMode: midiFxStrengthMode.left
      },
      right: {
        pfl: monitor.right, loaded: Boolean(rightTrack), playing: rightIsPlaying, cueAt: rightCueAt,
        cueSet: rightMarkersCurrent && rightMarkers.cueSet === true,
        loopInSet: rightMarkersCurrent && rightMarkers.in !== null,
        loopActive: rightMarkersCurrent && rightMarkers.active === true,
        samplePlaying: Boolean(sampleChannels[1]?.playingId),
        eqCentered: midiEqCentered.right,
        fxStrengthMode: midiFxStrengthMode.right
      }
    }
  }), [monitor.left, monitor.right, crateDirectoryMode, leftTrack, rightTrack, leftIsPlaying, rightIsPlaying, leftCueAt, rightCueAt,
    leftMarkersCurrent, rightMarkersCurrent, leftMarkers.cueSet, rightMarkers.cueSet,
    leftMarkers.in, rightMarkers.in, leftMarkers.active, rightMarkers.active,
    sampleChannels[0]?.playingId, sampleChannels[1]?.playingId, midiEqCentered, midiFxStrengthMode]);
  const midiLedStateRef = React.useRef(midiLedState);
  midiLedStateRef.current = midiLedState;

  React.useLayoutEffect(() => {
    midiActionRef.current = (action) => {
      if (action.type === 'pfl') {
        changeMonitor(action.deck, selected => !selected);
        return;
      }
      if (action.type === 'monitorMix' || action.type === 'monitorVolume') {
        changeMonitor(action.type === 'monitorMix' ? 'mix' : 'volume', action.value);
        return;
      }
      if (action.type === 'crossfader') {
        setCrossfader(Math.round(action.value * 100));
        return;
      }
      if (action.type === 'pitch') {
        changeDeckPitch(action.deck, action.value, true);
        return;
      }
      if (action.type === 'pitchStep') {
        adjustDeckPitch(action.deck, action.delta);
        return;
      }
      if (action.type === 'jog') {
        jogDeck(action.deck, action.delta);
        return;
      }
      if (action.type === 'browse-move') {
        if (crateMidiRef && crateMidiRef.current) crateMidiRef.current.moveSelection(action.delta);
        return;
      }
      if (action.type === 'browse-directory') {
        if (crateMidiRef && crateMidiRef.current) crateMidiRef.current.showDirectories();
        return;
      }
      if (action.type === 'browse-enter') {
        if (crateMidiRef && crateMidiRef.current) crateMidiRef.current.enterSelection();
        return;
      }
      if (action.type === 'load-track') {
        if (crateMidiRef && crateMidiRef.current) crateMidiRef.current.loadSelection(action.deck);
        return;
      }
      if (action.type === 'sampleMove' || action.type === 'sampleTrigger') {
        const control = sampleChannels[action.channel];
        if (!control) return;
        const currentIndex = Math.max(0, fxSamples.findIndex(sample => sample.id === control.selectedId));
        if (action.type === 'sampleMove') {
          const nextIndex = Math.max(0, Math.min(fxSamples.length - 1, currentIndex + action.delta));
          if (fxSamples[nextIndex]) control.select(fxSamples[nextIndex].id);
        } else {
          const sample = fxSamples[currentIndex];
          if (sample) control.trigger(sample.id);
        }
        return;
      }
      const deck = action.deck;
      if (deck !== 'left' && deck !== 'right') return;
      if (action.type === 'volume') {
        changeDeckVolume(deck, Math.round(action.value * 100));
        return;
      }
      if (action.type === 'eqvalue' || action.type === 'eqkill') {
        const apply = midiEQRef.current[deck];
        if (apply) apply(action);
        return;
      }
      if (action.type === 'fxvalue' || action.type === 'fxmode') {
        const slot = action.slot;
        if (slot !== 0 && slot !== 1) return;
        const apply = midiFxRef.current[deck][slot];
        if (apply) apply(action);
        return;
      }
      const track = deck === 'left' ? leftTrack : rightTrack;
      const ready = deck === 'left' ? leftReady : rightReady;
      if (!track) return;
      if (action.type === 'play') togglePlayPause(deck);
      else if (ready) {
        if (action.type === 'cue' || action.type === 'setcue') transportAction(deck, action.type);
        else if (action.type === 'loopIn') transportAction(deck, 'in');
        else if (action.type === 'loopOut') transportAction(deck, 'out');
      }
    };
  });

  React.useEffect(() => {
    let cancelled = false;
    let midi = null;
    const midiModule = window.webDeckMidiReady || Promise.reject('MIDI loader unavailable');
    midiModule.then((module) => {
      if (cancelled) return;
      midi = module.createTotalControlMidi({
        onAction: (action) => { if (midiActionRef.current) midiActionRef.current(action); },
        onPitchStepFeedback: updatePitchStepFeedback,
        onStatus: (status) => {
          if (status.code !== 'connected' && midiJogCleanupRef.current) midiJogCleanupRef.current();
          setMidiStatus(status);
        }
      });
      midiRef.current = midi;
      midi.setLedState(midiLedStateRef.current);
      setMidiStatus(midi.getStatus());
      if (onMidiApiChange) onMidiApiChange(midi);
      midi.restore();
    }).catch(() => {
      if (!cancelled) setMidiStatus({ code: 'error', message: 'MIDI module could not load' });
    });
    return () => {
      cancelled = true;
      midiActionRef.current = null;
      midiRef.current = null;
      if (onMidiApiChange) onMidiApiChange(null);
      if (midi) midi.destroy();
    };
  }, [onMidiApiChange, updatePitchStepFeedback]);
  React.useEffect(() => {
    if (midiRef.current) midiRef.current.setLedState(midiLedState);
  }, [midiLedState]);
  React.useEffect(() => {
    if (onMidiStatusChange) onMidiStatusChange(midiStatus);
  }, [midiStatus, onMidiStatusChange]);

  return (
    <div>
      {/* Audio elements - hidden but accessible via refs */}
      <div className="d-none">
        {leftTrack && (
          <audio 
            id="deck-A-audio"
            ref={leftAudioRef} 
            src={leftTrack?.url}
          />
        )}
        {rightTrack && (
          <audio 
            id="deck-B-audio"
            ref={rightAudioRef} 
            src={rightTrack?.url}
          />
        )}
      </div>

      {/* DJ Decks */}
      <div className="row deck-row">
        {/* Left Deck */}
        <div className="col-md-6">
          <Deck
            name="A"
            midiEQRef={midiEQRef}
            midiFxRef={midiFxRef}
            onMidiEqStateChange={updateMidiEqCentered}
            onMidiFxStateChange={updateMidiFxStrengthMode}
            sampleControl={<SampleKnob deck="A" channel={1} samples={fxSamples} control={sampleChannels[0]} />}
            settings={settings}
            track={leftTrack}
            audioRef={leftAudioRef}
            audioContext={audioContext}
            isPlaying={leftIsPlaying}
            setGainNode={setLeftGainNode}
            gainNode={leftGainNode}
            progress={leftProgress}
            pitch={leftPitch}
            rateRevision={leftRateRevision}
            volume={leftVolume}
            onVolumeChange={(value) => changeDeckVolume('left', value)}
            pitchStepActive={pitchStepFeedback.left}
            syncControl={(
              <button id="sync-A-to-B" type="button" className={`btn btn-sm btn-outline-info deck-sync${activeSyncDeck === 'left' ? ' is-synced' : ''}`}
                disabled={!syncAToB.enabled} aria-label="Sync Deck A to Deck B; B leads"
                aria-pressed={activeSyncDeck === 'left'}
                title={syncAToB.enabled ? 'Deck B leads: match Deck A tempo and align/start A on B’s next measured beat.' : syncAToB.reason}
                onClick={() => startSync('left')}>Sync</button>
            )}
            onPitchChange={(value) => changeDeckPitch('left', value, true)}
            onPitchAdjust={(delta) => { adjustDeckPitch('left', delta); pulsePitchStep('left', delta); }}
            onPitchStepCancel={(delta) => cancelPitchStep('left', delta)}
            onAnalysisChange={handleLeftAnalysisChange}
            onBeatMapChange={handleLeftBeatMapChange}
            beatMap={leftBeatMap}
            markers={leftMarkers}
            updateProgress={(currentTime, duration) => updateProgress("left", currentTime, duration)}
            formatTime={formatTime}
            onAnalyserCreated={handleLeftAnalyserCreated}
          />
        </div>

        {/* Right Deck */}
        <div className="col-md-6">
          <Deck
            name="B"
            midiEQRef={midiEQRef}
            midiFxRef={midiFxRef}
            onMidiEqStateChange={updateMidiEqCentered}
            onMidiFxStateChange={updateMidiFxStrengthMode}
            sampleControl={<SampleKnob deck="B" channel={2} samples={fxSamples} control={sampleChannels[1]} />}
            settings={settings}
            track={rightTrack}
            audioRef={rightAudioRef}
            audioContext={audioContext}
            isPlaying={rightIsPlaying}
            setGainNode={setRightGainNode}
            gainNode={rightGainNode}
            progress={rightProgress}
            pitch={rightPitch}
            rateRevision={rightRateRevision}
            volume={rightVolume}
            onVolumeChange={(value) => changeDeckVolume('right', value)}
            pitchStepActive={pitchStepFeedback.right}
            syncControl={(
              <button id="sync-B-to-A" type="button" className={`btn btn-sm btn-outline-info deck-sync${activeSyncDeck === 'right' ? ' is-synced' : ''}`}
                disabled={!syncBToA.enabled} aria-label="Sync Deck B to Deck A; A leads"
                aria-pressed={activeSyncDeck === 'right'}
                title={syncBToA.enabled ? 'Deck A leads: match Deck B tempo and align/start B on A’s next measured beat.' : syncBToA.reason}
                onClick={() => startSync('right')}>Sync</button>
            )}
            onPitchChange={(value) => changeDeckPitch('right', value, true)}
            onPitchAdjust={(delta) => { adjustDeckPitch('right', delta); pulsePitchStep('right', delta); }}
            onPitchStepCancel={(delta) => cancelPitchStep('right', delta)}
            onAnalysisChange={handleRightAnalysisChange}
            onBeatMapChange={handleRightBeatMapChange}
            beatMap={rightBeatMap}
            markers={rightMarkers}
            updateProgress={(currentTime, duration) => updateProgress("right", currentTime, duration)}
            formatTime={formatTime}
            onAnalyserCreated={handleRightAnalyserCreated}
          />
        </div>
      </div>

      {/* Shared deck transport and crossfader */}
      <div className="card bg-dark mb-3 shared-transport">
        <div className="card-body shared-loop-fx-row">
          <div className="loop-buttons">
            <button id="deck-A-loop-in" type="button" className="btn btn-sm btn-outline-light" disabled={!leftReady} aria-label="Deck A Loop In" title="Save Deck A loop start; clears the previous loop" onClick={() => transportAction('left', 'in')}>In A</button>
            <button id="deck-A-loop-out" type="button" className="btn btn-sm btn-outline-light" disabled={!leftReady} aria-label="Deck A Loop Out" aria-pressed={leftMarkers.active} title={leftMarkers.active ? 'Exit Deck A loop' : 'Save a later end and enable Deck A loop; press again to exit'} onClick={() => transportAction('left', 'out')}>{leftMarkers.active ? 'Loop A ●' : 'Out A'}</button>
            <button id="deck-A-auto-loop" type="button" className="btn btn-sm btn-outline-info" disabled={leftAutoLoopDisabled}
              aria-label={`Deck A Auto Loop, ${autoLoopBeats.left} measured beats`} aria-pressed={leftAutoLoopActive}
              title={leftAutoLoopActive ? 'Exit Deck A Auto Loop' : leftAutoLoopAvailability.enabled ? `Start a ${autoLoopBeats.left}-beat loop at the current measured beat` : leftAutoLoopAvailability.reason}
              onClick={() => toggleAutoLoop('left')}>Auto {autoLoopBeats.left}{leftAutoLoopActive ? ' ●' : ''}</button>
            <button type="button" className="btn btn-sm btn-outline-light auto-loop-cycle" disabled={!leftReady}
              aria-label="Cycle Deck A Auto Loop length: 4, 8, then 16 measured beats" title="Choose the next Auto Loop length"
              onClick={() => cycleAutoLoop('left')}>›</button>
            <small className="loop-status" title="Deck A loop positions">{leftMarkers.in === null ? 'No loop' : `In ${formatTime(leftMarkers.in)} / Out ${leftMarkers.out === null ? '—' : formatTime(leftMarkers.out)}`}</small>
            {leftMarkers.message && <small role="status">{leftMarkers.message}</small>}
          </div>
          <div className="loop-buttons loop-buttons-B">
            <button id="deck-B-loop-in" type="button" className="btn btn-sm btn-outline-light" disabled={!rightReady} aria-label="Deck B Loop In" title="Save Deck B loop start; clears the previous loop" onClick={() => transportAction('right', 'in')}>In B</button>
            <button id="deck-B-loop-out" type="button" className="btn btn-sm btn-outline-light" disabled={!rightReady} aria-label="Deck B Loop Out" aria-pressed={rightMarkers.active} title={rightMarkers.active ? 'Exit Deck B loop' : 'Save a later end and enable Deck B loop; press again to exit'} onClick={() => transportAction('right', 'out')}>{rightMarkers.active ? 'Loop B ●' : 'Out B'}</button>
            <button id="deck-B-auto-loop" type="button" className="btn btn-sm btn-outline-info" disabled={rightAutoLoopDisabled}
              aria-label={`Deck B Auto Loop, ${autoLoopBeats.right} measured beats`} aria-pressed={rightAutoLoopActive}
              title={rightAutoLoopActive ? 'Exit Deck B Auto Loop' : rightAutoLoopAvailability.enabled ? `Start a ${autoLoopBeats.right}-beat loop at the current measured beat` : rightAutoLoopAvailability.reason}
              onClick={() => toggleAutoLoop('right')}>Auto {autoLoopBeats.right}{rightAutoLoopActive ? ' ●' : ''}</button>
            <button type="button" className="btn btn-sm btn-outline-light auto-loop-cycle" disabled={!rightReady}
              aria-label="Cycle Deck B Auto Loop length: 4, 8, then 16 measured beats" title="Choose the next Auto Loop length"
              onClick={() => cycleAutoLoop('right')}>›</button>
            <small className="loop-status" title="Deck B loop positions">{rightMarkers.in === null ? 'No loop' : `In ${formatTime(rightMarkers.in)} / Out ${rightMarkers.out === null ? '—' : formatTime(rightMarkers.out)}`}</small>
            {rightMarkers.message && <small role="status">{rightMarkers.message}</small>}
          </div>
        </div>
        <div className="card-body shared-transport-row">
          <div className="cue-buttons">
            <button id="deck-A-cue" type="button" className="btn btn-sm btn-outline-light" disabled={!leftReady} aria-label="Deck A Cue" title={`Return to ${formatTime(leftMarkers.cue)} and pause Deck A`} onClick={() => transportAction('left', 'cue')}>Cue</button>
            <button id="deck-A-set-cue" type="button" className="btn btn-sm btn-outline-light" disabled={!leftReady} aria-label="Deck A Set Cue" title="Save Deck A current position as cue" onClick={() => transportAction('left', 'setcue')}>Set Cue</button>
          </div>
          <button
            type="button"
            className="btn btn-primary shared-play-button"
            aria-label={leftTrack ? `${leftIsPlaying ? "Pause" : "Play"} Deck A` : "Play Deck A (no track loaded)"}
            disabled={!leftTrack}
            onClick={() => togglePlayPause("left")}
          >
            {leftIsPlaying ? "Pause A" : "Play A"}
          </button>
          <div className="shared-crossfader">
            <label className="visually-hidden" htmlFor="mixer-crossfader">Crossfader</label>
            <input
              id="mixer-crossfader"
              type="range"
              className="dj-fader dj-fader-horizontal"
              aria-label="Crossfader"
              aria-valuetext={`${Number(crossfader).toFixed(1)}% toward Deck B`}
              min="0"
              max="100"
              step="1"
              value={crossfader}
              onChange={(e) => setCrossfader(parseInt(e.target.value))}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary shared-play-button"
            aria-label={rightTrack ? `${rightIsPlaying ? "Pause" : "Play"} Deck B` : "Play Deck B (no track loaded)"}
            disabled={!rightTrack}
            onClick={() => togglePlayPause("right")}
          >
            {rightIsPlaying ? "Pause B" : "Play B"}
          </button>
          <div className="cue-buttons">
            <button id="deck-B-set-cue" type="button" className="btn btn-sm btn-outline-light" disabled={!rightReady} aria-label="Deck B Set Cue" title="Save Deck B current position as cue" onClick={() => transportAction('right', 'setcue')}>Set Cue</button>
            <button id="deck-B-cue" type="button" className="btn btn-sm btn-outline-light" disabled={!rightReady} aria-label="Deck B Cue" title={`Return to ${formatTime(rightMarkers.cue)} and pause Deck B`} onClick={() => transportAction('right', 'cue')}>Cue</button>
          </div>
        </div>
        <div className="monitor-controls">
          <button type="button" id="split-cue" className="btn btn-sm btn-outline-info" aria-pressed={monitor.enabled} aria-describedby="split-cue-help" onClick={() => changeMonitor('enabled', !monitor.enabled)}>{monitor.enabled ? 'Split cue: On' : 'Split cue: Off'}</button>
          <button type="button" className="btn btn-sm btn-outline-light" aria-pressed={monitor.left} onClick={() => changeMonitor('left', selected => !selected)}>PFL A</button>
          <button type="button" className="btn btn-sm btn-outline-light" aria-pressed={monitor.right} onClick={() => changeMonitor('right', selected => !selected)}>PFL B</button>
          <label>PH Mix<input aria-label="PH Mix" title="Cue → master in headphones" type="range" min="0" max="1" step="0.01" value={monitor.mix} onChange={e => changeMonitor('mix', Number(e.target.value))} /></label>
          <label>PH Vol<input aria-label="PH Vol" type="range" min="0" max="1" step="0.01" value={monitor.volume} onChange={e => changeMonitor('volume', Number(e.target.value))} /></label>
          <label>Master<input aria-label="Master volume" type="range" min="0" max="1" step="0.01" value={monitor.masterVolume} onChange={e => changeMonitor('masterVolume', Number(e.target.value))} /></label>
          <small id="split-cue-help">DJ splitter: LEFT headphones · RIGHT speakers (mono). PH Mix: cue → master. Off: stereo master.</small>
        </div>
        <small className="visually-hidden" role="status">{visibleSyncStatus}</small>
      </div>
    </div>
  );
};

export default Mixer;
