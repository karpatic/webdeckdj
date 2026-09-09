import React from "react";   
import "../utils/visual.js";   
import BeatDetector from "./detect.jsx";
import EQ from "./eq.jsx";
import Track from "./track.jsx";
const Fragment = React.Fragment;

const Deck = ({ 
  settings,
  name,
  track,
  audioRef,
  audioContext,
  isPlaying,
  progress,
  pitch,
  onPitchChange,
  volume,
  onVolumeChange,
  midiEQRef,
  syncControl,
  onAnalysisChange,
  onBeatMapChange,
  beatMap,
  updateProgress,
  formatTime,
  gainNode,
  setGainNode,
  onAnalyserCreated
}) => {
  // Audio processing nodes
  const [sourceNode, setSourceNode] = React.useState(null); 
  const [analyser, setAnalyser] = React.useState(null);
  const [previewWaveform, setPreviewWaveform] = React.useState(null);
  
  // Track reference for detecting changes
  const prevTrackRef = React.useRef(null);
  
  // Node references to maintain internal EQ filters
  const nodesRef = React.useRef({});
  const [fxRack, setFxRack] = React.useState(null);
  

  // Setup audio nodes - recreate when track changes
  React.useEffect(() => {
    if (!audioContext || !audioRef.current) return;
    
    // Skip if track hasn't changed and nodes are already set up
    if (track === prevTrackRef.current && nodesRef.current.initialized) {
      return;
    }
    
    // Update track reference
    prevTrackRef.current = track;
    
    try {
      console.log(`Setting up ${name} audio node in deck.jsx`);
      
      // Clean up existing nodes if they exist - but don't try to disconnect source
      // as it's tied to the audio element and will cause issues on reconnection
      if (nodesRef.current.initialized) {
        console.log(`Cleaning up previous audio nodes for deck ${name}`);
        
        // Disconnect nodes in reverse order of connection
        if (nodesRef.current.gainNode && nodesRef.current.analyser) {
          nodesRef.current.analyser.disconnect();
        }
        
        if (nodesRef.current.trebleFilter) {
          nodesRef.current.trebleFilter.disconnect();
        }
        
        if (nodesRef.current.midFilter) {
          nodesRef.current.midFilter.disconnect();
        }
        
        if (nodesRef.current.bassFilter) {
          nodesRef.current.bassFilter.disconnect();
        }
      }
      
      // Either reuse existing source node or create a new one
      let source;
      if (nodesRef.current.source && nodesRef.current.audioElement === audioRef.current) {
        // Reuse existing source if it's already connected to this audio element
        console.log(`Reusing existing source node for deck ${name}`);
        source = nodesRef.current.source;
      } else {
        // Create a new source node
        console.log(`Creating new source node for deck ${name}`);
        source = audioContext.createMediaElementSource(audioRef.current);
      }
      
      // Use provided gain node or create a new one
      const gain = gainNode || audioContext.createGain();
      
      const analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 4096;
      analyserNode.smoothingTimeConstant = 0.7;
      
      // Create EQ filters
      const bassFilter = audioContext.createBiquadFilter();
      bassFilter.type = "lowshelf";
      bassFilter.frequency.value = 200;
      bassFilter.gain.value = 0;
      
      const midFilter = audioContext.createBiquadFilter();
      midFilter.type = "peaking";
      midFilter.frequency.value = 1000;
      midFilter.Q.value = 1;
      midFilter.gain.value = 0;
      
      const trebleFilter = audioContext.createBiquadFilter();
      trebleFilter.type = "highshelf";
      trebleFilter.frequency.value = 3000;
      trebleFilter.gain.value = 0;
      
      // Connect source -> filters -> analyser -> gain -> destination
      source.connect(bassFilter);
      bassFilter.connect(midFilter);
      midFilter.connect(trebleFilter);
      trebleFilter.connect(analyserNode);
      analyserNode.connect(gain);
      
      // Only connect to destination if not using external gain node
      // This is critical - if we're using an external gain node, we assume
      // it's already connected to the destination by the parent component
      if (!gainNode) {
        gain.connect(audioContext.destination);
      }
      
      setSourceNode(source);
      setAnalyser(analyserNode);
      if (setGainNode) {
        setGainNode(gain);
      }
      
      // Pass the analyzer node to parent component immediately
      if (typeof onAnalyserCreated === 'function') {
        console.log(`Exposing analyzer node for deck ${name}`);
        onAnalyserCreated(analyserNode);
      }
      
      // Store nodes for later reference
      nodesRef.current = {
        source,
        audioElement: audioRef.current,  // Track which audio element this source is connected to
        bassFilter,
        midFilter,
        trebleFilter,
        gainNode: gain,
        analyser: analyserNode,
        initialized: true
      };
      

      console.log(`${name} audio node setup complete in deck.jsx`);
    } catch (err) {
      console.error(`Error setting up ${name} audio node:`, err);
    }
  }, [audioContext, audioRef, name, setGainNode, onAnalyserCreated, gainNode, track]);

  // Native DSP is inserted without taking ownership of the analyser or mixer gain.
  React.useEffect(() => {
    const nodes = nodesRef.current;
    if (!audioContext || !analyser || nodes.analyser !== analyser || !nodes.trebleFilter) return undefined;
    let cancelled = false;
    let rack = null;
    const treble = nodes.trebleFilter;
    window.webDeckFxReady.then(module => module.createDeckFxRack(audioContext)).then(created => {
      if (cancelled || nodesRef.current.analyser !== analyser) {
        created.destroy();
        return;
      }
      try {
        treble.disconnect(analyser);
        treble.connect(created.input);
        created.output.connect(analyser);
      } catch (error) {
        try { treble.disconnect(created.input); } catch (disconnectError) { /* The rack was not inserted. */ }
        try { created.output.disconnect(analyser); } catch (disconnectError) { /* The rack was not inserted. */ }
        try { treble.connect(analyser); } catch (connectError) { /* The old graph was already replaced. */ }
        created.destroy();
        throw error;
      }
      rack = created;
      nodes.fxRack = rack;
      setFxRack(rack);
    }).catch(error => console.error(`Could not initialize Deck ${name} FX:`, error));
    return () => {
      cancelled = true;
      setFxRack(current => current === rack ? null : current);
      if (!rack) return;
      try { treble.disconnect(rack.input); } catch (error) { /* Already detached with the old deck graph. */ }
      try { rack.output.disconnect(analyser); } catch (error) { /* Already detached with the old deck graph. */ }
      if (nodesRef.current.analyser === analyser) {
        try { treble.connect(analyser); } catch (error) { /* The active graph was replaced. */ }
      }
      rack.destroy();
      if (nodes.fxRack === rack) nodes.fxRack = null;
    };
  }, [audioContext, analyser, name]);

  const beatResult = beatMap && beatMap.result;
  const beatAnchor = beatResult && beatResult.ticks && beatResult.ticks[beatMap.downbeatIndex];
  const playbackRate = audioRef.current && Number(audioRef.current.playbackRate);
  const beatAvailable = Boolean(fxRack && beatResult && Number.isFinite(beatResult.bpm) &&
    beatResult.bpm > 0 && Number.isFinite(beatAnchor) && playbackRate > 0);
  React.useEffect(() => {
    if (!fxRack) return;
    fxRack.setBeat(beatAvailable ? {
      bpm: beatResult.bpm * playbackRate,
      sourceBpm: beatResult.bpm,
      rate: playbackRate,
      anchor: beatAnchor,
      mediaTime: audioRef.current.currentTime
    } : null);
  }, [fxRack, beatAvailable, beatResult, beatAnchor, playbackRate, progress.currentTime, audioRef]);

  // BeatDetector owns both realtime canvases and their single gated animation loop.

  // Handle external gain node changes (for crossfader)
  React.useEffect(() => {
    if (gainNode && nodesRef.current.initialized) {
      // If we already have nodes set up and a new gain node is provided
      if (nodesRef.current.gainNode !== gainNode) {
        console.log(`Updating gain node for deck ${name}`);
        
        // Disconnect from old gain node and connect to new one
        if (nodesRef.current.analyser) {
          nodesRef.current.analyser.disconnect();
          nodesRef.current.analyser.connect(gainNode);
        }
        
        // Update our reference
        nodesRef.current.gainNode = gainNode;
      }
    }
  }, [gainNode, name]);

  const trackTitle = track?.file?.name.replace(/\.[^/.]+$/, "") || "";

  return (
    <div className="card bg-dark">
      <div className="card-header d-flex justify-content-between align-items-center">
        <h5 className="deck-title" title={trackTitle}>
          <span>Deck{name}{trackTitle ? ":" : ""}</span>
          {trackTitle && <span className="deck-track-title">{trackTitle}</span>}
        </h5>
      </div>
      <div className="card-body">

        {/* Beat Detector Component */}
        <BeatDetector
          previewWaveform={settings.detailedTimeline ? previewWaveform : null}
          waveformEnabled={settings.waveform}
          spectrumEnabled={settings.spectrum}
          automaticAnalysisEnabled={settings.automaticAnalysis}
          name={name}
          track={track}
          audioRef={audioRef}
          analyser={nodesRef.current?.analyser}
          isPlaying={isPlaying}
          pitch={pitch}
          onAnalysisChange={onAnalysisChange}
          onBeatMapChange={onBeatMapChange}
          renderDeckControls={(bpmControl, scrollPreview) => (
            <Fragment>
              {/* EQ and transport controls */}
              <EQ
                nodesRef={nodesRef}
                nodesVersion={analyser}
                bpmControl={bpmControl}
                scrollPreview={scrollPreview}
                audioContext={audioContext}
                name={name}
                audioRef={audioRef}
                pitch={pitch}
                onPitchChange={onPitchChange}
                volume={volume}
                onVolumeChange={onVolumeChange}
                midiEQRef={midiEQRef}
                fxRack={fxRack}
                beatAvailable={beatAvailable}
                syncControl={syncControl}
                timeline={(
                  <Track
                    onWaveformChange={setPreviewWaveform}
                    detailedTimeline={settings.detailedTimeline}
                    name={name}
                    track={track}
                    audioRef={audioRef}
                    progress={progress}
                    formatTime={formatTime}
                    isPlaying={isPlaying}
                  />
                )}

              />
            </Fragment>
          )}
        />
      </div>
    </div>
  );
};

export default Deck;
