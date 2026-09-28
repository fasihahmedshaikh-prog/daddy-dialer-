-- =====================================================================
-- Dashboard performance: a materialized view of per-day, per-workspace
-- call stats so the Dashboard never scans the full dial_call_logs table
-- (which is expected to grow into the tens/hundreds of thousands of rows).
-- Refresh on a schedule (pg_cron below) or on-demand via the
-- refresh_dashboard_stats() RPC, e.g. right after a dialer session ends.
-- =====================================================================

create materialized view dashboard_daily_stats as
select
  workspace_id,
  date_trunc('day', called_at) as day,
  count(*) as total_calls,
  count(distinct lead_id) as unique_leads_touched,
  count(*) filter (
    where outcome in ('connected_dm','connected_gk','connected_other','appointment_set','callback_requested')
  ) as connected_calls
from dial_call_logs
where call_state = 'completed'
group by workspace_id, date_trunc('day', called_at);

create unique index idx_dashboard_daily_stats_pk on dashboard_daily_stats(workspace_id, day);

-- Materialized views can't have RLS. Lock direct REST access to it down
-- entirely — the ONLY sanctioned read path is get_dashboard_stats() below,
-- which is SECURITY DEFINER and checks is_workspace_member() itself. Without
-- this revoke, PostgREST would otherwise expose every workspace's stats to
-- any authenticated user who queries the view directly.
revoke all on dashboard_daily_stats from anon, authenticated;

create or replace function refresh_dashboard_stats()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view concurrently dashboard_daily_stats;
end;
$$;

-- Try to schedule an hourly refresh via pg_cron if the extension is
-- available on this project's plan; safe to ignore the error otherwise
-- (the Dashboard page also calls refresh_dashboard_stats() manually via a
-- "Refresh" affordance / on session-complete as a fallback).
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('refresh-dashboard-stats', '5 * * * *', 'select refresh_dashboard_stats();');
exception when others then
  raise notice 'pg_cron not available on this project — refresh_dashboard_stats() must be called manually or from an Edge Function on a schedule instead.';
end $$;

-- RLS-equivalent for the materialized view: views can't have RLS directly,
-- so wrap it in a function that filters by the caller's workspace and use
-- that from the client instead of querying the view directly.
create or replace function get_dashboard_stats(p_workspace_id uuid, p_since date)
returns table(day date, total_calls bigint, unique_leads_touched bigint, connected_calls bigint)
language sql
security definer
set search_path = public
stable
as $$
  select d.day::date, d.total_calls, d.unique_leads_touched, d.connected_calls
  from dashboard_daily_stats d
  where d.workspace_id = p_workspace_id
    and is_workspace_member(p_workspace_id)
    and d.day >= p_since
  order by d.day asc;
$$;
