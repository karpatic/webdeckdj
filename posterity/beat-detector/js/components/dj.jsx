import React from "react";
import ReactDOM from "react-dom";
import "../utils/audio.js";
import Crate from "./crate.jsx";
import Mixer from "./mixer.jsx";
import ButterVisualizer from "./butter.jsx";

const SETTINGS_KEY = 'webdeckdj.performance.v1';
const DEFAULT_SETTINGS = {
  background: true,
  waveform: true,
  spectrum: true,
  automaticAnalysis: true,
  detailedTimeline: true
};

const readSettings = () => {
  const settings = { ...DEFAULT_SETTINGS };
  try {
    const saved = JSON.parse(window.localStorage.getItem(SETTINGS_KEY));
    Object.keys(settings).forEach((key) => {
      if (saved && typeof saved[key] === 'boolean') settings[key] = saved[key];
    });
  } catch (error) {
    // Private browsing, blocked storage, or old invalid values must not block playback.
  }
  return settings;
};

const SharedHelp = ({ visualizerReady }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isPinned, setIsPinned] = React.useState(false);
  const [position, setPosition] = React.useState({ buttonRight: 10, panelTop: 52 });
  const helpRef = React.useRef(null);

  React.useLayoutEffect(() => {
    if (!visualizerReady) return undefined;
    const visualizerControls = document.querySelector('.visualizer-controls');
    if (!visualizerControls) return undefined;

    const updatePosition = () => {
      const controlsRect = visualizerControls.getBoundingClientRect();
      const controlRightEdge = window.innerWidth - controlsRect.left;
      const helpGap = 8;
      const buttonRight = controlRightEdge + helpGap;
      const panelTop = controlsRect.bottom + helpGap;
      setPosition((currentPosition) => (
        currentPosition.buttonRight === buttonRight && currentPosition.panelTop === panelTop
          ? currentPosition
          : { buttonRight, panelTop }
      ));
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    const resizeObserver = typeof window.ResizeObserver === 'function'
      ? new window.ResizeObserver(updatePosition)
      : null;
    if (resizeObserver) resizeObserver.observe(visualizerControls);

    return () => {
      window.removeEventListener('resize', updatePosition);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [visualizerReady]);

  const togglePinnedHelp = () => {
    setIsPinned((currentlyPinned) => {
      const nextPinned = !currentlyPinned;
      setIsOpen(nextPinned);
      return nextPinned;
    });
  };

  const handleMouseLeave = () => {
    const activeElement = document.activeElement;
    const containsFocus = helpRef.current && helpRef.current.contains(activeElement);
    if (!isPinned && !containsFocus) setIsOpen(false);
  };

  const handleBlur = (event) => {
    if (!isPinned && !event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
  };

  const handleKeyDown = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    setIsPinned(false);
    setIsOpen(false);
  };

  return (
    <div
      ref={helpRef}
      className="shared-help"
      style={{ right: `${position.buttonRight}px` }}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={handleMouseLeave}
      onFocus={() => setIsOpen(true)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    >
      <button
        id="shared-dj-help-button"
        type="button"
        className="btn btn-sm btn-outline-light shared-help-button"
        aria-expanded={isOpen}
        aria-controls="shared-dj-help-panel"
        onClick={togglePinnedHelp}
      >
        Help
      </button>
      <div
        id="shared-dj-help-panel"
        className="shared-help-panel"
        role="region"
        aria-labelledby="shared-dj-help-button"
        hidden={!isOpen}
        style={{ top: `${position.panelTop}px` }}
      >
        <strong>Track timelines — both decks</strong>
        <p>Time runs from bottom (start) to top (end). Click or tap to seek; use Up/Down to move five seconds, or Home/End. Seeking keeps the current play/pause state. The white line is the playhead; brighter bars have been played.</p>
        <p>Tap to set BPM. Turn the knob to adjust automatic beat-detection sensitivity. The gear opens performance settings for both decks. Manual taps still work with automatic analysis off; the simple seek slider keeps the same timeline direction and keys.</p>
        <p>Set Cue saves this deck's current position; Cue returns there and pauses (initially the start). Loading another track clears that deck's cue and loop. Loop In saves the start; Loop Out must be later, enables the loop, and a second press exits. Seeking outside an active loop exits it and keeps play/pause unchanged. Loop timing uses media events and a playing-only deadline, not sample-accurate audio scheduling.</p>
        <p>Turn FX or use arrow keys to select an imported FX clip; click, Enter or Space restarts it on an independent, moderate-volume channel. Select is silent; Preview plays. Add FX MP3 Directory keeps effects separate from music. No clip plays automatically.</p>
        <p>Click Bass, Mid or Treble once (or Enter/Space) to toggle band kill. The selected rotary gain is retained; dragging or arrow keys adjust it without toggling kill. Kill applies -40 dB to the existing shelf/peak filter, not perfect isolated-band silence or a master mute. BPM still uses two stationary taps to begin manual tempo.</p>
        <p className="mb-1">Frequency color shows the strongest band:</p>
        <ul>
          <li><span style={{ color: '#FF3262' }}>■</span> Bass</li>
          <li><span style={{ color: '#FFAA00' }}>■</span> Low-mid</li>
          <li><span style={{ color: '#12E772' }}>■</span> Mid</li>
          <li><span style={{ color: '#00C5FF' }}>■</span> High-mid</li>
          <li><span style={{ color: '#A669FF' }}>■</span> Treble</li>
        </ul>
      </div>
    </div>
  );
};

const App = () => {
  const [settings, setSettings] = React.useState(readSettings);
  const changeSetting = React.useCallback((key, enabled) => {
    setSettings((current) => {
      const next = { ...current };
      next[key] = enabled;
      return next;
    });
  }, []);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      // Settings still work for this session when storage is unavailable.
    }
  }, [settings]);

  // Track states
  const [leftTrack, setLeftTrack] = React.useState(null);
  const [rightTrack, setRightTrack] = React.useState(null);
  const [fxSamples, setFxSamples] = React.useState([]);
  const [selectedFxId, setSelectedFxId] = React.useState(null);
  const [fxPlayingId, setFxPlayingId] = React.useState(null);
  const [fxError, setFxError] = React.useState("");
  const fxAudioRef = React.useRef(null);
  const fxPlaybackRef = React.useRef({ id: null, url: null, token: 0 });

  const stopFx = React.useCallback(() => {
    const playback = fxPlaybackRef.current;
    const audio = fxAudioRef.current;
    playback.token += 1;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    if (playback.url) URL.revokeObjectURL(playback.url);
    playback.id = null;
    playback.url = null;
    setFxPlayingId(null);
  }, []);

  React.useEffect(() => {
    setSelectedFxId(current => {
      if (fxSamples.some(sample => sample.id === current)) return current;
      return fxSamples.length ? fxSamples[0].id : null;
    });
    const activeId = fxPlaybackRef.current.id;
    if (activeId && !fxSamples.some(sample => sample.id === activeId)) stopFx();
  }, [fxSamples, stopFx]);

  React.useEffect(() => () => stopFx(), [stopFx]);

  const previewFx = (id) => {
    const sample = fxSamples.find(item => item.id === id);
    stopFx();
    setFxError("");
    const validFile = sample && sample.file instanceof Blob;
    if (!validFile || !sample.file.size) {
      setFxError("This FX file is unavailable. Import its directory again.");
      return;
    }
    setSelectedFxId(id);
    const audio = fxAudioRef.current;
    if (!audio) return;
    const playback = fxPlaybackRef.current;
    const token = playback.token;
    playback.id = id;
    playback.url = URL.createObjectURL(sample.file);
    audio.volume = 0.35;
    audio.src = playback.url;
    audio.play().then(() => {
      if (fxPlaybackRef.current.token === token) setFxPlayingId(id);
    }).catch(() => {
      if (fxPlaybackRef.current.token !== token) return;
      stopFx();
      setFxError("FX could not play. Check the MP3 file and try Preview again.");
    });
  };
  
  // Audio context for potential visualizers
  const [audioContext, setAudioContext] = React.useState(null);
  
  // Analyzer nodes for visualization
  const [leftAnalyzer, setLeftAnalyzer] = React.useState(null);
  const [rightAnalyzer, setRightAnalyzer] = React.useState(null);

  // Initialize audio context for potential future use
  React.useEffect(() => { 
    const audioCtx =  window.dj.audio.getAudioContext();
    setAudioContext(audioCtx); 
    return () => { 
      // No specific cleanup needed for audioContext
    };
  }, []);

  // Separate ownership: changing B must never revoke the still-loaded A URL.
  React.useEffect(() => {
    return () => { if (leftTrack?.url) URL.revokeObjectURL(leftTrack.url); };
  }, [leftTrack]);
  React.useEffect(() => {
    return () => { if (rightTrack?.url) URL.revokeObjectURL(rightTrack.url); };
  }, [rightTrack]);

  const handleSelectLeftTrack = (file) => {
    window.dj.audio.resumeAudioContext();


    const url = window.dj.audio.createAudioFileUrl(file);
    setLeftTrack({ file, url });
  };

  const handleSelectRightTrack = (file) => {
    window.dj.audio.resumeAudioContext();
 

    const url = window.dj.audio.createAudioFileUrl(file);
    setRightTrack({ file, url });
  };
  
  // Get a reference to the analyzer node from the left deck
  const getLeftAnalyzer = React.useCallback((analyzerNode) => {
    console.log("Got left analyzer node:", analyzerNode ? "Yes" : "No");
    setLeftAnalyzer(analyzerNode);
  }, []);
  
  // Get a reference to the analyzer node from the right deck
  const getRightAnalyzer = React.useCallback((analyzerNode) => {
    console.log("Got right analyzer node:", analyzerNode ? "Yes" : "No");
    setRightAnalyzer(analyzerNode);
  }, []);

  return (
    <div className="dj-app">
      <audio id="dj-fx-audio" ref={fxAudioRef} preload="none" onEnded={stopFx} onError={() => {
        if (!fxPlaybackRef.current.id) return;
        stopFx();
        setFxError("FX file is missing or cannot be decoded. Import a playable MP3.");
      }} />
      <SharedHelp visualizerReady={Boolean(audioContext)} />
      <div className="container py-4"> 
        <div className="card mb-4">
          <div
            className="card-body"
            style={{ backgroundColor: "#222", color: "#fff" }}
          >
            <Mixer 
              fxSamples={fxSamples}
              selectedFxId={selectedFxId}
              onSelectFx={setSelectedFxId}
              onPreviewFx={previewFx}
              fxPlayingId={fxPlayingId}
              fxError={fxError}
              settings={settings}
              leftTrack={leftTrack}
              rightTrack={rightTrack}
              getLeftAnalyzer={getLeftAnalyzer}
              getRightAnalyzer={getRightAnalyzer}
            />

            <Crate 
              onFxSamplesChange={setFxSamples}
              selectedFxId={selectedFxId}
              onSelectFx={setSelectedFxId}
              onPreviewFx={previewFx}
              onSelectLeftTrack={handleSelectLeftTrack}
              onSelectRightTrack={handleSelectRightTrack}
            />
          </div>
        </div>
        
        {audioContext && (
          <ButterVisualizer  
            settings={settings}
            onSettingChange={changeSetting}
            leftAudioNode={leftAnalyzer}
            rightAudioNode={rightAnalyzer}
          />
        )}
      </div>
    </div>
  );
};

ReactDOM.render(<App />, document.getElementById("react-root"));
