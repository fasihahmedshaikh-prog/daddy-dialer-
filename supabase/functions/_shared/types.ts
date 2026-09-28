export type CallState =
  | 'queued'
  | 'ringing'
  | 'in_progress'
  | 'completed'
  | 'busy'
  | 'failed'
  | 'no_answer'
  | 'canceled';
