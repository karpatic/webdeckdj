import React from "react";

const DEFAULT_PRESET_NAME = 'Cope - The Neverending Explosion of Red Liquid Fire';
const PERFORMANCE_OPTIONS = [
  ['background', 'Background visualizer'],
  ['waveform', 'Realtime waveform'],
  ['spectrum', 'Transformed visualization'],
  ['automaticAnalysis', 'Automatic beat analysis / sensitivity'],
  ['detailedTimeline', 'Detailed track timeline']
];

const ButterVisualizer = ({ leftAudioNode, rightAudioNode, settings, onSettingChange }) => {
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [currentPresetName, setCurrentPresetName] = React.useState('');
  const [visualizerError, setVisualizerError] = React.useState('');
  const controlsRef = React.useRef(null);
  const settingsButtonRef = React.useRef(null);
  const visualizerRef = React.useRef(null);
  const visualizerCanvasRef = React.useRef(null);
  const presetIndexRef = React.useRef(0);
  const presetNamesRef = React.useRef([]);
  const presetsRef = React.useRef(null);
  const backgroundEnabled = settings.background;

  // Prepare the renderer and presets only when enabled. Reuse one renderer across
  // toggles: recreating WebGL contexts would accumulate GPU resources.
  React.useEffect(() => {
    if (!backgroundEnabled) return;
    const canvas = visualizerCanvasRef.current;
    const audioContext = window.dj.audio.getAudioContext();
    const butterchurn = window.butterchurn?.default || window.butterchurn;
    if (!canvas || !audioContext || !butterchurn) {
      setVisualizerError('Background visualizer is unavailable. Deck controls still work.');
      return;
    }

    try {
      if (!visualizerRef.current) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        visualizerRef.current = butterchurn.createVisualizer(audioContext, canvas, {
          width: window.innerWidth,
          height: window.innerHeight,
          pixelRatio: window.devicePixelRatio,
          textureRatio: 1
        });
      }
      const visualizer = visualizerRef.current;
      if (!presetsRef.current) {
        const standard = window.butterchurnPresets?.default || window.butterchurnPresets;
        const extra = window.butterchurnPresetsExtra?.default || window.butterchurnPresetsExtra;
        const presets = {
          ...standard.getPresets(),
          ...(extra?.getPresets ? extra.getPresets() : {})
        };
        const presetNames = Object.keys(presets);
        presetsRef.current = presets;
        presetNamesRef.current = presetNames;
        if (presetNames.length > 0) {
          const requestedIndex = presetNames.indexOf(DEFAULT_PRESET_NAME);
          const initialIndex = requestedIndex >= 0 ? requestedIndex : 0;
          presetIndexRef.current = initialIndex;
          visualizer.loadPreset(presets[presetNames[initialIndex]], 0.0);
          setCurrentPresetName(presetNames[initialIndex]);
        }
      }
      setVisualizerError('');
      let frameId;
      let stopped = false;
      const renderFrame = () => {
        if (stopped) return;
        visualizer.render();
        frameId = requestAnimationFrame(renderFrame);
      };
      const handleResize = () => {
        visualizer.setRendererSize(window.innerWidth, window.innerHeight);
      };
      handleResize();
      frameId = requestAnimationFrame(renderFrame);
      window.addEventListener('resize', handleResize);
      return () => {
        stopped = true;
        cancelAnimationFrame(frameId);
        window.removeEventListener('resize', handleResize);
      };
    } catch (error) {
      console.error('Background visualizer setup failed:', error);
      setVisualizerError('Background visualizer is unavailable. Deck controls still work.');
    }
  }, [backgroundEnabled]);

  // This is an analysis-only branch. Disconnect only the exact merger destination,
  // NEVER all outputs of a deck analyser (its other output supplies audible gain/EQ).
  React.useEffect(() => {
    if (!backgroundEnabled || !visualizerRef.current) return;
    const audioContext = window.dj.audio.getAudioContext();
    const visualizer = visualizerRef.current;
    const merger = audioContext.createChannelMerger(2);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    const oscillator = audioContext.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = 440;
    const gain = audioContext.createGain();
    const hasRealAudio = leftAudioNode || rightAudioNode;
    gain.gain.value = hasRealAudio ? 0.0001 : 0.001;
    oscillator.connect(gain);
    gain.connect(merger, 0, 0);
    gain.connect(merger, 0, 1);
    if (leftAudioNode) leftAudioNode.connect(merger, 0, 0);
    if (rightAudioNode) rightAudioNode.connect(merger, 0, 1);
    merger.connect(analyser);
    visualizer.connectAudio(analyser);
    oscillator.start();

    return () => {
      if (leftAudioNode) {
        try { leftAudioNode.disconnect(merger); } catch (error) { /* Track already replaced. */ }
      }
      if (rightAudioNode) {
        try { rightAudioNode.disconnect(merger); } catch (error) { /* Track already replaced. */ }
      }
      visualizer.disconnectAudio(analyser);
      merger.disconnect();
      analyser.disconnect();
      oscillator.stop();
      oscillator.disconnect();
      gain.disconnect();
    };
  }, [backgroundEnabled, leftAudioNode, rightAudioNode]);

  React.useEffect(() => {
    if (!settingsOpen) return;
    const closeOutside = (event) => {
      if (!controlsRef.current?.contains(event.target)) setSettingsOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [settingsOpen]);

  const handleSettingsKeyDown = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    setSettingsOpen(false);
    settingsButtonRef.current?.focus();
  };

  const changePreset = (direction) => {
    if (!backgroundEnabled || !visualizerRef.current || !presetsRef.current) return;
    const names = presetNamesRef.current;
    if (names.length === 0) return;
    let index = presetIndexRef.current + direction;
    if (index >= names.length) index = 0;
    if (index < 0) index = names.length - 1;
    presetIndexRef.current = index;
    visualizerRef.current.loadPreset(presetsRef.current[names[index]], 1.0);
    setCurrentPresetName(names[index]);
  };
  const presetControlsDisabled = !backgroundEnabled || !currentPresetName;

  return (
    <div>
      <canvas
        ref={visualizerCanvasRef}
        className="visualizer-backdrop"
        aria-hidden="true"
        style={{
          display: backgroundEnabled ? "block" : "none",
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          zIndex: -1,
          opacity: 0.8,
          pointerEvents: "none"
        }}
      ></canvas>
      <div
        ref={controlsRef}
        className="visualizer-controls position-fixed"
        style={{ top: '10px', right: '10px', zIndex: 100 }}
        onKeyDown={handleSettingsKeyDown}
        onBlur={(event) => {
          const nextFocus = event.relatedTarget;
          if (nextFocus && !event.currentTarget.contains(nextFocus)) setSettingsOpen(false);
        }}
      >
        <button
          ref={settingsButtonRef}
          id="dj-settings-button"
          type="button"
          className="btn btn-sm btn-outline-light dj-settings-button"
          aria-label="DJ performance settings"
          aria-expanded={settingsOpen}
          aria-controls="dj-settings-panel"
          title="Performance settings"
          onClick={() => setSettingsOpen((open) => !open)}
        >
          <span aria-hidden="true">⚙</span>
        </button>
        <div
          id="dj-settings-panel"
          className="dj-settings-panel"
          role="region"
          aria-labelledby="dj-settings-button"
          hidden={!settingsOpen}
        >
          <strong>Performance settings</strong>
          <p className="small mb-2">Applies to both decks. Turn off visuals to reduce load.</p>
          {PERFORMANCE_OPTIONS.map(option => <label className="dj-setting" key={option[0]}>
            <input
              id={`dj-setting-${option[0]}`}
              type="checkbox"
              checked={settings[option[0]]}
              onChange={(event) => onSettingChange(option[0], event.target.checked)}
            />
            <span>{option[1]}</span>
          </label>)}
          <p className="small mt-2 mb-2">Manual BPM taps and seeking stay available.</p>
          <div className="d-flex gap-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-light flex-grow-1"
              disabled={presetControlsDisabled}
              onClick={() => changePreset(-1)}
              title="Previous Visualization Preset"
            >Prev preset</button>
            <button
              type="button"
              className="btn btn-sm btn-outline-light flex-grow-1"
              disabled={presetControlsDisabled}
              onClick={() => changePreset(1)}
              title="Next Visualization Preset"
            >Next preset</button>
          </div>
          {currentPresetName && <small className="d-block mt-2">{currentPresetName}</small>}
          {visualizerError && <p className="small mt-2 mb-0" role="status">{visualizerError}</p>}
        </div>
      </div>
    </div>
  );
};

export default ButterVisualizer;
