-- =====================================================================
-- Business logic functions
-- =====================================================================

-- ---------------------------------------------------------------------
-- Auto-create a workspace + owner membership when a new user signs up.
-- ---------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_workspace_id uuid;
  ws_name text;
begin
  ws_name := coalesce(new.raw_user_meta_data->>'workspace_name', split_part(new.email, '@', 1) || '''s Workspace');

  insert into workspaces (name, created_by)
  values (ws_name, new.id)
  returning id into new_workspace_id;

  insert into workspace_members (workspace_id, user_id, role, display_name)
  values (new_workspace_id, new.id, 'owner', coalesce(new.raw_user_meta_data->>'full_name', new.email));

  insert into workspace_settings (workspace_id)
  values (new_workspace_id);

  return new;
end;
$$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------
-- Phone normalization mirrored in SQL (keep in sync with src/lib/utils.ts
-- normalizePhone — used by the CSV import RPC so dedup happens server-side
-- too, not just trusted from the client).
-- ---------------------------------------------------------------------
create or replace function normalize_phone(raw text)
returns text
language plpgsql
immutable
as $$
declare
  digits text;
begin
  if raw is null or length(trim(raw)) = 0 then
    return null;
  end if;
  digits := regexp_replace(raw, '\D', '', 'g');
  if length(digits) = 0 then
    return null;
  end if;
  if length(digits) = 10 then
    return '+1' || digits;
  end if;
  if length(digits) = 11 and left(digits, 1) = '1' then
    return '+' || digits;
  end if;
  return '+' || digits;
end;
$$;

-- ---------------------------------------------------------------------
-- Idempotent CSV import. Takes a jsonb array of row objects already
-- mapped to lead columns by the client (import UI does the column
-- mapping/preview; this function does the authoritative dedup+upsert so
-- large imports never round-trip full duplicate detection through the
-- browser). Existing leads are updated (non-destructively — only blank
-- fields are filled in from the new row, business_name/status/outcome are
-- left alone) rather than duplicated, matching "idempotent by phone".
-- ---------------------------------------------------------------------
create or replace function import_leads(
  p_workspace_id uuid,
  p_rows jsonb
)
returns table(inserted_count int, updated_count int, skipped_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  v_phone text;
  v_inserted int := 0;
  v_updated int := 0;
  v_skipped int := 0;
  v_existing_id uuid;
begin
  if not is_workspace_member(p_workspace_id) then
    raise exception 'not a member of this workspace';
  end if;

  for r in select * from jsonb_array_elements(p_rows)
  loop
    v_phone := normalize_phone(r->>'phone');
    if v_phone is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    select id into v_existing_id from leads
      where workspace_id = p_workspace_id and phone = v_phone;

    if v_existing_id is null then
      insert into leads (
        workspace_id, business_name, phone, phone_raw, address, city, state, zip,
        website, email, notes, metadata_json
      ) values (
        p_workspace_id,
        coalesce(r->>'business_name', 'Unknown Business'),
        v_phone,
        r->>'phone',
        r->>'address',
        r->>'city',
        r->>'state',
        r->>'zip',
        nullif(r->>'website',''),
        nullif(r->>'email',''),
        nullif(r->>'notes',''),
        coalesce(r->'metadata_json', '{}'::jsonb)
      );
      v_inserted := v_inserted + 1;
    else
      update leads set
        address = coalesce(nullif(leads.address,''), r->>'address'),
        city = coalesce(nullif(leads.city,''), r->>'city'),
        state = coalesce(nullif(leads.state,''), r->>'state'),
        zip = coalesce(nullif(leads.zip,''), r->>'zip'),
        website = coalesce(nullif(leads.website,''), nullif(r->>'website','')),
        email = coalesce(nullif(leads.email,''), nullif(r->>'email','')),
        metadata_json = leads.metadata_json || coalesce(r->'metadata_json', '{}'::jsonb),
        updated_at = now()
      where id = v_existing_id;
      v_updated := v_updated + 1;
    end if;
  end loop;

  return query select v_inserted, v_updated, v_skipped;
end;
$$;

-- ---------------------------------------------------------------------
-- Build a calling session from a set of lead ids, deduping by normalized
-- phone (keep the highest-priority lead per number — "priority" here is
-- simply first-selected, since the UI passes leads pre-sorted by whatever
-- sort the Leads page currently has applied).
-- ---------------------------------------------------------------------
create or replace function create_session_from_leads(
  p_workspace_id uuid,
  p_name text,
  p_lead_ids uuid[],
  p_filter_json jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_order int := 0;
  v_lead_id uuid;
  v_seen_phones text[] := '{}';
  v_phone text;
begin
  if not is_workspace_member(p_workspace_id) then
    raise exception 'not a member of this workspace';
  end if;

  insert into calling_sessions (workspace_id, name, filter_json, created_by, status)
  values (p_workspace_id, p_name, p_filter_json, auth.uid(), 'pending')
  returning id into v_session_id;

  foreach v_lead_id in array p_lead_ids
  loop
    select phone into v_phone from leads where id = v_lead_id and workspace_id = p_workspace_id;
    if v_phone is null then
      continue; -- lead not found / wrong workspace
    end if;
    if v_phone = any(v_seen_phones) then
      continue; -- session-level dedup: keep first occurrence only
    end if;
    v_seen_phones := array_append(v_seen_phones, v_phone);

    insert into session_leads (session_id, lead_id, queue_order, status)
    values (v_session_id, v_lead_id, v_order, 'queued');
    v_order := v_order + 1;
  end loop;

  update calling_sessions set total_leads = v_order where id = v_session_id;

  return v_session_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Advance session progress bookkeeping whenever a session_lead is marked done/skipped.
-- ---------------------------------------------------------------------
create or replace function bump_session_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('done','skipped') and old.status not in ('done','skipped') then
    update calling_sessions
      set completed_leads = completed_leads + 1
      where id = new.session_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bump_session_progress on session_leads;
create trigger trg_bump_session_progress
  after update of status on session_leads
  for each row execute function bump_session_progress();
