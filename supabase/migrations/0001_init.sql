-- =====================================================================
-- Daddy Dialer — core schema
-- Run in order: 0001_init.sql, 0002_rls.sql, 0003_functions.sql,
-- 0004_dashboard_views.sql
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Enums (snake_case values throughout, per spec)
-- ---------------------------------------------------------------------
create type lead_status as enum ('new', 'in_progress', 'completed', 'disqualified');

create type lead_outcome as enum (
  'connected_dm',
  'connected_gk',
  'connected_other',
  'voicemail',
  'busy',
  'no_answer',
  'bad_number',
  'not_interested',
  'do_not_call',
  'callback_requested',
  'appointment_set',
  'dialed'
);

create type session_status as enum ('pending', 'active', 'paused', 'completed');

create type session_lead_status as enum ('queued', 'dialing', 'done', 'skipped');

create type workspace_role as enum ('owner', 'admin', 'member');

create type call_state as enum (
  'queued', 'ringing', 'in_progress', 'completed', 'busy', 'failed', 'no_answer', 'canceled'
);

-- ---------------------------------------------------------------------
-- workspaces
-- ---------------------------------------------------------------------
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Twilio config + misc settings, one row per workspace.
-- auth_token / api_secret are write-only from the client's perspective in practice
-- (RLS lets members read them because they configured it themselves, but the
-- actual outbound Twilio calls happen from Edge Functions using the service role,
-- never trusting a client-supplied value at call time).
create table workspace_settings (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  twilio_account_sid text,
  twilio_auth_token text,
  twilio_api_key text,
  twilio_api_secret text,
  twilio_twiml_app_sid text,
  twilio_caller_number text,
  default_mic_device_id text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- workspace_members
-- ---------------------------------------------------------------------
create table workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role workspace_role not null default 'member',
  display_name text,
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create index idx_workspace_members_user on workspace_members(user_id);

-- ---------------------------------------------------------------------
-- leads
-- ---------------------------------------------------------------------
create table leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  business_name text not null,
  phone text not null,             -- normalized E.164-ish, e.g. +15125551234
  phone_raw text,                  -- original as imported, for display/audit
  address text,
  city text,
  state text,
  zip text,
  website text,
  email text,
  notes text,
  status lead_status not null default 'new',
  outcome lead_outcome,
  last_called_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Dedup by normalized phone number within a workspace (CSV import is idempotent).
  unique (workspace_id, phone)
);

create index idx_leads_workspace on leads(workspace_id);
create index idx_leads_workspace_status on leads(workspace_id, status);
create index idx_leads_workspace_outcome on leads(workspace_id, outcome);
create index idx_leads_workspace_city on leads(workspace_id, city);
create index idx_leads_workspace_state on leads(workspace_id, state);
create index idx_leads_workspace_last_called on leads(workspace_id, last_called_at);
-- keyword search across business_name / phone / city / address
create index idx_leads_search on leads using gin (
  to_tsvector('simple', coalesce(business_name,'') || ' ' || coalesce(phone,'') || ' ' || coalesce(city,'') || ' ' || coalesce(address,''))
);

-- ---------------------------------------------------------------------
-- calling_sessions
-- ---------------------------------------------------------------------
create table calling_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  status session_status not null default 'pending',
  filter_json jsonb not null default '{}'::jsonb, -- the filter criteria used to build it
  created_by uuid references auth.users(id),
  total_leads int not null default 0,
  completed_leads int not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_sessions_workspace on calling_sessions(workspace_id);
create index idx_sessions_workspace_status on calling_sessions(workspace_id, status);

-- ---------------------------------------------------------------------
-- session_leads (junction: queue order + per-session dedup)
-- ---------------------------------------------------------------------
create table session_leads (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references calling_sessions(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  queue_order int not null,
  status session_lead_status not null default 'queued',
  dialed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (session_id, lead_id)
);

create index idx_session_leads_session on session_leads(session_id, queue_order);

-- Enforce "same number not dialed twice in the same session": a partial unique
-- index joined through leads.phone is not directly expressible without a
-- generated column, so we denormalize the normalized phone onto session_leads.
alter table session_leads add column phone text;

create or replace function session_leads_set_phone() returns trigger as $$
begin
  select l.phone into new.phone from leads l where l.id = new.lead_id;
  return new;
end;
$$ language plpgsql;

create trigger trg_session_leads_set_phone
  before insert or update of lead_id on session_leads
  for each row execute function session_leads_set_phone();

create unique index uq_session_leads_phone_per_session on session_leads(session_id, phone);

-- ---------------------------------------------------------------------
-- dial_call_logs
-- ---------------------------------------------------------------------
create table dial_call_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  session_id uuid references calling_sessions(id) on delete set null,
  twilio_call_sid text unique,
  twilio_parent_call_sid text,
  direction text not null default 'outbound' check (direction in ('outbound','inbound')),
  from_number text,
  to_number text not null,
  call_state call_state not null default 'queued',
  outcome lead_outcome,
  duration_seconds int,
  recording_url text,
  recording_sid text,
  conference_sid text,
  is_conference boolean not null default false,
  dialed_by uuid references auth.users(id),
  called_at timestamptz not null default now(),
  ended_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_call_logs_workspace on dial_call_logs(workspace_id, called_at desc);
create index idx_call_logs_lead on dial_call_logs(lead_id);
create index idx_call_logs_session on dial_call_logs(session_id);
create index idx_call_logs_sid on dial_call_logs(twilio_call_sid);

-- ---------------------------------------------------------------------
-- call_transcripts (kept separate — can be populated async by a
-- transcription webhook/edge function without locking the call log row)
-- ---------------------------------------------------------------------
create table call_transcripts (
  id uuid primary key default gen_random_uuid(),
  call_log_id uuid not null references dial_call_logs(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  transcript_text text,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (call_log_id)
);

create index idx_transcripts_workspace on call_transcripts(workspace_id);

-- ---------------------------------------------------------------------
-- saved_filters
-- ---------------------------------------------------------------------
create table saved_filters (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  filter_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_saved_filters_workspace_user on saved_filters(workspace_id, user_id);

-- ---------------------------------------------------------------------
-- updated_at bookkeeping trigger, reused everywhere
-- ---------------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_workspaces_updated_at before update on workspaces
  for each row execute function set_updated_at();
create trigger trg_leads_updated_at before update on leads
  for each row execute function set_updated_at();
create trigger trg_sessions_updated_at before update on calling_sessions
  for each row execute function set_updated_at();
create trigger trg_call_logs_updated_at before update on dial_call_logs
  for each row execute function set_updated_at();
create trigger trg_transcripts_updated_at before update on call_transcripts
  for each row execute function set_updated_at();
create trigger trg_workspace_settings_updated_at before update on workspace_settings
  for each row execute function set_updated_at();
