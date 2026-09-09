import React from "react";
import RotaryControl from "./rotary.jsx";
import FxKnob from "./fx-knob.jsx";

const formatSignedValue = (value, suffix) => {
  const displayValue = suffix === '%' ? Number(value).toFixed(1) : value;
  return `${value > 0 ? "+" : ""}${displayValue}${suffix}`;
};

const EQ = ({ nodesRef, nodesVersion, audioContext, name, audioRef, bpmControl, pitch, onPitchChange, onPitchAdjust, volume, onVolumeChange, syncControl, timeline, scrollPreview, midiEQRef, midiFxRef, fxRack, beatAvailable }) => {
  const [eq, setEq] = React.useState({ bass: 0, mid: 0, treble: 0 });
  const [killed, setKilled] = React.useState({ bass: false, mid: false, treble: false });


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
    if (onPitchChange) onPitchChange(value);
  };
  const handleVolumeChange = (value) => {
    if (onVolumeChange) onVolumeChange(value);
  };

  // MIDI shares the same state owners as the rotary controls, including retained kill gain.
  React.useLayoutEffect(() => {
    if (!midiEQRef) return;
    const deck = name === 'A' ? 'left' : 'right';
    const apply = (action) => {
      const band = action.band;
      if (band !== 'bass' && band !== 'mid' && band !== 'treble') return;
      if (action.type === 'eqkill') toggleKill(band);
      else if (action.type === 'eqvalue' && Number.isFinite(action.value)) {
        handleEQChange(band, Math.round(Math.max(-10, Math.min(10, action.value)) * 2) / 2);
      }
    };
    midiEQRef.current[deck] = apply;
    return () => {
      if (midiEQRef.current[deck] === apply) midiEQRef.current[deck] = null;
    };
  });

  return (
    <div className={`eq-controls eq-controls-${name}`}>
      <div className="volume-fader">
        {syncControl}
        <label className="visually-hidden" htmlFor={`deck-${name}-volume`}>Deck {name} volume</label>
        <div className="volume-fader-slot">
          <input
            id={`deck-${name}-volume`}
            type="range"
            className="dj-fader dj-fader-vertical"
            aria-label={`Deck ${name} volume`}
            aria-orientation="vertical"
            aria-valuetext={`${Number(volume).toFixed(1)}%`}
            min="0" max="100" step="1" value={volume}
            onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
          />
        </div>
      </div>
      {timeline}
      {scrollPreview}
      <div className="eq-control-column">
        <div className="eq-knobs">
          <div className="deck-top-knobs mb-1">
            <div className="pitch-control-group">
              <RotaryControl
                id={`deck-${name}-pitch`} label="Pitch"
                min={-8} max={8} step={0.1} value={pitch}
                onChange={handlePitchChange}
                accessibleName={`Deck ${name} Pitch`}
                formatValue={(value) => formatSignedValue(value, '%')}
              />
              <div className="pitch-step-buttons" aria-label={`Deck ${name} pitch fine adjustment`}>
                <button type="button" className="btn btn-sm btn-outline-light" aria-label={`Decrease Deck ${name} pitch by 0.1 percentage points`} onClick={() => onPitchAdjust(-0.1)}>−</button>
                <button type="button" className="btn btn-sm btn-outline-light" aria-label={`Increase Deck ${name} pitch by 0.1 percentage points`} onClick={() => onPitchAdjust(0.1)}>+</button>
              </div>
            </div>
            <div className="deck-bpm-control">{bpmControl}</div>
          </div>
          <div className="deck-fx-knobs mb-1">
            <FxKnob deck={name} slot={0} rack={fxRack} beatAvailable={beatAvailable} midiFxRef={midiFxRef} />
            <FxKnob deck={name} slot={1} rack={fxRack} beatAvailable={beatAvailable} midiFxRef={midiFxRef} />
          </div>
          {['treble', 'mid', 'bass'].map((band) => (
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
