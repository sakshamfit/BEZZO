'use client';

/**
 * Quantity stepper — the marketplace's core micro-interaction.
 *
 * States: a quiet value flash when the number changes (feedback without
 * latency theatre), disabled bounds straight from the server's own line data
 * (MOQ floor, sellable ceiling), and a pending state while a mutation is in
 * flight. The server clamps and re-prices; this control only displays.
 */
import { useEffect, useRef, useState } from 'react';
import { MinusIcon, PlusIcon } from './icons';

export function QuantityStepper({
  value,
  min,
  max,
  pending,
  compact,
  label,
  onDecrease,
  onIncrease,
}: {
  value: number;
  min: number;
  max: number;
  pending?: boolean;
  compact?: boolean;
  label: string;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  const [flash, setFlash] = useState(false);
  const previous = useRef(value);

  useEffect(() => {
    if (previous.current !== value) {
      previous.current = value;
      setFlash(true);
      const timer = setTimeout(() => setFlash(false), 200);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [value]);

  const canDecrease = !pending && value > Math.max(min, 1);
  const canIncrease = !pending && value < max;

  return (
    <div
      className={`stepper${compact ? ' inline' : ''}`}
      role="group"
      aria-label={`Quantity of ${label}`}
    >
      <button
        type="button"
        aria-label={`Decrease quantity of ${label}`}
        disabled={!canDecrease}
        onClick={onDecrease}
      >
        <MinusIcon size={16} />
      </button>
      <span className={`value${flash ? ' flash' : ''}`} aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        aria-label={`Increase quantity of ${label}`}
        disabled={!canIncrease}
        onClick={onIncrease}
      >
        <PlusIcon size={16} />
      </button>
    </div>
  );
}
