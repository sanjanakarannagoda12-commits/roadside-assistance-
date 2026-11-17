-- Ridzo — initial schema for mechanic auth + onboarding.
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste this file → Run.
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE).

create extension if not exists pgcrypto;

-- ─── Users ──────────────────────────────────────────────────────────────────
create table if not exists public.users (
  id               uuid primary key default gen_random_uuid(),
  phone            text not null unique check (phone ~ '^\+947[0-9]{8}$'),
  role             text not null default 'mechanic' check (role in ('mechanic', 'customer', 'admin')),
  status           text not null default 'onboarding'
                     check (status in ('onboarding', 'pending_review', 'approved', 'rejected')),
  full_name        text check (full_name is null or char_length(full_name) between 3 and 60),
  email            text check (email is null or char_length(email) <= 120),
  service_area     text,
  rejection_reason text,
  submitted_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists users_touch on public.users;
create trigger users_touch before update on public.users
  for each row execute function public.touch_updated_at();

-- ─── OTP codes (only a hash of the code is stored) ──────────────────────────
create table if not exists public.otp_codes (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    int not null default 0,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists otp_codes_phone_created_idx on public.otp_codes (phone, created_at desc);

create or replace function public.increment_otp_attempts(otp_id uuid) returns void
language sql as $$
  update public.otp_codes set attempts = attempts + 1 where id = otp_id;
$$;

-- ─── Sessions (refresh tokens, stored hashed) ───────────────────────────────
create table if not exists public.sessions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.users(id) on delete cascade,
  refresh_token_hash text not null unique,
  expires_at         timestamptz not null,
  revoked_at         timestamptz,
  created_at         timestamptz not null default now()
);
create index if not exists sessions_user_idx on public.sessions (user_id);

-- ─── Onboarding: verification documents ─────────────────────────────────────
create table if not exists public.mechanic_documents (
  user_id      uuid not null references public.users(id) on delete cascade,
  doc_type     text not null check (doc_type in ('nic', 'license', 'certificate', 'toolkit')),
  storage_path text not null,
  mime_type    text not null,
  size_bytes   int not null check (size_bytes > 0 and size_bytes <= 5242880),
  status       text not null default 'uploaded' check (status in ('uploaded', 'approved', 'rejected')),
  uploaded_at  timestamptz not null default now(),
  primary key (user_id, doc_type)
);

-- ─── Onboarding: services & prices the mechanic offers ──────────────────────
create table if not exists public.mechanic_services (
  user_id     uuid not null references public.users(id) on delete cascade,
  service_key text not null,
  price_rs    int not null check (price_rs between 200 and 100000),
  primary key (user_id, service_key)
);

-- Replace a mechanic's whole price list in one transaction.
create or replace function public.replace_mechanic_services(p_user_id uuid, p_services jsonb) returns void
language plpgsql as $$
begin
  delete from public.mechanic_services where user_id = p_user_id;
  insert into public.mechanic_services (user_id, service_key, price_rs)
  select p_user_id, s->>'service_key', (s->>'price_rs')::int
  from jsonb_array_elements(p_services) as s;
end $$;

-- ─── Security ───────────────────────────────────────────────────────────────
-- The mobile app never talks to Supabase directly — only the Node.js API does,
-- using the service-role key (which bypasses RLS). Enabling RLS with no policies
-- blocks the public anon key from reading or writing any of these tables.
alter table public.users              enable row level security;
alter table public.otp_codes          enable row level security;
alter table public.sessions           enable row level security;
alter table public.mechanic_documents enable row level security;
alter table public.mechanic_services  enable row level security;

revoke execute on function public.increment_otp_attempts(uuid) from public, anon, authenticated;
revoke execute on function public.replace_mechanic_services(uuid, jsonb) from public, anon, authenticated;

-- ─── Storage: private bucket for verification documents ─────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mechanic-documents', 'mechanic-documents', false, 5242880,
  array['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do nothing;
