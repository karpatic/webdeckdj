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

const FxKnob = ({ deck, slot, rack, beatAvailable }) => {
  const [mode, setMode] = React.useState('select');
  const [effectIndex, setEffectIndex] = React.useState(0);
  const [strength, setStrength] = React.useState(0);
  const effect = EFFECTS[effectIndex];
  const beatgridUnavailable = effect.engine === 'Beat Repeat' && !beatAvailable;

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
  const display = mode === 'select'
    ? 'Select · ' + effect.label + ' · ' + strength + '%' + (beatgridUnavailable ? ' unavailable' : '')
    : 'Strength · ' + effect.label + ' · ' + strength + '%' + (beatgridUnavailable ? ' unavailable' : '');
  const name = 'Deck ' + deck + ' FX ' + (slot + 1) + ', ' + display +
    '. Click, Enter, or Space to switch ' + (mode === 'select' ? 'to strength' : 'to effect selection') + ' mode.';

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
      onTap={() => setMode(current => current === 'select' ? 'strength' : 'select')}
      onChange={changeValue}
      accessibleName={name}
      title="Turn or use arrows for the displayed mode; click, Enter, or Space switches mode. Selecting an effect resets strength to zero."
      formatValue={() => display}
    />
  );
};

export default FxKnob;
