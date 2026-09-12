console.log('audio.js');   

window.dj = window.dj || {}

/**
 * audio.js - Audio processing utilities for DJ application
 * Contains audio context handling, EQ, crossfader
*/

// AudioContext singleton to ensure we use a single context throughout the app
let _audioContext = null;

/**
 * Gets or creates the AudioContext singleton
 * @returns {AudioContext} The audio context instance
 */
const getAudioContext = () => {
  if (!_audioContext) {
    _audioContext = new (window.AudioContext || window.webkitAudioContext)();
    console.log("Created new AudioContext");
  }
  return _audioContext;
};

/**
 * Ensures AudioContext is resumed (handling autoplay restrictions)
 * @returns {Promise} Promise that resolves when the context is resumed
 */
const resumeAudioContext = () => {
  const ctx = getAudioContext();
  return ctx.state === "suspended" ? ctx.resume().then(() => console.log("AudioContext resumed successfully")).catch(err => console.error("Failed to resume AudioContext:", err)) : Promise.resolve();
};

/**
 * Creates and connects audio processing nodes for a deck
 * @param {HTMLAudioElement} audioElement - The audio element to connect
 * @param {Object} nodes - Object to store node references
 * @param {Function} setAnalyser - React state setter for the analyzer
 * @param {String} deck - Identifier for the deck ('left' or 'right')
 * @param {Object} eq - Current EQ settings {bass, mid, treble}
 */
const setupAudioNodes = (audioElement, nodes, setAnalyser, deck, eq) => {
  const audioContext = getAudioContext();
  if (!audioContext || !audioElement) return;
  resumeAudioContext();

  // Return if already connected
  if (nodes.audioElement === audioElement && nodes.source) {
    setAnalyser(nodes.analyser);
    return;
  }

  // Clean up previous nodes if they exist
  cleanupAudioNodes(nodes);
  nodes.audioElement = audioElement;
  const source = audioContext.createMediaElementSource(audioElement);

  // Create filter nodes for EQ with more dramatic ranges for better effect
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

  // Create gain node for crossfader
  const gainNode = audioContext.createGain();
  gainNode.gain.value = 1.0;

  // Create analyzer for visualizations with larger FFT size for better resolution
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024; // Increased from 256 for better resolution
  analyser.smoothingTimeConstant = 0.8;

  // Connect the nodes
  source.connect(bassFilter);
  bassFilter.connect(midFilter);
  midFilter.connect(trebleFilter);
  trebleFilter.connect(gainNode);
  gainNode.connect(analyser);
  gainNode.connect(window.dj.getOutputRouter().master);

  // Store nodes for later access
  nodes.source = source;
  nodes.bassFilter = bassFilter;
  nodes.midFilter = midFilter;
  nodes.trebleFilter = trebleFilter;
  nodes.gainNode = gainNode;
  nodes.analyser = analyser;
  setAnalyser(analyser);
  updateEQ(nodes, eq); 
  console.log(`Audio nodes setup complete for ${deck} deck`); 
};

/**
 * Cleans up and disconnects audio nodes
 * @param {Object} nodes - Object containing node references
 */
const cleanupAudioNodes = (nodes) => {
  if (!nodes) return;
  Object.values(nodes).forEach(node => { if (node && node.disconnect) { node.disconnect?.(); } });
  console.log("Audio nodes cleaned up");
};

/**
 * Updates EQ settings for a deck
 * @param {Object} nodes - Audio nodes for the deck
 * @param {Object} eq - EQ settings {bass, mid, treble}
 */
const updateEQ = (nodes, eq) => {
  if (!nodes || !nodes.bassFilter || !nodes.midFilter || !nodes.trebleFilter) {
    console.error("Missing audio nodes for EQ update:", { 
      nodes: !!nodes, 
      bassFilter: !!nodes?.bassFilter, 
      midFilter: !!nodes?.midFilter, 
      trebleFilter: !!nodes?.trebleFilter
    });
    return;
  } 
  if (!eq || typeof eq.bass !== 'number' || typeof eq.mid !== 'number' || typeof eq.treble !== 'number') { return; } 
  const audioContext = getAudioContext(); 
  const now = audioContext.currentTime;
  const transitionTime = 0.1; // 100ms transition for smoother EQ changes 
  nodes.bassFilter.gain.setTargetAtTime(eq.bass, now, transitionTime);
  nodes.midFilter.gain.setTargetAtTime(eq.mid, now, transitionTime);
  nodes.trebleFilter.gain.setTargetAtTime(eq.treble, now, transitionTime);
  console.log("EQ updated:", eq);
};

/**
 * Updates crossfader between two decks
 * @param {GainNode} leftGainNode - Left deck gain node
 * @param {GainNode} rightGainNode - Right deck gain node
 * @param {Number} crossfaderValue - Crossfader value (0-100, 0=full left, 100=full right)
 * @returns {Boolean} True if crossfader was applied successfully
 */
const updateCrossfader = (leftGainNode, rightGainNode, crossfaderValue, leftVolume = 100, rightVolume = 100) => {
    // Check if both gain nodes are available
    const hasLeftGain = leftGainNode && leftGainNode.gain;
    const hasRightGain = rightGainNode && rightGainNode.gain;
    
    if (!hasLeftGain && !hasRightGain) {
        console.log("Both gain nodes not available yet - crossfader not applied");
        return false;
    }
    
    // For left deck: Full volume (1) at position 0, decreases to 0 at position 100
    const normalizedValue = crossfaderValue / 100; 
    // One gain owner: independent channel volume times equal-power crossfade.
    const angle = normalizedValue * Math.PI / 2;
    const leftGain = Math.cos(angle) * leftVolume / 100;
    const rightGain = Math.sin(angle) * rightVolume / 100;
    
    const audioCtx = getAudioContext();
    const now = audioCtx.currentTime;
    const transitionTime = 0.02; // 20ms transition for smoother crossfading
    
    // Apply gain values if nodes are available
    if (hasLeftGain) {
        leftGainNode.gain.setTargetAtTime(leftGain, now, transitionTime);
        console.log(`Applied left gain: ${leftGain.toFixed(2)}`);
    } else {
        console.log("Left gain node not available for crossfader");
    }
    
    if (hasRightGain) {
        rightGainNode.gain.setTargetAtTime(rightGain, now, transitionTime);
        console.log(`Applied right gain: ${rightGain.toFixed(2)}`);
    } else {
        console.log("Right gain node not available for crossfader");
    }
    
    return hasLeftGain || hasRightGain; // Return true if at least one gain was applied
};

/**
 * Sets up playback rate for pitch bend
 * @param {HTMLAudioElement} audioElement - Audio element to adjust
 * @param {Number} pitchValue - Pitch adjustment percentage
 */
const applyPitchBend = (audioElement, pitchValue) => {
  if (!audioElement) return; 
  // Disable pitch preservation to ensure pitch changes with speed
  audioElement.preservesPitch = false;
  audioElement.mozPreservesPitch = false;
  audioElement.webkitPreservesPitch = false; 
  // Convert percentage to playback rate (0% = 1.0 speed)
  const rate = 1 + (pitchValue / 100);
  audioElement.playbackRate = rate;
  console.log(`Applied pitch bend: ${pitchValue}%, rate: ${rate}`);
};

/**
 * Creates an object URL for an audio file
 * @param {File} file - Audio file
 * @returns {String} Object URL
 */
const createAudioFileUrl = (file) => { return !file ? null : URL.createObjectURL(file) };

/**
 * Revokes an object URL to free up memory
 * @param {String} url - Object URL to revoke
 */
const revokeAudioFileUrl = (url) => { url && URL.revokeObjectURL(url);};
 
console.log('gottotheend')

window.dj.audio = { 
  getAudioContext,
  resumeAudioContext,
  setupAudioNodes,
  cleanupAudioNodes,
  updateEQ,
  updateCrossfader,
  applyPitchBend,
  createAudioFileUrl,
  revokeAudioFileUrl
}