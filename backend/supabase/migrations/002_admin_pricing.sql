-- Ridzo — admin review, Ridzo-set pricing, per-document status, online status.
-- Run once in Supabase AFTER 001_init.sql: SQL Editor → New query → paste this file → Run.
-- Safe to re-run.

-- ─── Users: suspended status, review time, online status ────────────────────
alter table public.users drop constraint if exists users_status_check;
alter table public.users add constraint users_status_check
  check (status in ('onboarding', 'pending_review', 'approved', 'rejected', 'suspended'));

alter table public.users add column if not exists reviewed_at  timestamptz;
alter table public.users add column if not exists is_online    boolean not null default false;
alter table public.users add column if not exists last_lat     double precision check (last_lat between -90 and 90);
alter table public.users add column if not exists last_lng     double precision check (last_lng between -180 and 180);
alter table public.users add column if not exists last_seen_at timestamptz;

-- Only approved mechanics can ever be online, even if a bug in the API tried otherwise.
alter table public.users drop constraint if exists users_online_only_if_approved;
alter table public.users add constraint users_online_only_if_approved
  check (not is_online or status = 'approved');

create index if not exists users_status_submitted_idx on public.users (status, submitted_at);

-- ─── Documents: each one is approved or rejected with its own reason ────────
alter table public.mechanic_documents add column if not exists rejection_reason text
  check (rejection_reason is null or char_length(rejection_reason) <= 200);
alter table public.mechanic_documents add column if not exists reviewed_at timestamptz;

-- ─── Ridzo's price list (admins edit it; mechanics no longer set prices) ────
create table if not exists public.service_catalog (
  key            text primary key check (key ~ '^[a-z0-9_]{2,40}$'),
  category       text not null check (category in ('tyre', 'battery', 'engine', 'lockout')),
  name           text not null check (char_length(name) between 2 and 60),
  duration_label text not null check (char_length(duration_label) between 1 and 30),
  price_rs       int  not null check (price_rs between 200 and 100000),
  active         boolean not null default true,
  sort_order     int not null default 0,
  updated_at     timestamptz not null default now()
);

drop trigger if exists service_catalog_touch on public.service_catalog;
create trigger service_catalog_touch before update on public.service_catalog
  for each row execute function public.touch_updated_at();

insert into public.service_catalog (key, category, name, duration_label, price_rs, sort_order) values
  ('tyre_change',       'tyre',    'Tyre change',                   '10–20 mins', 4000,  10),
  ('puncture_repair',   'tyre',    'Puncture repair',               '20–30 mins', 2500,  20),
  ('wheel_alignment',   'tyre',    'Wheel alignment',               '1–2 hrs',    10000, 30),
  ('battery_jump',      'battery', 'Battery jump start',            '30–40 mins', 5000,  40),
  ('battery_fit',       'battery', 'Battery replacement (fitting)', '20–30 mins', 3000,  50),
  ('engine_diagnosis',  'engine',  'Engine diagnosis',              '30–60 mins', 6000,  60),
  ('overheating_check', 'engine',  'Overheating check',             '20–40 mins', 3500,  70),
  ('lockout',           'lockout', 'Lockout assistance',            '20–40 mins', 7500,  80)
on conflict (key) do nothing;

-- Mechanics now only choose WHICH services they do; the price comes from service_catalog.
alter table public.mechanic_services drop column if exists price_rs;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'mechanic_services_service_key_fkey') then
    alter table public.mechanic_services
      add constraint mechanic_services_service_key_fkey
      foreign key (service_key) references public.service_catalog(key) on update cascade;
  end if;
end $$;

drop function if exists public.replace_mechanic_services(uuid, jsonb);
create or replace function public.replace_mechanic_services(p_user_id uuid, p_service_keys text[]) returns void
language plpgsql as $$
begin
  delete from public.mechanic_services where user_id = p_user_id;
  insert into public.mechanic_services (user_id, service_key)
  select p_user_id, k from unnest(p_service_keys) as k;
end $$;

-- ─── Pricing settings: travel charge formula + commission (single row) ──────
create table if not exists public.pricing_config (
  id                   int primary key default 1 check (id = 1),
  travel_base_rs       int not null default 500  check (travel_base_rs between 0 and 10000),
  travel_base_km       double precision not null default 3 check (travel_base_km between 0 and 50),
  travel_per_km_rs     int not null default 80   check (travel_per_km_rs between 0 and 1000),
  travel_cap_rs        int not null default 3000 check (travel_cap_rs between 0 and 50000),
  night_multiplier     double precision not null default 1.25 check (night_multiplier between 1 and 3),
  night_start_hour     int not null default 22 check (night_start_hour between 0 and 23),
  night_end_hour       int not null default 6  check (night_end_hour between 0 and 23),
  road_factor          double precision not null default 1.3 check (road_factor between 1 and 3),
  max_radius_km        double precision not null default 15 check (max_radius_km between 1 and 100),
  commission_rate      double precision not null default 0.10 check (commission_rate between 0 and 0.5),
  commission_on_travel boolean not null default false,
  updated_at           timestamptz not null default now()
);
insert into public.pricing_config (id) values (1) on conflict (id) do nothing;

drop trigger if exists pricing_config_touch on public.pricing_config;
create trigger pricing_config_touch before update on public.pricing_config
  for each row execute function public.touch_updated_at();

-- ─── Admins (email + password, used by the admin web app) ───────────────────
create table if not exists public.admins (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique check (email = lower(email) and char_length(email) <= 120),
  full_name     text not null check (char_length(full_name) between 2 and 60),
  password_hash text not null,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);

-- ─── Audit log: who approved / rejected / suspended / changed prices ────────
create table if not exists public.admin_audit_log (
  id             uuid primary key default gen_random_uuid(),
  admin_id       uuid not null references public.admins(id),
  action         text not null,
  target_user_id uuid references public.users(id) on delete set null,
  detail         jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists admin_audit_target_idx on public.admin_audit_log (target_user_id, created_at desc);

-- ─── Review a mechanic in ONE transaction ───────────────────────────────────
-- Only works while the mechanic is still pending_review, so two admins can't
-- review the same person at the same time. Returns no row if it wasn't pending.
create or replace function public.admin_review_mechanic(
  p_user_id uuid, p_admin_id uuid, p_documents jsonb, p_status text, p_reason text
) returns setof public.users
language plpgsql as $$
declare
  u public.users;
begin
  update public.users
     set status = p_status, rejection_reason = p_reason, reviewed_at = now()
   where id = p_user_id and status = 'pending_review'
  returning * into u;
  if not found then
    return;
  end if;

  update public.mechanic_documents d
     set status = x.status, rejection_reason = x.reason, reviewed_at = now()
    from jsonb_to_recordset(p_documents) as x(doc_type text, status text, reason text)
   where d.user_id = p_user_id and d.doc_type = x.doc_type;

  insert into public.admin_audit_log (admin_id, action, target_user_id, detail)
  values (
    p_admin_id,
    case when p_status = 'approved' then 'mechanic.approve' else 'mechanic.reject' end,
    p_user_id,
    jsonb_build_object('documents', p_documents, 'reason', p_reason)
  );

  return next u;
end $$;

-- ─── Security (same rule as 001: only the API's service_role key gets in) ───
alter table public.service_catalog enable row level security;
alter table public.pricing_config  enable row level security;
alter table public.admins          enable row level security;
alter table public.admin_audit_log enable row level security;

revoke execute on function public.replace_mechanic_services(uuid, text[]) from public, anon, authenticated;
revoke execute on function public.admin_review_mechanic(uuid, uuid, jsonb, text, text) from public, anon, authenticated;
