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

const SharedHelp = ({ midiApi, midiStatus }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isPinned, setIsPinned] = React.useState(false);
  const helpRef = React.useRef(null);
  const [midiOpen, setMidiOpen] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen && !midiOpen) return undefined;
    const closeOutside = (event) => {
      if (!helpRef.current?.contains(event.target)) {
        setIsPinned(false);
        setIsOpen(false);
        setMidiOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [isOpen, midiOpen]);

  const togglePinnedHelp = () => {
    setMidiOpen(false);
    setIsPinned((currentlyPinned) => {
      const nextPinned = !currentlyPinned;
      setIsOpen(nextPinned);
      return nextPinned;
    });
  };

  const handleKeyDown = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    setIsPinned(false);
    setIsOpen(false);
    setMidiOpen(false);
  };

  return (
    <div
      ref={helpRef}
      className="shared-help"
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
      <button
        type="button"
        className="btn btn-sm btn-outline-light midi-popup-button"
        aria-expanded={midiOpen}
        aria-controls="dj-midi-panel"
        onMouseEnter={(event) => event.stopPropagation()}
        onMouseLeave={(event) => event.stopPropagation()}
        disabled={!midiApi}
        onClick={() => {
          setIsOpen(false); setIsPinned(false); setMidiOpen(open => !open);
          if (!midiOpen && midiApi && midiStatus?.code !== 'connected') midiApi.connect();
        }}
      >MIDI</button>
      <div id="dj-midi-panel" className="shared-help-panel midi-popup-panel" role="dialog"
        onMouseEnter={(event) => event.stopPropagation()}
        onMouseLeave={(event) => event.stopPropagation()}
        aria-label="MIDI controller" hidden={!midiOpen}>
        <strong>Numark Total Control</strong>
        {midiStatus?.code !== 'idle' && <p className="mb-2">{midiStatus?.code === 'connected' ? 'Connected' : midiStatus?.message}</p>}
        <div className="d-flex gap-2 mb-2">
          <button type="button" className="btn btn-sm btn-primary"
            disabled={!midiApi || ['requesting', 'connecting'].includes(midiStatus?.code)}
            onClick={() => midiApi && midiApi.connect(midiStatus && midiStatus.inputs && midiStatus.inputs.length === 1 ? { inputId: midiStatus.inputs[0].id } : {})}>
            Connect
          </button>
          <button type="button" className="btn btn-sm btn-outline-light"
            disabled={!midiApi}
            onClick={() => midiApi && midiApi.disconnect()}>Disconnect</button>
        </div>
        {midiStatus?.inputs?.length > 1 && <div className="mb-2">
          {midiStatus.inputs.map(input => <button key={input.id} type="button" className="btn btn-sm btn-outline-info me-1 mb-1"
            onClick={() => midiApi && midiApi.connect({ inputId: input.id })}>{input.name}</button>)}
        </div>}
        <p className="small mb-2">Gain knobs control pitch/speed (center is normal); physical pitch sliders are unused. Pitch-bend −/+ buttons persistently fine-adjust that deck by 0.1 percentage points per press. Center encoder browses folders and tracks. Directory returns to folders; Load buttons load the selected track into Deck A or B without starting playback.</p>
        <p className="small mb-2">Note 79 provisionally enters the selected folder. Its physical center-push assignment is not verified; click a folder to enter it.</p>
        <img className="midi-guide-image" src="./assets/midi/numark-total-control/numark-total-control-guide.svg" alt="Numark Total Control mapping guide" />
      </div>
      <div
        id="shared-dj-help-panel"
        className="shared-help-panel"
        role="region"
        aria-labelledby="shared-dj-help-button"
        hidden={!isOpen}
      >
        <strong>Track timelines — both decks</strong>
        <nav className="help-navigation mb-3" aria-label="Site navigation">
          <a href="./dj.html" className="btn btn-sm btn-primary">DJ</a>
          <a href="./index.html" className="btn btn-sm btn-primary">Itunes</a>
          <a href="https://getfrom.net/cms/soundboard.php" className="btn btn-sm btn-primary">Soundboard</a>
        </nav>
        <p>The full-song overview runs left (start) to right (end). Click or tap to seek; use Left/Right to move five seconds, or Home/End. Seeking keeps the current play/pause state. The white line is the playhead; brighter bars have been played. Each vertical waveform preview runs top to bottom and scrolls upward during playback. Its corner button switches between 35 seconds (five above the fixed playhead, thirty below) and 8 seconds (two above, six below). Waveforms reuse the full-file detailed timeline data; measured beat ticks sit at the edge.</p>
        <p>Each loaded track is analyzed in full locally by the pinned Degara worker. BPM follows playback speed; Sync uses measured beat ticks, not an invented grid. The gear starts or terminates automatic analysis work for both decks.</p>
        <p>Set Cue saves this deck's current position; Cue returns there and pauses (initially the start). Loading another track clears that deck's cue and loop. Loop In saves the start; Loop Out must be later, enables the loop, and a second press exits. Auto Loop starts on a measured beat; its arrow cycles 4, 8, and 16 measured beats. Missing or insufficient measured ticks disables/rejects it. Seeking outside an active loop exits it and keeps play/pause unchanged. Loop timing uses media events and a playing-only deadline, not sample-accurate audio scheduling.</p>
        <p>Turn Samples or use arrow keys to select an imported clip; click, Enter or Space restarts it on an independent, moderate-volume channel. Select is silent; Preview plays. Add Samples MP3 Directory keeps samples separate from music. No clip plays automatically.</p>
        <p>Each deck has two independent FX slots. Track keeps a slot in that deck's serial rack; Global moves that slot to the real combined Deck A/B master rack, ordered A1, A2, B1, B2. Samples remain on their separate path. Turn a knob to select Filter, Echo, Reverb, Flanger, Phaser, or Beatgrid; click, Enter, or Space to switch to strength, then repeat to return to selection. Routing preserves the slot selection, strength, and mode. Selecting an effect resets that slot to dry. Beatgrid is a buffered beat-repeat aligned to measured timing; Global Beatgrid explicitly uses Deck A when its map is usable, otherwise Deck B, and stays unavailable when neither is usable.</p>
        <p>Click Bass, Mid or Treble once (or Enter/Space) to toggle band kill. The selected rotary gain is retained; dragging or arrow keys adjust it without toggling kill. Kill applies -40 dB to the existing shelf/peak filter, not perfect isolated-band silence or a master mute.</p>
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
  const crateMidiRef = React.useRef(null);
  const registerCrateMidiActions = React.useCallback((actions) => {
    crateMidiRef.current = actions;
  }, []);
  const [midiApi, setMidiApi] = React.useState(null);
  const [midiStatus, setMidiStatus] = React.useState({ code: 'loading', message: 'Loading MIDI…' });
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
      setFxError("This sample is unavailable. Import its directory again.");
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
      setFxError("Sample could not play. Check the MP3 file and try Preview again.");
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
        setFxError("Sample file is missing or cannot be decoded. Import a playable MP3.");
      }} />
      <div className="container-fluid p-0 m-0"> 
        <div className="card mb-4 bg-transparent">
          <div
            className="card-body"
            style={{ color: "#fff" }}
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
               crateMidiRef={crateMidiRef}
               onMidiApiChange={setMidiApi}
               onMidiStatusChange={setMidiStatus}
            />

            <Crate 
              onFxSamplesChange={setFxSamples}
              selectedFxId={selectedFxId}
              onSelectFx={setSelectedFxId}
              onPreviewFx={previewFx}
              onSelectLeftTrack={handleSelectLeftTrack}
              onSelectRightTrack={handleSelectRightTrack}
               onRegisterMidiActions={registerCrateMidiActions}
            />
          </div>
        </div>
        
        <footer className="dj-tools" aria-label="DJ tools">
          <SharedHelp midiApi={midiApi} midiStatus={midiStatus} />
          {audioContext && (
            <ButterVisualizer
              settings={settings}
              onSettingChange={changeSetting}
              leftAudioNode={leftAnalyzer}
              rightAudioNode={rightAnalyzer}
            />
          )}
        </footer>
      </div>
    </div>
  );
};

ReactDOM.render(<App />, document.getElementById("react-root"));
