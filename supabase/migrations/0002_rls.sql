-- =====================================================================
-- Row Level Security — every workspace-scoped table is locked to members
-- of that workspace. We use a SECURITY DEFINER helper to avoid recursive
-- RLS lookups (workspace_members referencing itself through a policy).
-- =====================================================================

create or replace function is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
  );
$$;

create or replace function workspace_role_of(target_workspace_id uuid)
returns workspace_role
language sql
security definer
set search_path = public
stable
as $$
  select wm.role from workspace_members wm
  where wm.workspace_id = target_workspace_id
    and wm.user_id = auth.uid()
  limit 1;
$$;

-- ---------------------------------------------------------------------
-- workspaces
-- ---------------------------------------------------------------------
alter table workspaces enable row level security;

create policy "members can read their workspace"
  on workspaces for select
  using (is_workspace_member(id));

create policy "owners/admins can update their workspace"
  on workspaces for update
  using (workspace_role_of(id) in ('owner','admin'));

-- inserts happen via the handle_new_user trigger (security definer), not
-- directly by clients, so no client-facing insert policy is needed.

-- ---------------------------------------------------------------------
-- workspace_settings
-- ---------------------------------------------------------------------
alter table workspace_settings enable row level security;

create policy "members can read workspace settings"
  on workspace_settings for select
  using (is_workspace_member(workspace_id));

create policy "owners/admins can upsert workspace settings"
  on workspace_settings for insert
  with check (workspace_role_of(workspace_id) in ('owner','admin'));

create policy "owners/admins can update workspace settings"
  on workspace_settings for update
  using (workspace_role_of(workspace_id) in ('owner','admin'));

-- ---------------------------------------------------------------------
-- workspace_members
-- ---------------------------------------------------------------------
alter table workspace_members enable row level security;

create policy "members can read membership list"
  on workspace_members for select
  using (is_workspace_member(workspace_id));

create policy "owners/admins can invite members"
  on workspace_members for insert
  with check (workspace_role_of(workspace_id) in ('owner','admin'));

create policy "owners/admins can remove members"
  on workspace_members for delete
  using (workspace_role_of(workspace_id) in ('owner','admin'));

-- ---------------------------------------------------------------------
-- leads
-- ---------------------------------------------------------------------
alter table leads enable row level security;

create policy "members can read leads"
  on leads for select
  using (is_workspace_member(workspace_id));

create policy "members can insert leads"
  on leads for insert
  with check (is_workspace_member(workspace_id));

create policy "members can update leads"
  on leads for update
  using (is_workspace_member(workspace_id));

create policy "members can delete leads"
  on leads for delete
  using (is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------
-- calling_sessions
-- ---------------------------------------------------------------------
alter table calling_sessions enable row level security;

create policy "members can read sessions"
  on calling_sessions for select
  using (is_workspace_member(workspace_id));

create policy "members can insert sessions"
  on calling_sessions for insert
  with check (is_workspace_member(workspace_id));

create policy "members can update sessions"
  on calling_sessions for update
  using (is_workspace_member(workspace_id));

create policy "members can delete sessions"
  on calling_sessions for delete
  using (is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------
-- session_leads (scoped via the parent session's workspace)
-- ---------------------------------------------------------------------
alter table session_leads enable row level security;

create policy "members can read session_leads"
  on session_leads for select
  using (exists (
    select 1 from calling_sessions cs
    where cs.id = session_leads.session_id and is_workspace_member(cs.workspace_id)
  ));

create policy "members can insert session_leads"
  on session_leads for insert
  with check (exists (
    select 1 from calling_sessions cs
    where cs.id = session_leads.session_id and is_workspace_member(cs.workspace_id)
  ));

create policy "members can update session_leads"
  on session_leads for update
  using (exists (
    select 1 from calling_sessions cs
    where cs.id = session_leads.session_id and is_workspace_member(cs.workspace_id)
  ));

create policy "members can delete session_leads"
  on session_leads for delete
  using (exists (
    select 1 from calling_sessions cs
    where cs.id = session_leads.session_id and is_workspace_member(cs.workspace_id)
  ));

-- ---------------------------------------------------------------------
-- dial_call_logs
-- ---------------------------------------------------------------------
alter table dial_call_logs enable row level security;

create policy "members can read call logs"
  on dial_call_logs for select
  using (is_workspace_member(workspace_id));

create policy "members can insert call logs"
  on dial_call_logs for insert
  with check (is_workspace_member(workspace_id));

create policy "members can update call logs"
  on dial_call_logs for update
  using (is_workspace_member(workspace_id));

-- Deletes are intentionally not allowed for anyone but service_role
-- (Edge Functions) — the call log is an audit trail.

-- ---------------------------------------------------------------------
-- call_transcripts
-- ---------------------------------------------------------------------
alter table call_transcripts enable row level security;

create policy "members can read transcripts"
  on call_transcripts for select
  using (is_workspace_member(workspace_id));

-- transcripts are written by the service role (edge function) only.

-- ---------------------------------------------------------------------
-- saved_filters (per-user within a workspace)
-- ---------------------------------------------------------------------
alter table saved_filters enable row level security;

create policy "members can read own saved filters"
  on saved_filters for select
  using (is_workspace_member(workspace_id) and user_id = auth.uid());

create policy "members can insert own saved filters"
  on saved_filters for insert
  with check (is_workspace_member(workspace_id) and user_id = auth.uid());

create policy "members can delete own saved filters"
  on saved_filters for delete
  using (user_id = auth.uid());
