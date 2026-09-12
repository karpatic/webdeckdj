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

const getMidiStatusMessage = (status) => {
  if (!status) return '';
  const messages = [];
  if (status.message) messages.push(status.message);
  const lightingMessage = status.lighting && status.lighting.message;
  if (lightingMessage && lightingMessage !== status.message) messages.push(lightingMessage);
  return messages.join(' · ');
};

const useSampleChannel = (samples) => {
  const [selectedId, select] = React.useState(null);
  const [playingId, setPlayingId] = React.useState(null);
  const [error, setError] = React.useState("");
  const audioRef = React.useRef(null);
  const playbackRef = React.useRef({ id: null, url: null, token: 0 });

  const stop = React.useCallback(() => {
    const playback = playbackRef.current;
    const audio = audioRef.current;
    playback.token += 1;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    if (playback.url) URL.revokeObjectURL(playback.url);
    playback.id = null;
    playback.url = null;
    setPlayingId(null);
  }, []);

  React.useEffect(() => {
    select(current => samples.some(sample => sample.id === current)
      ? current
      : samples.length ? samples[0].id : null);
    const activeId = playbackRef.current.id;
    if (activeId && !samples.some(sample => sample.id === activeId)) stop();
  }, [samples, stop]);

  React.useEffect(() => () => stop(), [stop]);

  const trigger = React.useCallback((id) => {
    const sample = samples.find(item => item.id === id);
    stop();
    setError("");
    const validFile = sample && sample.file instanceof Blob;
    if (!validFile || !sample.file.size) {
      setError("This sample is unavailable. Import its directory again.");
      return;
    }
    select(id);
    const audio = audioRef.current;
    if (!audio) return;
    const playback = playbackRef.current;
    const token = playback.token;
    playback.id = id;
    playback.url = URL.createObjectURL(sample.file);
    window.dj.routeSample(audio);
    audio.volume = 0.35;
    audio.src = playback.url;
    audio.play().then(() => {
      if (playbackRef.current.token === token) setPlayingId(id);
    }).catch(() => {
      if (playbackRef.current.token !== token) return;
      stop();
      setError("Sample could not play. Check the MP3 file and try again.");
    });
  }, [samples, stop]);

  const audioProps = {
    ref: audioRef,
    preload: "none",
    onEnded: stop,
    onError: () => {
      if (!playbackRef.current.id) return;
      stop();
      setError("Sample file is missing or cannot be decoded. Import a playable MP3.");
    }
  };
  return { selectedId, playingId, error, select, trigger, audioProps };
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
        <p className="small mb-2">The guide shows the current input mapping: dual FX modes, independent Samples1/2, Gain-to-pitch, lit pitch-step feedback, playing/paused jog behavior, EQ push-kill, loops, transport, mixing, and crate navigation. Gray controls are not mapped. Browse press enters a folder; Load A/B never starts playback.</p>
        <img className="midi-guide-image" src="./assets/midi/numark-total-control/numark-total-control-guide.svg?v=monitor-midi-1" alt="Current WebDeckDJ MIDI mapping for the Numark Total Control; gray controls are unmapped" />
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
        <p>Samples1 and Samples2 share the imported sample bank but select and play independently, so both can overlap. Turn either knob or use arrow keys to select silently; click, Enter or Space restarts only that channel. Select Sample and Preview in the crate continue to operate Samples1. Add Samples MP3 Directory keeps samples separate from music. No clip plays automatically.</p>
        <p>Each deck has two independent, serial audio FX slots. Turn a knob to select Filter, Echo, Reverb, Flanger, Phaser, or Beatgrid; click, Enter, or Space to switch to strength, then repeat to return to selection. Selecting an effect resets that slot to dry. Beatgrid is a buffered beat-repeat aligned to the deck's measured map and chosen downbeat; it stays unavailable until measured BPM exists.</p>
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
  const [crateDirectoryMode, setCrateDirectoryMode] = React.useState(false);
  const [fxSamples, setFxSamples] = React.useState([]);
  const samples1 = useSampleChannel(fxSamples);
  const samples2 = useSampleChannel(fxSamples);
  const midiStatusMessage = getMidiStatusMessage(midiStatus);
  
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
      <audio id="dj-samples-1-audio" {...samples1.audioProps} />
      <audio id="dj-samples-2-audio" {...samples2.audioProps} />
      <div className="container-fluid p-0 m-0"> 
        <div className="card mb-4 bg-transparent">
          <div
            className="card-body"
            style={{ color: "#fff" }}
          >
            <Mixer 
              fxSamples={fxSamples}
              sampleChannels={[samples1, samples2]}
              settings={settings}
              leftTrack={leftTrack}
              rightTrack={rightTrack}
              getLeftAnalyzer={getLeftAnalyzer}
              getRightAnalyzer={getRightAnalyzer}
               crateMidiRef={crateMidiRef}
               crateDirectoryMode={crateDirectoryMode}
               onMidiApiChange={setMidiApi}
               onMidiStatusChange={setMidiStatus}
            />

            <Crate 
              onFxSamplesChange={setFxSamples}
              selectedFxId={samples1.selectedId}
              onSelectFx={samples1.select}
              onPreviewFx={samples1.trigger}
              onSelectLeftTrack={handleSelectLeftTrack}
               onSelectRightTrack={handleSelectRightTrack}
               onRegisterMidiActions={registerCrateMidiActions}
               onMidiDirectoryModeChange={setCrateDirectoryMode}
            />
            {midiStatusMessage && <p className={`midi-status-footer${midiStatus?.lighting?.code === 'error' || midiStatus?.code === 'error' ? ' text-warning' : ''}`}
              role="status" aria-live="polite">{midiStatusMessage}</p>}
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
