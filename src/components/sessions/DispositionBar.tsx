import React from 'react';
import { OUTCOME_LABELS, OUTCOME_COLORS, cn } from '@/lib/utils';
import type { LeadOutcome } from '@/types/database';

const CHIP_ORDER: LeadOutcome[] = [
  'connected_dm',
  'connected_gk',
  'connected_other',
  'appointment_set',
  'callback_requested',
  'voicemail',
  'busy',
  'no_answer',
  'bad_number',
  'not_interested',
  'do_not_call',
];

export function DispositionBar({
  onSelect,
  disabled,
}: {
  onSelect: (outcome: LeadOutcome) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CHIP_ORDER.map((outcome) => (
        <button
          key={outcome}
          disabled={disabled}
          onClick={() => onSelect(outcome)}
          className={cn(
            'rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40',
            'hover:brightness-125',
            OUTCOME_COLORS[outcome]
          )}
        >
          {OUTCOME_LABELS[outcome]}
        </button>
      ))}
    </div>
  );
}
