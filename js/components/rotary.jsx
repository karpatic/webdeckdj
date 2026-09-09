import React from "react";

const RotaryControl = ({ id, label, value, min, max, step, onChange, formatValue, onTap, tapResetVersion, singleTap = false, pressed, title, accessibleName, disabled = false }) => {
  const dragRef = React.useRef(null);
  const tapSequenceRef = React.useRef({
    lastTimestamp: null,
    isActive: false,
    timeoutId: null
  });
  const tapKeyRef = React.useRef(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const hasTapAction = typeof onTap === 'function';
  const tapTimeout = 1500;
  const tapMovementThreshold = 6;

  const resetTapSequence = React.useCallback(() => {
    if (tapSequenceRef.current.timeoutId !== null) {
      window.clearTimeout(tapSequenceRef.current.timeoutId);
    }
    tapSequenceRef.current = {
      lastTimestamp: null,
      isActive: false,
      timeoutId: null
    };
  }, []);

  React.useEffect(() => () => {
    if (tapSequenceRef.current.timeoutId !== null) {
      window.clearTimeout(tapSequenceRef.current.timeoutId);
    }
  }, []);

  React.useEffect(() => {
    if (hasTapAction) resetTapSequence();
  }, [hasTapAction, resetTapSequence, tapResetVersion]);

  const recordTap = React.useCallback((timestamp) => {
    if (!hasTapAction || disabled) return;
    if (singleTap) {
      onTap();
      return;
    }

    const sequence = tapSequenceRef.current;
    if (sequence.timeoutId !== null) {
      window.clearTimeout(sequence.timeoutId);
      sequence.timeoutId = null;
    }
    const elapsed = sequence.lastTimestamp === null
      ? null
      : timestamp - sequence.lastTimestamp;

    if (elapsed === null || elapsed <= 0 || elapsed > tapTimeout) {
      resetTapSequence();
      tapSequenceRef.current.lastTimestamp = timestamp;
    } else if (!sequence.isActive) {
      const firstTimestamp = sequence.lastTimestamp;
      sequence.lastTimestamp = timestamp;
      sequence.isActive = true;
      onTap([firstTimestamp, timestamp]);
    } else {
      sequence.lastTimestamp = timestamp;
      onTap([timestamp]);
    }

    tapSequenceRef.current.timeoutId = window.setTimeout(resetTapSequence, tapTimeout);
  }, [hasTapAction, onTap, resetTapSequence, singleTap, disabled]);

  const stepPrecision = `${step}`.split('.')[1]?.length || 0;
  const clampAndSnap = React.useCallback((nextValue) => {
    const clampedValue = Math.min(max, Math.max(min, nextValue));
    const offset = clampedValue - min;
    const snappedValue = min + Math.round(offset / step) * step;
    return Number(snappedValue.toFixed(stepPrecision));
  }, [max, min, step, stepPrecision]);

  const updateValue = React.useCallback((nextValue) => {
    const normalizedValue = clampAndSnap(nextValue);
    if (normalizedValue !== value) onChange(normalizedValue);
  }, [clampAndSnap, onChange, value]);

  const finishDrag = (event) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    const completedDrag = dragRef.current;
    dragRef.current = null;
    setIsDragging(false);
    if (hasTapAction && !completedDrag.hasMoved) {
      recordTap(Date.now());
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const cancelDrag = (event) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsDragging(false);
    if (hasTapAction) resetTapSequence();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handlePointerDown = (event) => {
    if (disabled || dragRef.current) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startValue: value,
      hasMoved: false
    };
    setIsDragging(true);
  };

  const handlePointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (hasTapAction && !drag.hasMoved) {
      const horizontalDistance = event.clientX - drag.startX;
      const verticalDistance = event.clientY - drag.startY;
      const movementSquared = horizontalDistance * horizontalDistance + verticalDistance * verticalDistance;
      if (movementSquared < tapMovementThreshold * tapMovementThreshold) return;
      drag.hasMoved = true;
      resetTapSequence();
    }
    const range = max - min;
    const distance = drag.startY - event.clientY;
    const valueChange = distance / 160 * range;
    updateValue(drag.startValue + valueChange);
  };

  const handleKeyDown = (event) => {
    if (disabled) return;
    if (hasTapAction && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      if (event.repeat || tapKeyRef.current !== null) return;
      tapKeyRef.current = event.key;
      recordTap(Date.now());
      return;
    }

    let nextValue;
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') nextValue = value + step;
    if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') nextValue = value - step;
    if (event.key === 'Home') nextValue = min;
    if (event.key === 'End') nextValue = max;
    if (nextValue === undefined) return;
    event.preventDefault();
    updateValue(nextValue);
  };

  const handleKeyUp = (event) => {
    if (tapKeyRef.current === event.key) tapKeyRef.current = null;
  };

  const handleLostPointerCapture = (event) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsDragging(false);
    if (hasTapAction) resetTapSequence();
  };

  const valueOffset = value - min;
  const valueRange = max - min;
  const normalizedPosition = valueRange > 0 ? valueOffset / valueRange : 0;
  const angle = -135 + normalizedPosition * 270;
  const displayValue = formatValue ? formatValue(value) : value;

  const hasVisibleLabel = label !== null && label !== undefined && label !== '';

  return (
    <div className={`rotary-field${hasVisibleLabel ? '' : ' without-label'}${pressed ? ' is-killed' : ''}`}>
      {hasVisibleLabel && <span id={`${id}-label`} className="eq-label">{label}</span>}
      <div
        id={id}
        className={`rotary-control${isDragging ? ' is-dragging' : ''}`}
        role={singleTap ? "button" : "slider"}
        title={title}
        tabIndex="0"
        aria-label={accessibleName}
        aria-labelledby={accessibleName ? undefined : hasVisibleLabel ? `${id}-label ${id}-value` : `${id}-value`}
        aria-pressed={singleTap ? pressed : undefined}
        aria-disabled={disabled}
        aria-describedby={hasTapAction ? "shared-dj-help-panel" : undefined}
        aria-keyshortcuts={hasTapAction ? "Enter Space" : undefined}
        aria-valuemin={singleTap ? undefined : min}
        aria-valuemax={singleTap ? undefined : max}
        aria-valuenow={singleTap ? undefined : value}
        aria-valuetext={singleTap ? undefined : `${displayValue}`}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onClick={(event) => {
          // Assistive-technology activation has no pointer sequence. Real pointer
          // taps are handled on release, so their following click must not repeat it.
          if (event.detail === 0 && tapKeyRef.current === null && !dragRef.current) recordTap(Date.now());
        }}
        onBlur={() => { tapKeyRef.current = null; }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={cancelDrag}
        onLostPointerCapture={handleLostPointerCapture}
      >
        <span className="rotary-pointer" style={{ transform: `rotate(${angle}deg)` }} />
      </div>
      <output id={`${id}-value`} className="eq-value">{displayValue}</output>
    </div>
  );
};

export default RotaryControl;
