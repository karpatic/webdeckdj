import React from "react"; 
import RotaryControl from "./rotary.jsx";

const BeatDetector = ({ 
  waveformEnabled = true,
  spectrumEnabled = true,
  automaticAnalysisEnabled = true,
  name,
  analyser, 
  audioContext, 
  isPlaying,
  onBeatDetected,
  onResetRef,
  renderDeckControls
}) => {
  // Beat detection state
  const [beatCount, setBeatCount] = React.useState(0);
  const [bpm, setBpm] = React.useState(0);
  const [currentEnergy, setCurrentEnergy] = React.useState(0);
  const [isBeat, setIsBeat] = React.useState(false);
  
  // Beat detection refs (to avoid re-renders)
  const beatRef = React.useRef({
    lastBeatTime: 0,
    beatTimes: [],
    energyHistory: Array(60).fill(0),
    energyThresholdHistory: Array(60).fill(0),
    thresholdMultiplier: 1.1,
    minInterval: 0.25, // 250ms default
    frequencyRange: 0.3 // 30% default
  });

  // Manual beat detection state
  const [manualBeatTimes, setManualBeatTimes] = React.useState([]);
  const [manualBpm, setManualBpm] = React.useState(0);
  const [thresholdMultiplier, setThresholdMultiplier] = React.useState(beatRef.current.thresholdMultiplier);
  const [manualTapResetVersion, setManualTapResetVersion] = React.useState(0);
  const manualBeatTimesRef = React.useRef([]);
  const manualBeatRef = React.useRef({
    lastTapTime: 0,
  });
  
  // Beat energy visualization canvases
  const beatVisualizerCanvasRef = React.useRef(null);
  const waveformCanvasRef = React.useRef(null); // New waveform visualization
  const spectrumCanvasRef = React.useRef(null); // New frequency spectrum visualization
  
  // Animation frame ID for beat detection
  const requestRef = React.useRef();
  
  // Reset manual beat detection
  const resetManualBeat = React.useCallback(() => {
    manualBeatTimesRef.current = [];
    setManualBeatTimes([]);
    setManualBpm(0);
    setManualTapResetVersion((version) => version + 1);
    manualBeatRef.current.lastTapTime = 0;
  }, []);

  const handleSensitivityChange = React.useCallback((value) => {
    beatRef.current.thresholdMultiplier = value;
    setThresholdMultiplier(value);
  }, []);

  // Clear media-position-dependent history after a seek without changing detector settings.
  const resetSeekHistory = React.useCallback(() => {
    setBeatCount(0);
    setBpm(0);
    setCurrentEnergy(0);
    setIsBeat(false);
    beatRef.current.lastBeatTime = 0;
    beatRef.current.beatTimes = [];
    beatRef.current.energyHistory = Array(60).fill(0);
    beatRef.current.energyThresholdHistory = Array(60).fill(0);

    [beatVisualizerCanvasRef.current, spectrumCanvasRef.current, waveformCanvasRef.current].forEach((canvas) => {
      if (!canvas) return;
      const context = canvas.getContext('2d');
      if (context) context.clearRect(0, 0, canvas.width, canvas.height);
    });
  }, []);

  // Reset all beat detection state when playback stops.
  const resetBeatDetection = React.useCallback(() => {
    resetSeekHistory();
    resetManualBeat();
  }, [resetManualBeat, resetSeekHistory]);
  
  // Expose the seek-specific reset to the deck.
  React.useEffect(() => {
    if (onResetRef) {
      onResetRef(resetSeekHistory);
    }
  }, [onResetRef, resetSeekHistory]);

  // Calculate energy from frequency data
  const calculateEnergy = React.useCallback(() => {
    if (!analyser) return 0;
    
    const frequencyData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(frequencyData);
    
    // Use only the lower frequency range based on setting
    const frequencyRange = beatRef.current.frequencyRange;
    const range = Math.floor(frequencyData.length * frequencyRange);
    
    // Focus more on bass & mid frequencies (where beats usually live)
    let energy = 0;
    let count = 0;
    
    // Weight the lower frequencies more
    for (let i = 0; i < range; i++) {
      // Apply weighting to emphasize certain frequency ranges
      // Bass range (20Hz-250Hz) gets highest weight
      const weight = i < range * 0.2 ? 1.8 : 1.0;
      energy += frequencyData[i] * weight;
      count += weight;
    }
    
    return count > 0 ? energy / count : 0;
  }, [analyser]);
  
  // Calculate BPM from beat times
  const calculateBPM = React.useCallback(() => {
    const { beatTimes } = beatRef.current;
    
    if (beatTimes.length < 4) return;
    
    // Calculate intervals between beats
    const intervals = [];
    for (let i = 1; i < beatTimes.length; i++) {
      intervals.push(beatTimes[i] - beatTimes[i - 1]);
    }
    
    // Filter out outliers (too short or too long intervals)
    const validIntervals = intervals.filter(interval => 
      interval >= 0.2 && interval <= 2.0
    );
    
    if (validIntervals.length === 0) return;
    
    // Calculate average interval
    const avgInterval = validIntervals.reduce((sum, val) => sum + val, 0) / validIntervals.length;
    
    // Convert to BPM (beats per minute)
    const calculatedBpm = Math.round(60 / avgInterval);
    
    // Update UI if the BPM is within a reasonable range
    if (calculatedBpm >= 60 && calculatedBpm <= 200) {
      setBpm(calculatedBpm);
    }
  }, []);
  
  // Handle manual beat tap
  const handleManualBeatTap = React.useCallback((tapTimestamps) => {
    const incomingTimestamps = (Array.isArray(tapTimestamps) ? tapTimestamps : [tapTimestamps ?? Date.now()])
      .filter((timestamp) => Number.isFinite(timestamp));
    if (incomingTimestamps.length === 0) return;

    // A pair starts a fresh gesture sequence; later single timestamps extend it.
    const existingBeatTimes = incomingTimestamps.length > 1 ? [] : manualBeatTimesRef.current;
    const newBeatTimes = [...existingBeatTimes, ...incomingTimestamps];
    
    // Keep only the last 8 taps
    const recentBeatTimes = newBeatTimes.slice(-8);
    
    // Calculate BPM if we have enough taps
    if (recentBeatTimes.length >= 2) {
      // Calculate intervals between taps
      const intervals = [];
      for (let i = 1; i < recentBeatTimes.length; i++) {
        intervals.push((recentBeatTimes[i] - recentBeatTimes[i - 1]));
      }
      
      // Calculate average interval
      const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;

      const avgIntervalInSeconds = avgInterval / 1000;
      
      // Convert to BPM
      const calculatedBpm = Math.round(60 / avgIntervalInSeconds);
      console.log(`BPM: ${calculatedBpm}`);
      
      setManualBpm(calculatedBpm);
    } 
    manualBeatTimesRef.current = recentBeatTimes;
    setManualBeatTimes(recentBeatTimes); 
    setIsBeat(true);
    setTimeout(() => setIsBeat(false), 80);
    manualBeatRef.current.lastTapTime = incomingTimestamps[incomingTimestamps.length - 1];
    
    // Notify parent component
    if (onBeatDetected) {
      onBeatDetected(true);
    }
  }, [onBeatDetected]);
  
  // Detect beat using energy-based algorithm with dynamic threshold
  const detectBeat = React.useCallback((currentEnergy) => {
    if (!audioContext) return false;
    
    // Get references to history and settings
    const { energyHistory, energyThresholdHistory, thresholdMultiplier, minInterval, lastBeatTime, beatTimes } = beatRef.current;
    
    // Calculate average energy
    const avgEnergy = energyHistory.reduce((sum, val) => sum + val, 0) / energyHistory.length;
    
    // Calculate threshold based on sensitivity setting
    const threshold = avgEnergy * thresholdMultiplier;
    
    // Store threshold for visualization (if needed)
    energyThresholdHistory.push(threshold);
    if (energyThresholdHistory.length > 60) {
      energyThresholdHistory.shift();
    }
    
    // Get current time
    const currentTime = audioContext.currentTime;
    
    // Detect beat when energy exceeds threshold and enough time has passed
    if (currentEnergy > threshold && currentTime - lastBeatTime > minInterval) {
      // Record beat
      setBeatCount(prevCount => prevCount + 1);
      
      // Store beat time
      beatTimes.push(currentTime);
      if (beatTimes.length > 20) {
        beatTimes.shift();
      }
      
      // Update last beat time
      beatRef.current.lastBeatTime = currentTime;
      
      // Visual feedback
      setIsBeat(true);
      setTimeout(() => setIsBeat(false), 80);
      
      // Calculate BPM
      if (beatTimes.length >= 4) {
        calculateBPM();
      }
      
      // Notify parent component
      if (onBeatDetected) {
        onBeatDetected(true);
      }
      
      return true;
    }
    
    return false;
  }, [audioContext, calculateBPM, onBeatDetected]);
  
  // Draw beat energy visualization
  const drawBeatVisualization = React.useCallback(() => {
    if (!beatVisualizerCanvasRef.current) return;
    
    const canvas = beatVisualizerCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Draw background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, width, height);
  }, []);

  // Animation function for beat detection
  const animate = React.useCallback(() => {
    if (!analyser) return;
    
    let energy = 0;
    if (automaticAnalysisEnabled) {
      energy = calculateEnergy();
      setCurrentEnergy(Math.round(energy));
      beatRef.current.energyHistory.push(energy);
      if (beatRef.current.energyHistory.length > 60) {
        beatRef.current.energyHistory.shift();
      }
      const avgEnergy = beatRef.current.energyHistory.reduce((sum, val) => sum + val, 0) /
                        beatRef.current.energyHistory.length;
      const threshold = avgEnergy * beatRef.current.thresholdMultiplier;
      beatRef.current.energyThresholdHistory.push(threshold);
      if (beatRef.current.energyThresholdHistory.length > 60) {
        beatRef.current.energyThresholdHistory.shift();
      }
      drawBeatVisualization();
    }
    
    // Draw frequency spectrum visualization with energy history and threshold lines
    if (spectrumEnabled && spectrumCanvasRef.current && window.dj && window.dj.visual) {
      const ctx = spectrumCanvasRef.current.getContext('2d');
      const width = spectrumCanvasRef.current.width;
      const height = spectrumCanvasRef.current.height;
      
      // First draw the basic visualization
      window.dj.visual.drawVisualization(
        analyser, 
        spectrumCanvasRef.current
      );
      
      // Then overlay the energy history and threshold lines
      if (automaticAnalysisEnabled && beatRef.current.energyHistory.length > 0) {
        // Draw energy history line
        ctx.beginPath();
        ctx.strokeStyle = '#bb86fc'; // Purple color like in beat.html
        ctx.lineWidth = 2;
        
        const historyStep = width / (beatRef.current.energyHistory.length - 1);
        const maxEnergy = 255; // Max possible energy value
        
        for (let i = 0; i < beatRef.current.energyHistory.length; i++) {
          const x = i * historyStep;
          const y = height - (beatRef.current.energyHistory[i] / maxEnergy * height * 0.8);
          
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        
        ctx.stroke();
        
        // Draw threshold line
        ctx.beginPath();
        ctx.strokeStyle = '#cf6679'; // Pink color like in beat.html
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]); // Dashed line
        
        for (let i = 0; i < beatRef.current.energyThresholdHistory.length; i++) {
          const x = i * historyStep;
          const y = height - (beatRef.current.energyThresholdHistory[i] / maxEnergy * height * 0.8);
          
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        
        ctx.stroke();
        ctx.setLineDash([]); // Reset line dash
      }
    }
    
    // Draw waveform visualization
    if (waveformEnabled && waveformCanvasRef.current && window.dj && window.dj.visual) {
      window.dj.visual.drawWaveformVisualization(analyser, waveformCanvasRef.current);
    }
    
    // Detect beat
    if (automaticAnalysisEnabled) detectBeat(energy);
    
    // Continue animation loop
    requestRef.current = requestAnimationFrame(animate);
  }, [analyser, calculateEnergy, detectBeat, drawBeatVisualization, waveformEnabled, spectrumEnabled, automaticAnalysisEnabled]);

  const needsAnimation = waveformEnabled || spectrumEnabled || automaticAnalysisEnabled;
  
  // Start/stop beat detection based on playback state
  React.useEffect(() => {
    // Clear any existing animation frame first
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
      requestRef.current = undefined;
    }
    
    // Only start beat detection if playing and analyser is available
    if (isPlaying && analyser && needsAnimation) {
      // Initialize canvases if available
      const canvases = [
        beatVisualizerCanvasRef.current,
        spectrumCanvasRef.current,
        waveformCanvasRef.current
      ];
      
      canvases.forEach(canvas => {
        if (canvas) {
          canvas.width = canvas.offsetWidth;
          canvas.height = canvas.offsetHeight;
        }
      });
      
      requestRef.current = requestAnimationFrame(animate);
    }
    
    // Cleanup function
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = undefined;
      }
    };
  }, [isPlaying, animate, analyser, needsAnimation]);

  // Switching automatic analysis must not reset manual BPM or its tap gesture.
  React.useEffect(() => {
    resetSeekHistory();
  }, [automaticAnalysisEnabled, resetSeekHistory]);
  
  // Reset detection when playback stops
  React.useEffect(() => {
    if (!isPlaying) {
      resetBeatDetection();
    }
  }, [isPlaying, resetBeatDetection]);
  
  // Handle window resize
  React.useEffect(() => {
    if (!waveformEnabled && !spectrumEnabled) return;
    const handleResize = () => {
      const canvases = [
        beatVisualizerCanvasRef.current,
        spectrumCanvasRef.current, 
        waveformCanvasRef.current
      ];
      
      canvases.forEach(canvas => {
        if (canvas) {
          canvas.width = canvas.offsetWidth;
          canvas.height = canvas.offsetHeight;
        }
      });
      
      // Redraw after resize if we have data
      if (automaticAnalysisEnabled) drawBeatVisualization();
      
      // Redraw other visualizations if playing
      if (isPlaying && analyser) {
        if (spectrumEnabled && spectrumCanvasRef.current && window.dj && window.dj.visual) {
          window.dj.visual.drawVisualization(analyser, spectrumCanvasRef.current);
        }
        
        if (waveformEnabled && waveformCanvasRef.current && window.dj && window.dj.visual) {
          window.dj.visual.drawWaveformVisualization(analyser, waveformCanvasRef.current);
        }
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isPlaying, analyser, drawBeatVisualization, waveformEnabled, spectrumEnabled, automaticAnalysisEnabled]);

  const hasDetectedBpm = automaticAnalysisEnabled && bpm > 0;
  const hasBeatStatus = hasDetectedBpm || manualBpm > 0;

  return (
    <div className="mb-3">
      
      {/* Waveform Visualization */}
      {waveformEnabled && <div className="mb-3">
        <canvas 
          ref={waveformCanvasRef} 
          className="w-100 realtime-waveform"
          aria-label={`Deck ${name} realtime waveform`}
          height="80"
          style={{ borderRadius: '4px', background: '#111', height: '80px' }}
        ></canvas>
      </div>}

      {/* Spectrum Visualization - now includes energy history */}
      {spectrumEnabled && <div className="mb-3">
        <canvas 
          ref={spectrumCanvasRef} 
          className="w-100 transformed-visualization"
          aria-label={`Deck ${name} transformed frequency visualization`}
          height="80"
          style={{ borderRadius: '4px', background: '#111', height: '80px' }}
        ></canvas>
      </div>}

      {typeof renderDeckControls === 'function' && renderDeckControls(
        <div className={isBeat ? 'beat-sensitivity is-beat' : 'beat-sensitivity'}>
          <RotaryControl
            id={`deck-${name}-sensitivity`}
            label="BPM"
            min={0.1}
            max={1.5}
            step={0.1}
            value={thresholdMultiplier}
            onChange={handleSensitivityChange}
            onTap={handleManualBeatTap}
            tapResetVersion={manualTapResetVersion}
            formatValue={(value) => value.toFixed(1)}
          />
        </div>,
        hasBeatStatus && (
          <div className="deck-beat-status">
            {hasDetectedBpm && <div className="badge bg-info" title="Detected tempo">{bpm} BPM</div>}
            {manualBpm > 0 && <div className="badge bg-success" title="Manual tempo">{manualBpm} BPM</div>}
          </div>
        )
      )}
    </div>
  );
};

export default BeatDetector;
