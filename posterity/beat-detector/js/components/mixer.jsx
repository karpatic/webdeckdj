import React from "react";  
import Deck from "./deck.jsx";
import RotaryControl from "./rotary.jsx";

const emptyMarkers = (trackUrl) => ({ trackUrl, cue: 0, in: null, out: null, active: false, message: "" });

const Mixer = ({ 
  fxSamples,
  selectedFxId,
  onSelectFx,
  onPreviewFx,
  fxPlayingId,
  fxError,
  settings,
  leftTrack, 
  rightTrack,
  getLeftAnalyzer,
  getRightAnalyzer
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
  
  // Track progress state
  const [leftProgress, setLeftProgress] = React.useState({ currentTime: 0, duration: 0 });
  const [rightProgress, setRightProgress] = React.useState({ currentTime: 0, duration: 0 });
  const [leftSeekVersion, setLeftSeekVersion] = React.useState(0);
  const [rightSeekVersion, setRightSeekVersion] = React.useState(0);
  const [leftMarkers, setLeftMarkers] = React.useState(() => emptyMarkers(null));
  const [rightMarkers, setRightMarkers] = React.useState(() => emptyMarkers(null));

  const transportAction = (deck, action) => {
    const isLeft = deck === 'left';
    const audio = isLeft ? leftAudioRef.current : rightAudioRef.current;
    const markers = isLeft ? leftMarkers : rightMarkers;
    const setMarkers = isLeft ? setLeftMarkers : setRightMarkers;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const position = Math.min(audio.duration, Math.max(0, audio.currentTime));
    if (action === 'setcue') {
      setMarkers(current => ({ ...current, cue: position, message: '' }));
    } else if (action === 'cue') {
      audio.pause();
      audio.currentTime = Math.min(audio.duration, Math.max(0, markers.cue));
    } else if (action === 'in') {
      setMarkers(current => ({ ...current, in: position, out: null, active: false, message: '' }));
    } else if (markers.active) {
      setMarkers(current => ({ ...current, active: false, message: '' }));
    } else if (markers.in === null || position <= markers.in) {
      setMarkers(current => ({ ...current, message: 'Loop Out must be later than Loop In.' }));
    } else {
      setMarkers(current => ({ ...current, out: position, active: true, message: '' }));
      // Capturing Out starts at In without changing the paused state.
      audio.currentTime = markers.in;
    }
  };

  // One deadline per actively playing loop; no new RAF or idle polling.
  // Native seeking events still reach the existing beat-history reset handlers.
  React.useEffect(() => {
    const cleanups = [];
    const decks = [
      { audio: leftAudioRef.current, track: leftTrack, markers: leftMarkers, setMarkers: setLeftMarkers },
      { audio: rightAudioRef.current, track: rightTrack, markers: rightMarkers, setMarkers: setRightMarkers }
    ];
    decks.forEach(({ audio, track, markers, setMarkers }) => {
      if (!audio || !markers.active || markers.trackUrl !== track?.url) return;
      let timer = null;
      let disposed = false;
      const clearDeadline = () => { if (timer !== null) window.clearTimeout(timer); timer = null; };
      const exitLoop = () => {
        if (disposed) return;
        clearDeadline();
        disposed = true;
        setMarkers(current => ({ ...current, active: false }));
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
          audio.currentTime = markers.in;
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
        const end = Math.min(markers.out, audio.duration);
        const outside = audio.currentTime < markers.in || audio.currentTime >= end;
        if (outside) exitLoop();
      };
      const events = ['play', 'pause', 'timeupdate', 'seeked', 'ratechange', 'durationchange', 'ended'];
      events.forEach(event => audio.addEventListener(event, syncLoop));
      audio.addEventListener('seeking', onSeeking);
      syncLoop();
      cleanups.push(() => {
        disposed = true;
        clearDeadline();
        events.forEach(event => audio.removeEventListener(event, syncLoop));
        audio.removeEventListener('seeking', onSeeking);
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

  // Handle crossfader changes
  React.useEffect(() => {
    if (audioContext) {
      console.log("Attempting to update crossfader:", crossfader);
      console.log("Left gain node:", leftGainNode ? "available" : "not available");
      console.log("Right gain node:", rightGainNode ? "available" : "not available");
      
      const success = window.dj.audio.updateCrossfader(
        leftGainNode, 
        rightGainNode, 
        crossfader
      );
      
      if (!success) {
        console.log("Crossfader not fully applied - waiting for gain nodes to be available");
      }
    }
  }, [crossfader, leftGainNode, rightGainNode, audioContext]);

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
      prevLeftTrackRef.current = leftTrack;
      setLeftMarkers(emptyMarkers(leftTrack?.url));

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
      setLeftIsPlaying(false);
      stopProgressSync();
      syncProgress();
    };

    const handleSeeking = () => {
      syncProgress();
      setLeftSeekVersion((version) => version + 1);
    };

    const handleSeeked = () => {
      syncProgress();
      if (!leftAudio.paused && !leftAudio.ended) startProgressSync();
    };

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
      stopProgressSync();
      leftAudio.removeEventListener('timeupdate', syncProgress);
      leftAudio.removeEventListener('loadedmetadata', syncProgress);
      leftAudio.removeEventListener('durationchange', syncProgress);
      leftAudio.removeEventListener('seeking', handleSeeking);
      leftAudio.removeEventListener('seeked', handleSeeked);
      leftAudio.removeEventListener('play', handlePlay);
      leftAudio.removeEventListener('pause', handlePause);
      leftAudio.removeEventListener('ended', handlePause);
    };
  }, [leftTrack, settings.detailedTimeline]);
  
  // Handle track changes for right deck
  React.useEffect(() => {
    const rightAudio = rightAudioRef.current;

    // Check if the track URL has changed
    if (prevRightTrackRef.current?.url !== rightTrack?.url) {
      console.log("Right track changed, updating audio element");
      prevRightTrackRef.current = rightTrack;
      setRightMarkers(emptyMarkers(rightTrack?.url));

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
      setRightIsPlaying(false);
      stopProgressSync();
      syncProgress();
    };

    const handleSeeking = () => {
      syncProgress();
      setRightSeekVersion((version) => version + 1);
    };

    const handleSeeked = () => {
      syncProgress();
      if (!rightAudio.paused && !rightAudio.ended) startProgressSync();
    };

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
      stopProgressSync();
      rightAudio.removeEventListener('timeupdate', syncProgress);
      rightAudio.removeEventListener('loadedmetadata', syncProgress);
      rightAudio.removeEventListener('durationchange', syncProgress);
      rightAudio.removeEventListener('seeking', handleSeeking);
      rightAudio.removeEventListener('seeked', handleSeeked);
      rightAudio.removeEventListener('play', handlePlay);
      rightAudio.removeEventListener('pause', handlePause);
      rightAudio.removeEventListener('ended', handlePause);
    };
  }, [rightTrack, settings.detailedTimeline]);

  const selectedFxIndex = Math.max(0, fxSamples.findIndex(sample => sample.id === selectedFxId));
  const selectedFx = fxSamples[selectedFxIndex];
  const leftReady = Boolean(leftTrack) && leftProgress.duration > 0;
  const rightReady = Boolean(rightTrack) && rightProgress.duration > 0;

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
      <div className="row mb-3">
        {/* Left Deck */}
        <div className="col-md-6">
          <Deck
            name="A"
            settings={settings}
            track={leftTrack}
            audioRef={leftAudioRef}
            audioContext={audioContext}
            isPlaying={leftIsPlaying}
            setGainNode={setLeftGainNode}
            gainNode={leftGainNode}
            progress={leftProgress}
            seekVersion={leftSeekVersion}
            updateProgress={(currentTime, duration) => updateProgress("left", currentTime, duration)}
            formatTime={formatTime}
            onAnalyserCreated={handleLeftAnalyserCreated}
          />
        </div>

        {/* Right Deck */}
        <div className="col-md-6">
          <Deck
            name="B"
            settings={settings}
            track={rightTrack}
            audioRef={rightAudioRef}
            audioContext={audioContext}
            isPlaying={rightIsPlaying}
            setGainNode={setRightGainNode}
            gainNode={rightGainNode}
            progress={rightProgress}
            seekVersion={rightSeekVersion}
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
            <small className="loop-status" title="Deck A loop positions">{leftMarkers.in === null ? 'No loop' : `In ${formatTime(leftMarkers.in)} / Out ${leftMarkers.out === null ? '—' : formatTime(leftMarkers.out)}`}</small>
            {leftMarkers.message && <small role="status">{leftMarkers.message}</small>}
          </div>
          <div className="shared-fx-control">
            <RotaryControl
              id="mixer-fx" label="FX" min={0} max={Math.max(0, fxSamples.length - 1)} step={1}
              value={selectedFxIndex} singleTap={true} disabled={!selectedFx}
              onChange={(index) => { if (fxSamples[index]) onSelectFx(fxSamples[index].id); }}
              onTap={() => { if (selectedFx) onPreviewFx(selectedFx.id); }}
              accessibleName={selectedFx ? `Play FX ${selectedFx.label}; arrow keys select sample` : 'FX — import an FX MP3 directory'}
              title="Turn / arrow keys select FX; stationary click, Enter or Space restarts the selected clip"
              formatValue={() => selectedFx ? selectedFx.label : 'Import FX'}
            />
            <small id="fx-playback-status" role="status">{fxError}</small>
          </div>
          <div className="loop-buttons loop-buttons-B">
            <button id="deck-B-loop-in" type="button" className="btn btn-sm btn-outline-light" disabled={!rightReady} aria-label="Deck B Loop In" title="Save Deck B loop start; clears the previous loop" onClick={() => transportAction('right', 'in')}>In B</button>
            <button id="deck-B-loop-out" type="button" className="btn btn-sm btn-outline-light" disabled={!rightReady} aria-label="Deck B Loop Out" aria-pressed={rightMarkers.active} title={rightMarkers.active ? 'Exit Deck B loop' : 'Save a later end and enable Deck B loop; press again to exit'} onClick={() => transportAction('right', 'out')}>{rightMarkers.active ? 'Loop B ●' : 'Out B'}</button>
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
              aria-valuetext={`${crossfader}% toward Deck B`}
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
      </div>
    </div>
  );
};

export default Mixer;
