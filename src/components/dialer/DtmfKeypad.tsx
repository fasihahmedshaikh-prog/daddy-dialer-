import React from 'react';
import { cn } from '@/lib/utils';

const KEYS = [
  ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
  ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
  ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
  ['*', ''], ['0', '+'], ['#', ''],
];

/**
 * Stays mounted the whole time `visible` is true — the parent is
 * responsible for keeping this true from "connecting" all the way through
 * "live"/"conferencing" (see DialerContext callState), never unmounting it
 * mid-call, per the spec's most emphasized UX requirement.
 */
export function DtmfKeypad({
  onPress,
  disabled,
  className,
}: {
  onPress: (digit: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('grid grid-cols-3 gap-1.5', className)}>
      {KEYS.map(([digit, letters]) => (
        <button
          key={digit}
          type="button"
          disabled={disabled}
          onClick={() => onPress(digit)}
          className="flex flex-col items-center justify-center rounded-md border border-border bg-surface-hover py-2 text-text-primary hover:bg-surface-overlay hover:border-accent/40 active:bg-accent/15 disabled:opacity-40 transition-colors"
        >
          <span className="mono-num text-base font-semibold leading-none">{digit}</span>
          <span className="mt-0.5 text-[9px] tracking-wide text-text-tertiary">{letters}</span>
        </button>
      ))}
    </div>
  );
}
