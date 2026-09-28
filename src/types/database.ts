export type LeadStatus = 'new' | 'in_progress' | 'completed' | 'disqualified';

export type LeadOutcome =
  | 'connected_dm'
  | 'connected_gk'
  | 'connected_other'
  | 'voicemail'
  | 'busy'
  | 'no_answer'
  | 'bad_number'
  | 'not_interested'
  | 'do_not_call'
  | 'callback_requested'
  | 'appointment_set'
  | 'dialed';

export type SessionStatus = 'pending' | 'active' | 'paused' | 'completed';
export type SessionLeadStatus = 'queued' | 'dialing' | 'done' | 'skipped';
export type WorkspaceRole = 'owner' | 'admin' | 'member';
export type CallState =
  | 'queued'
  | 'ringing'
  | 'in_progress'
  | 'completed'
  | 'busy'
  | 'failed'
  | 'no_answer'
  | 'canceled';

export interface Lead {
  id: string;
  workspace_id: string;
  business_name: string;
  phone: string;
  phone_raw: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  website: string | null;
  email: string | null;
  notes: string | null;
  status: LeadStatus;
  outcome: LeadOutcome | null;
  last_called_at: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceSettings {
  workspace_id: string;
  twilio_account_sid: string | null;
  twilio_auth_token: string | null;
  twilio_api_key: string | null;
  twilio_api_secret: string | null;
  twilio_twiml_app_sid: string | null;
  twilio_caller_number: string | null;
  default_mic_device_id: string | null;
  updated_at: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  display_name: string | null;
  created_at: string;
}

export interface CallingSession {
  id: string;
  workspace_id: string;
  name: string;
  status: SessionStatus;
  filter_json: Record<string, unknown>;
  created_by: string | null;
  total_leads: number;
  completed_leads: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionLead {
  id: string;
  session_id: string;
  lead_id: string;
  queue_order: number;
  status: SessionLeadStatus;
  dialed_at: string | null;
  phone: string | null;
  created_at: string;
  lead?: Lead;
}

export interface DialCallLog {
  id: string;
  workspace_id: string;
  lead_id: string | null;
  session_id: string | null;
  twilio_call_sid: string | null;
  twilio_parent_call_sid: string | null;
  direction: 'outbound' | 'inbound';
  from_number: string | null;
  to_number: string;
  call_state: CallState;
  outcome: LeadOutcome | null;
  duration_seconds: number | null;
  recording_url: string | null;
  recording_sid: string | null;
  conference_sid: string | null;
  is_conference: boolean;
  dialed_by: string | null;
  called_at: string;
  ended_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  lead?: Lead;
  session?: CallingSession;
  transcript?: CallTranscript;
}

export interface CallTranscript {
  id: string;
  call_log_id: string;
  workspace_id: string;
  transcript_text: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
}

export interface SavedFilter {
  id: string;
  workspace_id: string;
  user_id: string;
  name: string;
  filter_json: LeadFilters;
  created_at: string;
}

export interface LeadConversationEntry {
  id: string;
  workspace_id: string;
  lead_id: string;
  body: string;
  follow_up_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface LeadFilters {
  search?: string;
  status?: LeadStatus[];
  outcome?: LeadOutcome[];
  city?: string;
  state?: string;
  lastCalledBefore?: string;
  lastCalledAfter?: string;
}

