-- =====================================================================
-- Adds an optional "follow up at" timestamp to each conversation log
-- entry, so when you log what happened on a call you can also note
-- when to call the lead back. Nullable — most entries won't set one.
-- =====================================================================

alter table lead_conversation_entries
  add column follow_up_at timestamptz null;

create index idx_lead_conversation_entries_follow_up
  on lead_conversation_entries(follow_up_at)
  where follow_up_at is not null;
