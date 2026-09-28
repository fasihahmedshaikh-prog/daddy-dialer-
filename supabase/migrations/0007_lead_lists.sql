-- =====================================================================
-- Lead Lists ("sections") — lets you split the Leads table into named
-- groups (one per CSV import / campaign / voice-agent niche), so when
-- you're staring at a lead you know which batch/agent it came from
-- instead of one giant undifferentiated pile.
--
-- A lead belongs to at most one list (list_id is nullable — leads
-- imported before this feature, or imported without picking a section,
-- just show up as "No section" and can be assigned later).
-- =====================================================================

create table lead_lists (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  color text null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_lead_lists_workspace on lead_lists(workspace_id);

alter table lead_lists enable row level security;

create policy "lead lists are viewable by workspace members"
  on lead_lists for select
  using (is_workspace_member(workspace_id));

create policy "lead lists are insertable by workspace members"
  on lead_lists for insert
  with check (is_workspace_member(workspace_id));

create policy "lead lists are updatable by workspace members"
  on lead_lists for update
  using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

create policy "lead lists are deletable by workspace members"
  on lead_lists for delete
  using (is_workspace_member(workspace_id));

-- Deleting a list un-assigns its leads rather than deleting them.
alter table leads add column list_id uuid null references lead_lists(id) on delete set null;
create index idx_leads_list_id on leads(list_id);

-- ---------------------------------------------------------------------
-- Lists + lead counts in one round trip, for the Leads page sidebar.
-- ---------------------------------------------------------------------
create or replace function get_lead_lists_with_counts(p_workspace_id uuid)
returns table(id uuid, name text, color text, created_at timestamptz, lead_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select ll.id, ll.name, ll.color, ll.created_at, count(l.id) as lead_count
  from lead_lists ll
  left join leads l on l.list_id = ll.id
  where ll.workspace_id = p_workspace_id and is_workspace_member(p_workspace_id)
  group by ll.id
  order by ll.created_at asc;
$$;

-- ---------------------------------------------------------------------
-- Extend import_leads with an optional target list. Existing leads that
-- already belong to a list keep it (a re-import into a different section
-- never silently moves a lead you've already sorted) — only leads with
-- no list yet get tagged with p_list_id.
-- ---------------------------------------------------------------------
drop function if exists import_leads(uuid, jsonb);

create or replace function import_leads(
  p_workspace_id uuid,
  p_rows jsonb,
  p_list_id uuid default null
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

  if p_list_id is not null and not exists (
    select 1 from lead_lists where id = p_list_id and workspace_id = p_workspace_id
  ) then
    raise exception 'list does not belong to this workspace';
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
        website, email, notes, metadata_json, list_id
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
        coalesce(r->'metadata_json', '{}'::jsonb),
        p_list_id
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
        list_id = coalesce(leads.list_id, p_list_id),
        updated_at = now()
      where id = v_existing_id;
      v_updated := v_updated + 1;
    end if;
  end loop;

  return query select v_inserted, v_updated, v_skipped;
end;
$$;
