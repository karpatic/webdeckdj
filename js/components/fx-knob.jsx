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

const FxKnob = ({ deck, slot, rack, beatAvailable, midiFxRef, onMidiFxStateChange }) => {
  const midiDeck = deck === 'A' ? 'left' : 'right';
  const [mode, setMode] = React.useState('select');
  const [effectIndex, setEffectIndex] = React.useState(0);
  const [strength, setStrength] = React.useState(0);
  const modeRef = React.useRef(mode);
  const effectIndexRef = React.useRef(effectIndex);
  const strengthRef = React.useRef(strength);
  const selectDeltaRemainderRef = React.useRef(0);
  modeRef.current = mode;
  effectIndexRef.current = effectIndex;
  strengthRef.current = strength;
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
    if (modeRef.current === 'select') {
      selectDeltaRemainderRef.current = 0;
      const nextIndex = Math.max(0, Math.min(EFFECTS.length - 1, value));
      effectIndexRef.current = nextIndex;
      strengthRef.current = 0;
      setEffectIndex(nextIndex);
      setStrength(0);
      if (rack) rack.select(slot, EFFECTS[nextIndex].engine);
    } else {
      strengthRef.current = value;
      setStrength(value);
      if (rack) rack.setStrength(slot, value / 100);
    }
  };
  const toggleMode = () => {
    selectDeltaRemainderRef.current = 0;
    const nextMode = modeRef.current === 'select' ? 'strength' : 'select';
    modeRef.current = nextMode;
    setMode(nextMode);
  };

  // MIDI uses the same mode and value owners as the visible rotary control.
  React.useLayoutEffect(() => {
    if (!midiFxRef) return;
    const apply = (action) => {
      if (action.slot !== slot) return;
      if (!rack) return;
      if (action.type === 'fxmode') {
        toggleMode();
        return;
      }
      if (action.type !== 'fxvalue' || !Number.isFinite(action.delta)) return;
      if (modeRef.current === 'select') {
        const accumulatedDelta = selectDeltaRemainderRef.current + action.delta;
        const selectionSteps = accumulatedDelta < 0
          ? Math.ceil(accumulatedDelta / 4)
          : Math.floor(accumulatedDelta / 4);
        selectDeltaRemainderRef.current = accumulatedDelta - selectionSteps * 4;
        if (selectionSteps === 0) return;
        const currentIndex = effectIndexRef.current;
        const unclampedIndex = currentIndex + selectionSteps;
        const nextIndex = Math.max(0, Math.min(EFFECTS.length - 1, unclampedIndex));
        // A turn into the end stop is not an effect selection and must not clear strength.
        if (nextIndex === currentIndex) {
          selectDeltaRemainderRef.current = 0;
          return;
        }
        if (nextIndex !== unclampedIndex || nextIndex === 0 || nextIndex === EFFECTS.length - 1) {
          selectDeltaRemainderRef.current = 0;
        }
        effectIndexRef.current = nextIndex;
        strengthRef.current = 0;
        setEffectIndex(nextIndex);
        setStrength(0);
        rack.select(slot, EFFECTS[nextIndex].engine);
      } else {
        const currentStrength = strengthRef.current;
        const nextStrength = Math.max(0, Math.min(100, currentStrength + action.delta));
        if (nextStrength === currentStrength) return;
        strengthRef.current = nextStrength;
        setStrength(nextStrength);
        rack.setStrength(slot, nextStrength / 100);
      }
    };
    midiFxRef.current[midiDeck][slot] = apply;
    return () => {
      if (midiFxRef.current[midiDeck][slot] === apply) midiFxRef.current[midiDeck][slot] = null;
    };
  });
  React.useEffect(() => {
    if (onMidiFxStateChange) onMidiFxStateChange(midiDeck, slot, mode === 'strength');
  }, [midiDeck, slot, mode, onMidiFxStateChange]);
  const displayMode = mode === 'select' ? 'Select' : 'Strength';
  const availability = beatgridUnavailable ? ' unavailable' : '';
  const nextMode = mode === 'select' ? 'to strength' : 'to effect selection';
  const fxNumber = slot + 1;
  const display = mode === 'select' ? effect.label + ' · ' + strength + '%' + availability : displayMode + ' · ' + effect.label + ' · ' + strength + '%' + availability;
  const name = 'Deck ' + deck + ' FX' + fxNumber + ', ' + display +
    '. Click, Enter, or Space to switch ' + nextMode + ' mode.';

  return (
    <RotaryControl
        id={`deck-${deck}-fx-${slot + 1}`}
        label={null}
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
