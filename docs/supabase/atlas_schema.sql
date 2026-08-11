-- Atlas simplified schema for Layla Hub
-- Run once in Layla Hub > SQL Editor.

create schema if not exists private;

create table if not exists public.atlas_trips (
  id text primary key,
  name text not null,
  start_date date,
  end_date date,
  time_zone text not null default 'Europe/Istanbul',
  home_time_zone text not null default 'Asia/Seoul',
  drive_links jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.atlas_trip_members (
  trip_id text not null references public.atlas_trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','viewer')),
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);
create index if not exists atlas_trip_members_user_idx on public.atlas_trip_members(user_id);

create table if not exists public.atlas_trip_state (
  trip_id text primary key references public.atlas_trips(id) on delete cascade,
  current_city text not null default '',
  current_lat double precision,
  current_lng double precision,
  updated_at timestamptz not null default now()
);

create table if not exists public.atlas_schedule (
  id uuid primary key default gen_random_uuid(),
  trip_id text not null references public.atlas_trips(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  schedule_type text not null default 'etc',
  title text not null,
  start_at timestamp without time zone not null,
  end_at timestamp without time zone,
  location text not null default '',
  details jsonb not null default '{}'::jsonb,
  source text not null default 'manual_schedule',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists atlas_schedule_trip_start_idx on public.atlas_schedule(trip_id,start_at);

-- Private schedule fields are split from the viewer-readable schedule table.
create table if not exists public.atlas_schedule_private (
  schedule_id uuid primary key references public.atlas_schedule(id) on delete cascade,
  confirmation_number text not null default '',
  notes text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.atlas_places (
  id uuid primary key default gen_random_uuid(),
  trip_id text not null references public.atlas_trips(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  title text not null,
  address text not null default '',
  category text not null default '장소',
  lat double precision not null,
  lng double precision not null,
  google_place_id text not null default '',
  source text not null default 'Atlas Map',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists atlas_places_trip_idx on public.atlas_places(trip_id);

create table if not exists public.atlas_notes (
  id uuid primary key default gen_random_uuid(),
  trip_id text not null references public.atlas_trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  note_key text not null default 'dashboard',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(trip_id,user_id,note_key)
);

create table if not exists public.atlas_packing_items (
  id uuid primary key default gen_random_uuid(),
  trip_id text not null references public.atlas_trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null default '기타',
  item text not null,
  quantity integer not null default 1 check (quantity > 0),
  is_checked boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists atlas_packing_trip_idx on public.atlas_packing_items(trip_id);

create table if not exists public.atlas_expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id text not null references public.atlas_trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  spent_at date not null,
  category text not null default '기타',
  merchant text not null default '',
  memo text not null default '',
  original_amount numeric(14,2) not null check (original_amount >= 0),
  currency text not null default 'KRW',
  exchange_rate_to_krw numeric(18,6) not null default 1 check (exchange_rate_to_krw > 0),
  krw_amount bigint not null default 0 check (krw_amount >= 0),
  payment_method text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists atlas_expenses_trip_date_idx on public.atlas_expenses(trip_id,spent_at);

create table if not exists public.atlas_documents (
  id uuid primary key default gen_random_uuid(),
  trip_id text not null references public.atlas_trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null default 'document',
  title text not null,
  drive_url text not null,
  created_at timestamptz not null default now()
);

create or replace function private.atlas_has_trip_role(p_trip_id text, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.atlas_trip_members m
    where m.trip_id = p_trip_id
      and m.user_id = (select auth.uid())
      and m.role = any(p_roles)
  );
$$;
revoke all on function private.atlas_has_trip_role(text,text[]) from public;
grant execute on function private.atlas_has_trip_role(text,text[]) to authenticated;

alter table public.atlas_trips enable row level security;
alter table public.atlas_trip_members enable row level security;
alter table public.atlas_trip_state enable row level security;
alter table public.atlas_schedule enable row level security;
alter table public.atlas_schedule_private enable row level security;
alter table public.atlas_places enable row level security;
alter table public.atlas_notes enable row level security;
alter table public.atlas_packing_items enable row level security;
alter table public.atlas_expenses enable row level security;
alter table public.atlas_documents enable row level security;

-- Re-runnable policy setup.
do $$ declare r record; begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname='public' and tablename like 'atlas_%'
  loop execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename); end loop;
end $$;

create policy atlas_members_read_self on public.atlas_trip_members for select to authenticated
using ((select auth.uid()) = user_id);
create policy atlas_members_owner_insert on public.atlas_trip_members for insert to authenticated
with check ((select private.atlas_has_trip_role(trip_id, array['owner'])));
create policy atlas_members_owner_update on public.atlas_trip_members for update to authenticated
using ((select private.atlas_has_trip_role(trip_id, array['owner'])))
with check ((select private.atlas_has_trip_role(trip_id, array['owner'])));
create policy atlas_members_owner_delete on public.atlas_trip_members for delete to authenticated
using ((select private.atlas_has_trip_role(trip_id, array['owner'])));

create policy atlas_trips_member_read on public.atlas_trips for select to authenticated
using ((select private.atlas_has_trip_role(id, array['owner','viewer'])));
create policy atlas_trips_owner_write on public.atlas_trips for update to authenticated
using ((select private.atlas_has_trip_role(id, array['owner'])))
with check ((select private.atlas_has_trip_role(id, array['owner'])));

create policy atlas_state_member_read on public.atlas_trip_state for select to authenticated
using ((select private.atlas_has_trip_role(trip_id, array['owner','viewer'])));
create policy atlas_state_owner_insert on public.atlas_trip_state for insert to authenticated
with check ((select private.atlas_has_trip_role(trip_id, array['owner'])));
create policy atlas_state_owner_update on public.atlas_trip_state for update to authenticated
using ((select private.atlas_has_trip_role(trip_id, array['owner'])))
with check ((select private.atlas_has_trip_role(trip_id, array['owner'])));

create policy atlas_schedule_member_read on public.atlas_schedule for select to authenticated
using ((select private.atlas_has_trip_role(trip_id, array['owner','viewer'])));
create policy atlas_schedule_owner_insert on public.atlas_schedule for insert to authenticated
with check ((select private.atlas_has_trip_role(trip_id, array['owner'])));
create policy atlas_schedule_owner_update on public.atlas_schedule for update to authenticated
using ((select private.atlas_has_trip_role(trip_id, array['owner'])))
with check ((select private.atlas_has_trip_role(trip_id, array['owner'])));
create policy atlas_schedule_owner_delete on public.atlas_schedule for delete to authenticated
using ((select private.atlas_has_trip_role(trip_id, array['owner'])));

create policy atlas_schedule_private_owner_read on public.atlas_schedule_private for select to authenticated
using (exists (select 1 from public.atlas_schedule s where s.id=schedule_id and (select private.atlas_has_trip_role(s.trip_id,array['owner']))));
create policy atlas_schedule_private_owner_insert on public.atlas_schedule_private for insert to authenticated
with check (exists (select 1 from public.atlas_schedule s where s.id=schedule_id and (select private.atlas_has_trip_role(s.trip_id,array['owner']))));
create policy atlas_schedule_private_owner_update on public.atlas_schedule_private for update to authenticated
using (exists (select 1 from public.atlas_schedule s where s.id=schedule_id and (select private.atlas_has_trip_role(s.trip_id,array['owner']))))
with check (exists (select 1 from public.atlas_schedule s where s.id=schedule_id and (select private.atlas_has_trip_role(s.trip_id,array['owner']))));
create policy atlas_schedule_private_owner_delete on public.atlas_schedule_private for delete to authenticated
using (exists (select 1 from public.atlas_schedule s where s.id=schedule_id and (select private.atlas_has_trip_role(s.trip_id,array['owner']))));

create policy atlas_places_member_read on public.atlas_places for select to authenticated
using ((select private.atlas_has_trip_role(trip_id, array['owner','viewer'])));
create policy atlas_places_owner_insert on public.atlas_places for insert to authenticated
with check ((select private.atlas_has_trip_role(trip_id, array['owner'])));
create policy atlas_places_owner_update on public.atlas_places for update to authenticated
using ((select private.atlas_has_trip_role(trip_id, array['owner']))) with check ((select private.atlas_has_trip_role(trip_id, array['owner'])));
create policy atlas_places_owner_delete on public.atlas_places for delete to authenticated
using ((select private.atlas_has_trip_role(trip_id, array['owner'])));

-- Owner-only tables.
create policy atlas_notes_owner_all on public.atlas_notes for all to authenticated
using ((select private.atlas_has_trip_role(trip_id,array['owner'])) and user_id=(select auth.uid()))
with check ((select private.atlas_has_trip_role(trip_id,array['owner'])) and user_id=(select auth.uid()));
create policy atlas_packing_owner_all on public.atlas_packing_items for all to authenticated
using ((select private.atlas_has_trip_role(trip_id,array['owner'])) and user_id=(select auth.uid()))
with check ((select private.atlas_has_trip_role(trip_id,array['owner'])) and user_id=(select auth.uid()));
create policy atlas_expenses_owner_all on public.atlas_expenses for all to authenticated
using ((select private.atlas_has_trip_role(trip_id,array['owner'])) and user_id=(select auth.uid()))
with check ((select private.atlas_has_trip_role(trip_id,array['owner'])) and user_id=(select auth.uid()));
create policy atlas_documents_owner_all on public.atlas_documents for all to authenticated
using ((select private.atlas_has_trip_role(trip_id,array['owner'])) and user_id=(select auth.uid()))
with check ((select private.atlas_has_trip_role(trip_id,array['owner'])) and user_id=(select auth.uid()));

grant select on public.atlas_trips, public.atlas_trip_members, public.atlas_trip_state, public.atlas_schedule, public.atlas_schedule_private, public.atlas_places, public.atlas_notes, public.atlas_packing_items, public.atlas_expenses, public.atlas_documents to authenticated;
grant insert, update, delete on public.atlas_trip_members, public.atlas_trip_state, public.atlas_schedule, public.atlas_schedule_private, public.atlas_places, public.atlas_notes, public.atlas_packing_items, public.atlas_expenses, public.atlas_documents to authenticated;
grant update on public.atlas_trips to authenticated;

insert into public.atlas_trips (id,name,start_date,end_date,time_zone,home_time_zone)
values ('trip_turkiye_2026','Türkiye 2026','2026-09-23','2026-10-02','Europe/Istanbul','Asia/Seoul')
on conflict (id) do update set name=excluded.name,start_date=excluded.start_date,end_date=excluded.end_date,time_zone=excluded.time_zone,home_time_zone=excluded.home_time_zone;

-- IMPORTANT: after running this file, add your Layla Hub user as Owner.
-- Replace YOUR_OWNER_UUID with Authentication > Users > your UUID, then run:
-- insert into public.atlas_trip_members (trip_id,user_id,role)
-- values ('trip_turkiye_2026','YOUR_OWNER_UUID','owner')
-- on conflict (trip_id,user_id) do update set role='owner';
--
-- Viewer example (after that person has logged in once and has an Auth UUID):
-- insert into public.atlas_trip_members (trip_id,user_id,role)
-- values ('trip_turkiye_2026','VIEWER_UUID','viewer')
-- on conflict (trip_id,user_id) do update set role='viewer';
