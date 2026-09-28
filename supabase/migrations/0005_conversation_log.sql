-- =====================================================================
-- Per-lead conversation log: a running, timestamped history of notes
-- against a lead, separate from the single `leads.notes` field (which
-- gets overwritten every time it's edited). Each entry here is appended,
-- never overwritten, so you can see the full history of what was said
-- across every call/email/touchpoint with that lead over time.
-- =====================================================================

create table lead_conversation_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  body text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_lead_conversation_entries_lead on lead_conversation_entries(lead_id, created_at desc);
create index idx_lead_conversation_entries_workspace on lead_conversation_entries(workspace_id);

alter table lead_conversation_entries enable row level security;

create policy "conversation entries are viewable by workspace members"
  on lead_conversation_entries for select
  using (is_workspace_member(workspace_id));

create policy "conversation entries are insertable by workspace members"
  on lead_conversation_entries for insert
  with check (is_workspace_member(workspace_id));

create policy "conversation entries are deletable by workspace members"
  on lead_conversation_entries for delete
  using (is_workspace_member(workspace_id));

-- Entries are an append-only log by design — no update policy, so past
-- entries can't be silently edited after the fact (only added or deleted).
