console.log('visual.js');   

window.dj = window.dj || {}
/**
 * visualize.js - visual processing utilities for DJ application
 * Contains audio visualization functionality
*/


/**
 * Creates an analyzer node for visualization
 * @param {AudioNode} sourceNode - Source audio node
 * @returns {AnalyserNode} Analyser node
 */
const createAnalyserNode = (sourceNode) => {
  const context = window.dj.audio.getAudioContext();
  const analyserNode = context.createAnalyser();
  analyserNode.fftSize = 2048;
  sourceNode.connect(analyserNode);
  return analyserNode;
};

/**
 * Draws frequency visualization on canvas
 * @param {AnalyserNode} analyser - Audio analyser node
 * @param {HTMLCanvasElement} canvas - Canvas to draw on
 */
const drawVisualization = (analyser, canvas, transparent = false) => {
  if (!analyser || !canvas) {
    return; // Exit silently without logging to avoid console noise
  }

  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.error("Could not get canvas 2D context");
      return;
    }
    
    // Make sure canvas dimensions match its display size
    if (canvas.width !== canvas.offsetWidth || canvas.height !== canvas.offsetHeight) {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    // Layered main display must reveal the waveform and discard the previous frame.
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!transparent) {
      const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      bgGradient.addColorStop(0, "rgba(25, 25, 35, 0.9)");
      bgGradient.addColorStop(1, "rgba(10, 10, 20, 0.9)");
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Add grid lines for visual reference
    ctx.strokeStyle = "rgba(50, 50, 70, 0.3)";
    ctx.lineWidth = 0.5;
    
    // Draw some horizontal grid lines
    const gridLines = 4;
    for (let i = 1; i <= gridLines; i++) {
      const y = (canvas.height / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Draw frequency bars with better spacing and style
    const barWidth = Math.max(2, (canvas.width / (bufferLength / 2)) - 1);
    let x = 0;

    // Only use a subset of the frequency data for better visualization
    const usableFrequencies = Math.min(bufferLength / 2, canvas.width / 3);
    const step = Math.ceil(bufferLength / usableFrequencies);

    for (let i = 0; i < bufferLength; i += step) {
      // Apply a scaling factor to make the visualization more dramatic
      const barHeight = (dataArray[i] / 255) * canvas.height * 0.8;

      // Create a color gradient based on frequency and amplitude
      const hue = (i / bufferLength) * 180 + 180; // Blue to purple range
      const saturation = 70 + (dataArray[i] / 255) * 30; // More intense with higher amplitude
      const lightness = 40 + (dataArray[i] / 255) * 20; // Brighter with higher amplitude
      
      // Draw the bar with gradient
      const barGradient = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - barHeight);
      barGradient.addColorStop(0, `hsl(${hue}, ${saturation}%, ${lightness}%)`);
      barGradient.addColorStop(1, `hsl(${hue + 30}, ${saturation + 15}%, ${lightness + 20}%)`);
      
      ctx.fillStyle = barGradient;
      ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
      
      x += barWidth + 1;
      
      // Stop if we've filled the canvas width
      if (x >= canvas.width) break;
    }

    // Get energy and threshold histories from canvas data attributes
    let energyHistory = JSON.parse(canvas.getAttribute('data-energy-history') || '[]');
    let thresholdHistory = JSON.parse(canvas.getAttribute('data-threshold-history') || '[]');
    
    // Draw energy history line (purple)
    if (energyHistory && energyHistory.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = '#bb86fc';
      ctx.lineWidth = 2;
      
      const historyStep = canvas.width / (energyHistory.length - 1);
      const maxEnergy = 255; // Max possible energy value
      
      for (let i = 0; i < energyHistory.length; i++) {
        const x = i * historyStep;
        const y = canvas.height - (energyHistory[i] / maxEnergy * canvas.height * 0.8);
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      
      ctx.stroke();
    }
    
    // Draw threshold line (red)
    if (thresholdHistory && thresholdHistory.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = '#cf6679';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      
      const historyStep = canvas.width / (thresholdHistory.length - 1);
      const maxEnergy = 255; // Max possible energy value
      
      for (let i = 0; i < thresholdHistory.length; i++) {
        const x = i * historyStep;
        const y = canvas.height - (thresholdHistory[i] / maxEnergy * canvas.height * 0.8);
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      
      ctx.stroke();
      ctx.setLineDash([]);
    }
  } catch (error) {
    console.error("Error drawing visualization:", error);
  }
};

/**
 * Draws waveform visualization on canvas showing raw audio data
 * @param {AnalyserNode} analyser - Audio analyser node
 * @param {HTMLCanvasElement} canvas - Canvas to draw on
 */
const drawWaveformVisualization = (analyser, canvas, transparent = false) => {
  if (!analyser || !canvas) {
    return; // Exit silently without logging to avoid console noise
  }

  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.error("Could not get canvas 2D context");
      return;
    }
    
    // Make sure canvas dimensions match its display size
    if (canvas.width !== canvas.offsetWidth || canvas.height !== canvas.offsetHeight) {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }

    // Get time domain data
    const bufferLength = analyser.fftSize;
    const timeData = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(timeData);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!transparent) {
      const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      bgGradient.addColorStop(0, "rgba(30, 30, 40, 0.9)");
      bgGradient.addColorStop(1, "rgba(15, 15, 25, 0.9)");
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Add grid lines for visual reference
    ctx.strokeStyle = "rgba(50, 50, 70, 0.3)";
    ctx.lineWidth = 0.5;
    
    // Draw some horizontal grid lines
    const gridLines = 4;
    for (let i = 1; i <= gridLines; i++) {
      const y = (canvas.height / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Draw waveform
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#03dac6'; // Teal color 
    ctx.beginPath();

    const sliceWidth = canvas.width / timeData.length;
    let x = 0;

    for (let i = 0; i < timeData.length; i++) {
      const v = timeData[i] / 128.0;  // convert to range 0-2
      const y = v * canvas.height / 2;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

      x += sliceWidth;
      
      // For performance, don't draw every single point
      if (i > 0 && i % 2 === 0 && x >= canvas.width) break;
    }

    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
    
  } catch (error) {
    console.error("Error drawing waveform visualization:", error);
  }
};

/**
 * Initializes visualization canvases
 * @param {HTMLCanvasElement} leftCanvas - Left deck canvas
 * @param {HTMLCanvasElement} rightCanvas - Right deck canvas
 */
const initializeAudioVisuals = (leftCanvas, rightCanvas) => {
  const setupCanvas = (canvas) => {
    if (!canvas) return;
    
    // Set canvas dimensions to match display size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    
    // Clear the canvas with a gradient background
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "rgba(35, 35, 35, 1)");
    gradient.addColorStop(1, "rgba(20, 20, 20, 1)");
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw initial grid lines
    ctx.strokeStyle = "rgba(70, 70, 70, 0.5)";
    ctx.lineWidth = 0.5;
    
    // Horizontal grid lines
    const lineCount = 5;
    for (let i = 1; i < lineCount; i++) {
      const y = (canvas.height / lineCount) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    
    // Add a welcome message or instructions
    ctx.fillStyle = "rgba(120, 120, 120, 0.7)";
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Load a track and play to see audio visualization", canvas.width / 2, canvas.height / 2);
  };

  setupCanvas(leftCanvas);
  setupCanvas(rightCanvas);
  
  // Add window resize handler for responsive canvases
  const handleResize = () => {
    setupCanvas(leftCanvas);
    setupCanvas(rightCanvas);
  };
  
  window.addEventListener("resize", handleResize);
  
  // Return cleanup function to remove event listener
  return () => {
    window.removeEventListener("resize", handleResize);
  };
}; 




/**
 * Analyzes an entire audio file to generate waveform data for visualization
 * @param {File} audioFile - The audio file to analyze
 * @param {AbortSignal} signal - Optional cancellation for disabled/replaced timelines
 * @returns {Promise<{waveformData: number[], peaks: number[], duration: number, frequencyData: number[][]}>} Promise resolving to waveform data
 */
const analyzeAudioFile = (audioFile, signal) => {
  return new Promise((resolve, reject) => {
    if (!audioFile) {
      reject(new Error("No audio file provided"));
      return;
    }
    
    const audioContext = window.dj.audio.getAudioContext();
    const fileReader = new FileReader();
    const abortError = () => new DOMException('Timeline analysis cancelled', 'AbortError');
    const checkCancelled = () => {
      if (signal?.aborted) throw abortError();
    };
    const cleanup = () => signal?.removeEventListener('abort', handleAbort);
    const handleAbort = () => {
      if (fileReader.readyState === 1) fileReader.abort();
      cleanup();
      reject(abortError());
    };
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    signal?.addEventListener('abort', handleAbort, { once: true });
    
    fileReader.onload = async (event) => {
      try {
        checkCancelled();
        // Decode the audio data
        const arrayBuffer = event.target.result;
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        // Native decoding cannot be interrupted, but no preparation follows an abort.
        checkCancelled();
        
        // Get audio channel data - use first channel (left) for visualization
        const channelData = audioBuffer.getChannelData(0);
        const duration = audioBuffer.duration;
        
        // Generate a reduced resolution waveform (1200 samples is good for visualization)
        const sampleCount = 1200;
        const blockSize = Math.max(1, Math.floor(channelData.length / sampleCount));
        const waveformData = [];
        const peaks = []; // Store highest peaks to show hot spots
        const frequencyData = []; // Store approximate frequency data for each segment
        
        // Create offline audio context for analysis
        const offlineContext = new OfflineAudioContext(1, blockSize, audioContext.sampleRate);
        
        // Process the audio data in chunks
        for (let i = 0; i < sampleCount; i++) {
          // Yield so a settings change can cancel a long file between bounded batches.
          if (i % 24 === 0) {
            await new Promise((resume) => setTimeout(resume, 0));
            checkCancelled();
          }
          const start = Math.floor(i * channelData.length / sampleCount);
          const nextIndex = i + 1;
          const end = Math.floor(nextIndex * channelData.length / sampleCount);
          const segmentLength = end - start;
          let min = 0;
          let max = 0;
          let sum = 0;
          
          // Create buffer for this segment
          const segmentBuffer = offlineContext.createBuffer(1, Math.max(1, segmentLength), offlineContext.sampleRate);
          const segmentData = segmentBuffer.getChannelData(0);
          
          // Copy data for this segment
          for (let j = 0; j < segmentLength; j++) {
            const sample = channelData[start + j];
            segmentData[j] = sample;
            if (sample < min) min = sample;
            if (sample > max) max = sample;
            sum += sample * sample;
          }
          
          // Store peak-to-peak amplitude
          waveformData.push({min, max});
          
          // Store RMS energy for this segment
          const rms = Math.sqrt(sum / Math.max(1, segmentLength));
          peaks.push(rms);
          
          // Perform basic frequency analysis
          // We'll use a simplified approach to determine bass/mid/treble prominence
          const segmentFreqs = analyzeFrequencyBands(segmentData, offlineContext.sampleRate);
          frequencyData.push(segmentFreqs);
        }
        
        console.log(`Audio analysis complete - Duration: ${duration}s, Points: ${waveformData.length}`);
        cleanup();
        resolve({waveformData, peaks, duration, frequencyData});
      } catch (error) {
        cleanup();
        if (error.name !== 'AbortError') console.error("Error analyzing audio file:", error);
        reject(error);
      }
    };
    
    fileReader.onerror = (error) => {
      cleanup();
      console.error("FileReader error:", error);
      reject(error);
    };
    
    // Read the audio file as an array buffer
    fileReader.readAsArrayBuffer(audioFile);
  });
};

/**
 * Analyze frequency bands in audio segment
 * @param {Float32Array} sampleData - Audio data for segment
 * @param {Number} sampleRate - The sample rate
 * @returns {Array} Relative energy in [bass, lowMid, mid, highMid, treble]
 */
const analyzeFrequencyBands = (sampleData, sampleRate) => {
  // Define frequency bands
  // Bass: 20-250 Hz, LowMid: 250-500 Hz, Mid: 500-2000 Hz, HighMid: 2000-4000 Hz, Treble: 4000-20000 Hz
  const bandEnergies = [0, 0, 0, 0, 0]; // [bass, lowMid, mid, highMid, treble]
  
  // Simple approximation using different wavelengths
  const dataLength = sampleData.length;
  
  // Store how many samples we processed for each band for proper averaging
  const sampleCounts = [0, 0, 0, 0, 0];
  
  // Process all samples but weight them differently for each frequency band
  for (let i = 0; i < dataLength; i++) {
    const sample = Math.abs(sampleData[i]);
    
    // Weight samples differently for each band based on position in the buffer
    // Earlier samples (lower indices) have more influence on bass frequencies
    // Later samples (higher indices) have more influence on treble frequencies
    const position = i / dataLength;
    
    // Bass (emphasize the first 30% of samples)
    if (position < 0.3) {
      bandEnergies[0] += sample * (1.0 - position * 2); // Gradually decrease weight
      sampleCounts[0]++;
    }
    
    // Low-Mid (emphasize samples between 20-40%)
    if (position >= 0.2 && position < 0.4) {
      bandEnergies[1] += sample * (1.0 - Math.abs(position - 0.3) * 5); // Peak at 30%
      sampleCounts[1]++;
    }
    
    // Mid (emphasize samples between 30-60%)
    if (position >= 0.3 && position < 0.6) {
      bandEnergies[2] += sample * (1.0 - Math.abs(position - 0.45) * 3); // Peak at 45%
      sampleCounts[2]++;
    }
    
    // High-Mid (emphasize samples between 50-80%)
    if (position >= 0.5 && position < 0.8) {
      bandEnergies[3] += sample * (1.0 - Math.abs(position - 0.65) * 3); // Peak at 65%
      sampleCounts[3]++;
    }
    
    // Treble (emphasize the last 40% of samples)
    if (position >= 0.6) {
      bandEnergies[4] += sample * (position); // Gradually increase weight
      sampleCounts[4]++;
    }
  }
  
  // Normalize by number of samples in each band
  for (let i = 0; i < 5; i++) {
    if (sampleCounts[i] > 0) {
      bandEnergies[i] = bandEnergies[i] / sampleCounts[i];
    }
  }
  
  // Add minimum energy to each band to ensure some variation
  const minEnergy = 0.01;
  for (let i = 0; i < 5; i++) {
    bandEnergies[i] += minEnergy;
  }
  
  // Normalize the band energies so they sum to 1
  const totalEnergy = bandEnergies.reduce((a, b) => a + b, 0) || 1;
  return bandEnergies.map(energy => energy / totalEnergy);
};

/**
 * Draws the full track waveform visualization
 * @param {Array} waveformData - Array of min/max amplitude values
 * @param {Array} peaks - Array of peak values
 * @param {HTMLCanvasElement} canvas - Canvas to draw on
 * @param {Number} progress - Current playback position (0-1)
 * @param {Number} duration - Total track duration in seconds
 * @param {Array} frequencyData - Optional array of frequency band data
 */
const drawTrackWaveform = (waveformData, peaks, canvas, progress, duration, frequencyData) => {
  if (!canvas || !waveformData || !waveformData.length) return;
  
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    // Make sure canvas dimensions match its display size
    if (canvas.width !== canvas.offsetWidth || canvas.height !== canvas.offsetHeight) {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }
    
    // Clear the canvas
    const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGradient.addColorStop(0, "rgba(20, 20, 30, 0.9)");
    bgGradient.addColorStop(1, "rgba(10, 10, 15, 0.9)");
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw reference grid
    ctx.strokeStyle = "rgba(50, 50, 70, 0.3)";
    ctx.lineWidth = 0.5;
    
    // Full-song time runs left to right; amplitude uses the canvas height.
    if (duration > 0) {
      const labelCount = Math.max(1, Math.floor(canvas.width / 60));
      const interval = Math.max(30, Math.ceil(duration / labelCount / 30) * 30);
      for (let t = interval; t < duration; t += interval) {
        const x = t / duration * canvas.width;
        ctx.beginPath();
        ctx.moveTo(x, canvas.height - 6);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
        
        // Draw time label
        ctx.fillStyle = "rgba(150, 150, 170, 0.7)";
        ctx.font = "10px Arial";
        ctx.textAlign = "left";
        ctx.fillText(formatTime(t), x + 3, 10);
      }
    }
    
    // Bin real RMS energy into screen columns, never maxima of long audio blocks.
    // One track-wide scale retains silence and relative dynamics; no amplitude floor.
    const columns = Math.min(canvas.width, waveformData.length);
    const envelope = [];
    let maximum = 0;
    for (let column = 0; column < columns; column += 1) {
      const begin = Math.floor(column * waveformData.length / columns);
      const nextColumn = column + 1;
      const end = Math.floor(nextColumn * waveformData.length / columns);
      let energy = 0;
      for (let i = begin; i < end; i += 1) {
        const rms = peaks[i] || 0;
        energy += rms * rms;
      }
      const count = end - begin;
      const amplitude = Math.sqrt(energy / Math.max(1, count));
      envelope.push(amplitude);
      maximum = Math.max(maximum, amplitude);
    }
    const segmentWidth = canvas.width / columns;
    const halfHeight = canvas.height / 2;
    const amplitudeScale = canvas.height * 0.4;
    
    // Calculate the current playback position
    const playedSegments = Math.ceil(columns * progress);
    

    // Draw each waveform segment
    for (let i = 0; i < columns; i++) {
      const peak = maximum > 0 ? envelope[i] / maximum : 0;
      const x = i * segmentWidth;
      const scaledMax = peak * amplitudeScale;
      const scaledMin = -scaledMax;
      
      // Determine if this segment has been played
      const isPlayed = i <= playedSegments;
      
      // Tint the waveform itself, not a solid played-area overlay.
      const barColor = isPlayed ? '#03dac6' : '#58949e';
      ctx.globalAlpha = 1;
      
      // Draw the actual amplitude vertically at this left-to-right time position.
      ctx.beginPath();
      ctx.strokeStyle = barColor;
      ctx.lineWidth = segmentWidth > 1 ? segmentWidth - 0.3 : segmentWidth;
      ctx.moveTo(x, halfHeight + scaledMin);
      ctx.lineTo(x, halfHeight + scaledMax);
      ctx.stroke();
    }
    
    // Reset global alpha
    ctx.globalAlpha = 1.0;
    
    // Draw playhead line
    const playheadX = canvas.width * progress;
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 2;
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, canvas.height);
    ctx.stroke();
  } catch (error) {
    console.error("Error drawing track waveform:", error);
  }
};

/**
 * Format time in seconds to MM:SS format
 * @param {Number} seconds - Time in seconds
 * @returns {String} Formatted time string
 */
const formatTime = (seconds) => {
  if (!seconds || isNaN(seconds)) return "00:00";
  
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
};


 
// Cache track-wide energy once, shared by redraws and both preview zoom levels.
const previewEnvelopeCache = new WeakMap();
const getPreviewEnvelope = (waveform) => {
  if (!waveform || !waveform.peaks || !waveform.peaks.length) return null;
  const cached = previewEnvelopeCache.get(waveform);
  if (cached) return cached;
  const sums = [0];
  let maximum = 0;
  for (let i = 0; i < waveform.peaks.length; i += 1) {
    const rms = waveform.peaks[i] || 0;
    sums.push(sums[i] + rms * rms);
    maximum = Math.max(maximum, rms);
  }
  const envelope = { sums, maximum, count: waveform.peaks.length };
  previewEnvelopeCache.set(waveform, envelope);
  return envelope;
};

// Real full-file RMS window. All positions and measured beats use source seconds.
const drawScrollingTrack = (canvas, currentTime, duration, result, waveform = null, seconds = 35, deck = 'A') => {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const width = canvas.offsetWidth;
  const height = canvas.offsetHeight;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  ctx.clearRect(0, 0, width, height);
  if (!width || !height || !Number.isFinite(currentTime)) return;
  if (!Number.isFinite(duration) || duration <= 0) return;

  // Never clamp the window: outside-song space stays blank and the cursor stays fixed.
  const windowSeconds = seconds === 8 ? 8 : 35;
  const past = windowSeconds === 8 ? 2 : 5;
  const start = currentTime - past;
  const end = start + windowSeconds;
  const scale = height / windowSeconds;
  const leftTime = Math.max(0, start);
  const rightTime = Math.min(duration, end);
  const envelope = getPreviewEnvelope(waveform);
  if (envelope && waveform.duration > 0 && envelope.maximum > 0) {
    const pointsPerSecond = envelope.count / waveform.duration;
    // One horizontal amplitude bar per screen row, using cached mean-square energy.
    const halfWidth = Math.max(0, width / 2 - 12);
    for (let row = 0; row < height; row += 1) {
      const nextRow = row + 1;
      const from = Math.max(leftTime, start + row / scale);
      const to = Math.min(rightTime, waveform.duration, start + nextRow / scale);
      // Use a guarded block: the shipped emitter does not support continue.
      if (to > from) {
        const begin = Math.max(0, Math.floor(from * pointsPerSecond));
        const finish = Math.min(envelope.count, Math.max(begin + 1, Math.ceil(to * pointsPerSecond)));
        const energy = envelope.sums[finish] - envelope.sums[begin];
        const count = finish - begin;
        const amplitude = Math.sqrt(energy / count) / envelope.maximum;
        const extent = amplitude * halfWidth;
        const offset = from - start;
        const span = to - from;
        ctx.fillStyle = from < currentTime ? '#03dac6' : '#58949e';
        ctx.fillRect(width / 2 - extent, offset * scale, extent * 2, span * scale);
      }
    }
  }

  // Measured beats only; no guessed grid, downbeats, or fabricated amplitude.
  const ticks = result && Array.isArray(result.ticks) ? result.ticks : [];
  let low = 0;
  let high = ticks.length;
  // This shipped compiler omits while statements; use its supported for-loop form.
  for (let search = 0; low < high; search += 1) {
    const sum = low + high;
    const middle = Math.floor(sum / 2);
    if (ticks[middle] < leftTime) low = middle + 1;
    else high = middle;
  }
  ctx.strokeStyle = '#03dac6';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = low; i < ticks.length; i += 1) {
    const time = ticks[i];
    if (time > rightTime) break;
    const offset = time - start;
    const y = offset * scale;
    // Both decks face the shared center seam.
    ctx.moveTo(deck === 'B' ? 1 : Math.max(0, width - 10), y);
    ctx.lineTo(deck === 'B' ? Math.min(10, width - 1) : width - 1, y);
  }
  ctx.stroke();
  const cursor = past * scale;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, cursor);
  ctx.lineTo(width, cursor);
  ctx.stroke();
};

window.dj.visual = {
  createAnalyserNode,
  drawVisualization,
  drawWaveformVisualization,
  initializeAudioVisuals,
  analyzeAudioFile,
  analyzeFrequencyBands,
  drawTrackWaveform,
  drawScrollingTrack,
  formatTime
}