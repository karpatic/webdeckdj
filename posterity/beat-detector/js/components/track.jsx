import React from "react";
import "../utils/visual.js";

const getNormalizedProgress = ({ currentTime, duration }) => {
  if (!Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(1, Math.max(0, currentTime / duration));
};

const Track = ({ 
  detailedTimeline = true,
  name,
  track, 
  audioRef, 
  progress, 
  formatTime,
  isPlaying
}) => {  
  // Track waveform canvas reference
  const trackWaveformCanvasRef = React.useRef(null);
  
  // Track waveform data
  const [trackWaveform, setTrackWaveform] = React.useState({
    waveformData: null,
    peaks: null,
    frequencyData: null,
    duration: 0,
    analyzed: false,
    analyzing: false,
    currentTrackId: null
  });

  // Keep track URL in a ref to properly detect changes
  const trackUrlRef = React.useRef(null);

  // Disabled timelines never start decoding/preparation. Abort old work on toggles,
  // replacement, and unmount; reuse completed data for this track when re-enabled.
  React.useEffect(() => {
    if (track?.url !== trackUrlRef.current) {
      trackUrlRef.current = track?.url;
      setTrackWaveform({
        waveformData: null,
        peaks: null,
        frequencyData: null,
        duration: 0,
        analyzed: false,
        analyzing: false,
        currentTrackId: track?.url
      });
    }
    if (!detailedTimeline || !track?.file) {
      setTrackWaveform((current) => current.analyzing ? { ...current, analyzing: false } : current);
      return;
    }
    if (trackWaveform.analyzed && trackWaveform.currentTrackId === track.url) return;

    const controller = new AbortController();
    setTrackWaveform((current) => ({ ...current, analyzing: true, currentTrackId: track.url }));
    window.dj.visual.analyzeAudioFile(track.file, controller.signal)
      .then((data) => {
        if (controller.signal.aborted || trackUrlRef.current !== track.url) return;
        setTrackWaveform({ ...data, analyzed: true, analyzing: false, currentTrackId: track.url });
      })
      .catch((error) => {
        if (controller.signal.aborted || trackUrlRef.current !== track.url) return;
        console.error(`Error analyzing track waveform: ${error.message}`);
        setTrackWaveform((current) => ({ ...current, analyzing: false }));
      });
    return () => controller.abort();
  }, [track, detailedTimeline]);

  // Update track waveform visualization when progress changes
  React.useEffect(() => {
    if (!detailedTimeline || trackWaveform.currentTrackId !== track?.url) return;
    if (!trackWaveform.waveformData || !trackWaveformCanvasRef.current || !track) return;
    
    const normalizedProgress = getNormalizedProgress(progress);
    
    // Draw track waveform with updated progress
    window.dj.visual.drawTrackWaveform(
      trackWaveform.waveformData, 
      trackWaveform.peaks, 
      trackWaveformCanvasRef.current, 
      normalizedProgress,
      trackWaveform.duration,
      trackWaveform.frequencyData
    );
  }, [
    detailedTimeline,
    progress.currentTime,
    progress.duration,
    trackWaveform.waveformData,
    trackWaveform.peaks,
    trackWaveform.duration,
    trackWaveform.frequencyData,
    track
  ]);

  // Rendered Y coordinates: the bottom is the start, the top is the end.
  const handleWaveformClick = (e) => {
    if (!trackWaveformCanvasRef.current || !audioRef.current) return;
    
    const canvas = trackWaveformCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const duration = audioRef.current.duration;
    if (!rect.height || !Number.isFinite(duration) || duration <= 0) return;

    const distanceFromBottom = rect.bottom - e.clientY;
    const normalizedPosition = Math.min(1, Math.max(0, distanceFromBottom / rect.height));
    audioRef.current.currentTime = Math.min(duration, Math.max(0, normalizedPosition * duration));
  };

  const handleWaveformKeyDown = (e) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    let time = audio.currentTime;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') time += 5;
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') time -= 5;
    else if (e.key === 'Home') time = 0;
    else if (e.key === 'End') time = audio.duration;
    else return;
    e.preventDefault();
    audio.currentTime = Math.min(audio.duration, Math.max(0, time));
  };

  // Handle window resize events for the track waveform canvas
  React.useEffect(() => {
    if (!detailedTimeline || trackWaveform.currentTrackId !== track?.url) return;
    const handleResize = () => {
      if (trackWaveformCanvasRef.current) {
        trackWaveformCanvasRef.current.width = trackWaveformCanvasRef.current.offsetWidth;
        trackWaveformCanvasRef.current.height = trackWaveformCanvasRef.current.offsetHeight;
        
        // Redraw track waveform if available
        if (trackWaveform.waveformData && trackWaveform.peaks) {
          const normalizedProgress = getNormalizedProgress(progress);
          window.dj.visual.drawTrackWaveform(
            trackWaveform.waveformData,
            trackWaveform.peaks,
            trackWaveformCanvasRef.current,
            normalizedProgress,
            trackWaveform.duration,
            trackWaveform.frequencyData
          );
        }
      }
    };
    
    const canvas = trackWaveformCanvasRef.current;
    if (!canvas) return;
    handleResize();
    const observer = new ResizeObserver(handleResize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [progress.currentTime, progress.duration, trackWaveform, track, detailedTimeline]);

  if (!track || !track.file) return null;

  const timelineAnalyzing = detailedTimeline && trackWaveform.analyzing;

  return (
    <div className="track-timeline">
      <small className="track-timeline-label">TRACK TIMELINE</small>
      <small title="End / total duration">{formatTime(progress.duration)}</small>
      <div className="track-timeline-slot">
        {detailedTimeline && <canvas
          ref={trackWaveformCanvasRef}
          className="track-timeline-canvas"
          width="72"
          height="240"
          role="slider"
          tabIndex={0}
          aria-label={`Deck ${name} track position`}
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={progress.duration || 0}
          aria-valuenow={progress.currentTime || 0}
          aria-valuetext={`${formatTime(progress.currentTime)} of ${formatTime(progress.duration)}`}
          onClick={handleWaveformClick}
          onKeyDown={handleWaveformKeyDown}
        ></canvas>}
        {!detailedTimeline && <input
          id={`deck-${name}-seek`}
          className="track-timeline-seek"
          type="range"
          min={0}
          max={progress.duration || 0}
          step={0.01}
          value={progress.currentTime || 0}
          disabled={!progress.duration}
          aria-label={`Deck ${name} track position`}
          aria-orientation="vertical"
          aria-valuetext={`${formatTime(progress.currentTime)} of ${formatTime(progress.duration)}`}
          onChange={(event) => {
            const audio = audioRef.current;
            if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
            audio.currentTime = Math.min(audio.duration, Math.max(0, Number(event.target.value)));
          }}
          onKeyDown={handleWaveformKeyDown}
        />}
        {timelineAnalyzing && (
          <div className="track-timeline-loading" role="status">
            <span className="spinner-border spinner-border-sm text-info" aria-hidden="true"></span>
            <span className="visually-hidden">Analyzing track...</span>
          </div>
        )}
      </div>
      <small title="Current playback time">{formatTime(progress.currentTime)}</small>
    </div>
  );
};

export default Track;
