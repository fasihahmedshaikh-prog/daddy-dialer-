import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Strip everything but digits, then normalize to E.164-ish US/international form.
 * Used consistently before dedup comparisons AND before dialing via Twilio. */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  // 10-digit US number -> assume +1
  if (digits.length === 10) return `+1${digits}`;
  // 11 digits starting with 1 -> US with country code already present
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  // Already has a leading + and other digits -> keep as international
  if (raw.trim().startsWith('+')) return `+${digits}`;
  // Fallback: return digits with + prefix (best effort for non-US numbers)
  return `+${digits}`;
}

/** Display formatting for a normalized +1XXXXXXXXXX number -> (XXX) XXX-XXXX */
export function formatPhoneDisplay(e164: string | null | undefined): string {
  if (!e164) return '—';
  const digits = e164.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    const d = digits.slice(1);
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return e164;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds && seconds !== 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const OUTCOME_LABELS: Record<string, string> = {
  connected_dm: 'Connected - DM',
  connected_gk: 'Connected - Gatekeeper',
  connected_other: 'Connected - Other',
  voicemail: 'Voicemail',
  busy: 'Busy',
  no_answer: 'No Answer',
  bad_number: 'Bad Number',
  not_interested: 'Not Interested',
  do_not_call: 'Do Not Call',
  callback_requested: 'Callback Requested',
  appointment_set: 'Appointment Set',
  dialed: 'Dialed',
};

export const OUTCOME_COLORS: Record<string, string> = {
  connected_dm: 'bg-accent/15 text-accent border-accent/30',
  connected_gk: 'bg-info/15 text-info border-info/30',
  connected_other: 'bg-info/15 text-info border-info/30',
  voicemail: 'bg-warning/15 text-warning border-warning/30',
  busy: 'bg-text-tertiary/15 text-text-secondary border-border-strong',
  no_answer: 'bg-text-tertiary/15 text-text-secondary border-border-strong',
  bad_number: 'bg-danger/15 text-danger border-danger/30',
  not_interested: 'bg-danger/15 text-danger border-danger/30',
  do_not_call: 'bg-danger/15 text-danger border-danger/30',
  callback_requested: 'bg-accent/15 text-accent border-accent/30',
  appointment_set: 'bg-accent/20 text-accent-bright border-accent/40',
  dialed: 'bg-text-tertiary/15 text-text-secondary border-border-strong',
};

export const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  in_progress: 'In Progress',
  completed: 'Completed',
  disqualified: 'Disqualified',
};

export const SESSION_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
};
