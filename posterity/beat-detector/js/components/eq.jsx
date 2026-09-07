import React from "react";
import RotaryControl from "./rotary.jsx";

const formatSignedValue = (value, suffix) => `${value > 0 ? "+" : ""}${value}${suffix}`;

const EQ = ({ nodesRef, nodesVersion, audioContext, name, audioRef, sensitivityControl, beatStatus, timeline }) => {
  const [eq, setEq] = React.useState({ bass: 0, mid: 0, treble: 0 });
  const [killed, setKilled] = React.useState({ bass: false, mid: false, treble: false });
  const [pitch, setPitch] = React.useState(0);
  const [volume, setVolume] = React.useState(100);

  // Selected gains stay intact while killed; reapply when the deck recreates filters.
  React.useEffect(() => {
    if (!nodesRef.current.initialized || !audioContext) return;
    window.dj.audio.updateEQ(nodesRef.current, {
      bass: killed.bass ? -40 : eq.bass,
      mid: killed.mid ? -40 : eq.mid,
      treble: killed.treble ? -40 : eq.treble
    });
  }, [eq, killed, nodesVersion, audioContext]);

  const handleEQChange = (band, value) => {
    setEq(current => {
      const next = { ...current };
      next[band] = value;
      return next;
    });
  };
  const toggleKill = (band) => {
    setKilled(current => {
      const next = { ...current };
      next[band] = !current[band];
      return next;
    });
  };
  const handlePitchChange = (value) => {
    setPitch(value);
    if (audioRef.current) window.dj.audio.applyPitchBend(audioRef.current, value);
  };
  const handleVolumeChange = (value) => {
    setVolume(value);
    if (nodesRef.current?.gainNode && audioContext) {
      const gainValue = value / 100;
      nodesRef.current.gainNode.gain.setTargetAtTime(gainValue, audioContext.currentTime, 0.01);
    }
  };

  return (
    <div className={`eq-controls eq-controls-${name}`}>
      <div className="volume-fader">
        <label className="visually-hidden" htmlFor={`deck-${name}-volume`}>Deck {name} volume</label>
        <div className="volume-fader-slot">
          <input
            id={`deck-${name}-volume`}
            type="range"
            className="dj-fader dj-fader-vertical"
            aria-label={`Deck ${name} volume`}
            aria-orientation="vertical"
            aria-valuetext={`${volume}%`}
            min="0" max="100" step="1" value={volume}
            onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
          />
        </div>
      </div>
      {timeline}
      <div className="eq-control-column">
        <div className="eq-knobs">
          <div className="deck-top-knobs mb-1">
            <RotaryControl
              id={`deck-${name}-pitch`} label="Pitch"
              min={-8} max={8} step={0.1} value={pitch}
              onChange={handlePitchChange}
              accessibleName={`Deck ${name} Pitch`}
              formatValue={(value) => formatSignedValue(value, '%')}
            />
            <div className="deck-bpm-control">{sensitivityControl}{beatStatus}</div>
          </div>
          {['bass', 'mid', 'treble'].map((band) => (
            <div className="mb-1" key={band}>
              <RotaryControl
                id={`deck-${name}-${band}`}
                label={band.charAt(0).toUpperCase() + band.slice(1)}
                min={-10} max={10} step={0.5} value={eq[band]}
                singleTap={true}
                pressed={killed[band]}
                onTap={() => toggleKill(band)}
                accessibleName={`Deck ${name} ${band} band kill; selected ${eq[band]} dB`}
                title="Click / Enter / Space toggles band kill (-40 dB filter gain). Drag or arrow keys adjust the retained gain."
                onChange={(value) => handleEQChange(band, value)}
                formatValue={(value) => killed[band] ? 'KILL' : formatSignedValue(value, ' dB')}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default EQ;
