import React from "react";
import RotaryControl from "./rotary.jsx";

const EFFECTS = [
  { label: 'Filter', engine: 'Filter' },
  { label: 'Echo', engine: 'Echo' },
  { label: 'Reverb', engine: 'Reverb' },
  { label: 'Flanger', engine: 'Flanger' },
  { label: 'Phaser', engine: 'Phaser' },
  { label: 'Beatgrid', engine: 'Beat Repeat' }
];

const FxKnob = ({ deck, slot, trackRack, trackBeatAvailable, globalRack, globalSlot, globalBeatAvailable, globalBeatReference, midiFxRef }) => {
  const [mode, setMode] = React.useState('select');
  const [effectIndex, setEffectIndex] = React.useState(0);
  const [strength, setStrength] = React.useState(0);
  const [route, setRoute] = React.useState('track');
  const effect = EFFECTS[effectIndex];
  const rack = route === 'track' ? trackRack : globalRack;
  const beatAvailable = route === 'track' ? trackBeatAvailable : globalBeatAvailable;
  let beatgridUnavailable = false;
  if (effect.engine === 'Beat Repeat') {
    beatgridUnavailable = !beatAvailable || !rack || !rack.hasWorklet;
  }

  React.useEffect(() => {
    if (!trackRack) return;
    trackRack.select(slot, effect.engine);
    trackRack.setStrength(slot, route === 'track' ? strength / 100 : 0);
  }, [trackRack, slot]);

  React.useEffect(() => {
    if (!globalRack) return;
    globalRack.select(globalSlot, effect.engine);
    globalRack.setStrength(globalSlot, route === 'global' ? strength / 100 : 0);
  }, [globalRack, globalSlot]);

  React.useEffect(() => {
    if (trackRack) trackRack.setStrength(slot, route === 'track' ? strength / 100 : 0);
    if (globalRack) globalRack.setStrength(globalSlot, route === 'global' ? strength / 100 : 0);
  }, [route]);

  const changeValue = value => {
    if (mode === 'select') {
      const nextIndex = Math.max(0, Math.min(EFFECTS.length - 1, value));
      setEffectIndex(nextIndex);
      setStrength(0);
      if (trackRack) trackRack.select(slot, EFFECTS[nextIndex].engine);
      if (globalRack) globalRack.select(globalSlot, EFFECTS[nextIndex].engine);
    } else {
      setStrength(value);
      if (trackRack) trackRack.setStrength(slot, route === 'track' ? value / 100 : 0);
      if (globalRack) globalRack.setStrength(globalSlot, route === 'global' ? value / 100 : 0);
    }
  };
  const toggleMode = () => setMode(current => current === 'select' ? 'strength' : 'select');

  // MIDI uses the same mode and value owners as the visible rotary control.
  React.useLayoutEffect(() => {
    if (!midiFxRef) return;
    const midiDeck = deck === 'A' ? 'left' : 'right';
    const apply = (action) => {
      if (action.slot !== slot) return;
      if (!rack) return;
      if (action.type === 'fxmode') {
        toggleMode();
        return;
      }
      if (action.type !== 'fxvalue' || !Number.isFinite(action.value)) return;
      const midiValue = Math.max(0, Math.min(127, action.value));
      const maximumEffectIndex = EFFECTS.length - 1;
      const nextValue = mode === 'select'
        ? Math.round(midiValue * maximumEffectIndex / 127)
        : Math.round(midiValue * 100 / 127);
      changeValue(nextValue);
    };
    midiFxRef.current[midiDeck][slot] = apply;
    return () => {
      if (midiFxRef.current[midiDeck][slot] === apply) midiFxRef.current[midiDeck][slot] = null;
    };
  });
  const displayMode = mode === 'select' ? 'Select' : 'Strength';
  const availability = beatgridUnavailable ? ' unavailable' : '';
  const nextMode = mode === 'select' ? 'to strength' : 'to effect selection';
  const fxNumber = slot + 1;
  const display = mode === 'select' ? effect.label + ' · ' + strength + '%' + availability : displayMode + ' · ' + effect.label + ' · ' + strength + '%' + availability;
  const routeHelp = route === 'global' ? ' Global mix using ' + globalBeatReference + ' for Beatgrid timing.' : ' Track path.';
  const name = 'Deck ' + deck + ' FX ' + fxNumber + ', ' + display + '.' + routeHelp +
    '. Click, Enter, or Space to switch ' + nextMode + ' mode.';

  const toggleRoute = () => {
    const nextRoute = route === 'track' ? 'global' : 'track';
    if (trackRack) trackRack.setStrength(slot, nextRoute === 'track' ? strength / 100 : 0);
    if (globalRack) globalRack.setStrength(globalSlot, nextRoute === 'global' ? strength / 100 : 0);
    setRoute(nextRoute);
  };

  return (
    <div className="fx-slot-control">
      <RotaryControl
        id={`deck-${deck}-fx-${slot + 1}`}
        label={`FX ${slot + 1}`}
        min={mode === 'select' ? 0 : 0}
        max={mode === 'select' ? EFFECTS.length - 1 : 100}
        step={mode === 'select' ? 1 : 1}
        value={mode === 'select' ? effectIndex : strength}
        singleTap={true}
        pressed={mode === 'strength'}
        disabled={!rack}
        onTap={toggleMode}
        onChange={changeValue}
        accessibleName={name}
        title="Turn or use arrows for the displayed mode; click, Enter, or Space switches mode. Selecting an effect resets strength to zero."
        formatValue={() => display}
      />
      <button type="button" className="btn btn-sm btn-outline-info fx-route-toggle"
        aria-label={`Deck ${deck} FX ${fxNumber} route: ${route === 'track' ? 'Track' : 'Global mix'}`}
        aria-pressed={route === 'global'} disabled={!trackRack || !globalRack}
        title={route === 'track' ? 'Route this slot after the combined Deck A/B mix' : 'Route this slot back to Deck ' + deck}
        onClick={toggleRoute}>{route === 'track' ? 'Track' : 'Global'}</button>
    </div>
  );
};

export default FxKnob;
