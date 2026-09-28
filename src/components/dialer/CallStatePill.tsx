import React from 'react';
import { cn } from '@/lib/utils';
import type { CallUIState } from '@/contexts/DialerContext';

const LABELS: Record<CallUIState, string> = {
  idle: 'Idle',
  connecting: 'Connecting…',
  live: 'Live',
  conferencing: 'Conferencing',
};

export function CallStatePill({ state }: { state: CallUIState }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
        state === 'idle' && 'border-border-strong text-text-tertiary',
        state === 'connecting' && 'border-warning/40 text-warning',
        state === 'live' && 'border-accent/40 text-accent',
        state === 'conferencing' && 'border-info/40 text-info'
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          state === 'idle' && 'bg-text-tertiary',
          state === 'connecting' && 'bg-warning animate-pulse',
          state === 'live' && 'bg-accent animate-pulse-ring',
          state === 'conferencing' && 'bg-info animate-pulse-ring'
        )}
      />
      {LABELS[state]}
    </span>
  );
}
