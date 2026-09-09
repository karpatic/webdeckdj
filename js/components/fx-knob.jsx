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

const FxKnob = ({ deck, slot, rack, beatAvailable, midiFxRef }) => {
  const [mode, setMode] = React.useState('select');
  const [effectIndex, setEffectIndex] = React.useState(0);
  const [strength, setStrength] = React.useState(0);
  const effect = EFFECTS[effectIndex];
  let beatgridUnavailable = false;
  if (effect.engine === 'Beat Repeat') {
    beatgridUnavailable = !beatAvailable || !rack || !rack.hasWorklet;
  }

  React.useEffect(() => {
    if (!rack) return;
    rack.select(slot, effect.engine);
    rack.setStrength(slot, strength / 100);
  }, [rack, slot]);

  const changeValue = value => {
    if (mode === 'select') {
      const nextIndex = Math.max(0, Math.min(EFFECTS.length - 1, value));
      setEffectIndex(nextIndex);
      setStrength(0);
      if (rack) rack.select(slot, EFFECTS[nextIndex].engine);
    } else {
      setStrength(value);
      if (rack) rack.setStrength(slot, value / 100);
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
  const name = 'Deck ' + deck + ' FX ' + fxNumber + ', ' + display +
    '. Click, Enter, or Space to switch ' + nextMode + ' mode.';

  return (
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
  );
};

export default FxKnob;
