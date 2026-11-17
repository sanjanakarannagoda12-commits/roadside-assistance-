-- Ridzo — job photos (before / after) and real road distance + ETA on offers.
-- Run in Supabase AFTER 005_job_alerts.sql. Safe to re-run.

-- ─── Job photos ─────────────────────────────────────────────────────────────
-- Files live in the private storage bucket under jobs/<job id>/...; only the API can read them.
create table if not exists public.job_photos (
  job_id       uuid not null references public.jobs(id) on delete cascade,
  kind         text not null check (kind in ('before', 'after')),
  storage_path text not null,
  mime_type    text not null check (mime_type in ('image/jpeg', 'image/png')),
  size_bytes   int  not null check (size_bytes > 0 and size_bytes <= 5242880),
  uploaded_by  uuid not null references public.users(id),
  uploaded_at  timestamptz not null default now(),
  primary key (job_id, kind)            -- re-taking a photo replaces it
);
alter table public.job_photos enable row level security;

-- ─── Offers: where the distance came from ───────────────────────────────────
-- distance_source = 'google' (Routes API road distance) or 'estimate' (straight line × road factor).
alter table public.job_offers add column if not exists duration_s      int check (duration_s is null or duration_s >= 0);
alter table public.job_offers add column if not exists distance_source text not null default 'estimate'
  check (distance_source in ('google', 'estimate'));

-- The job keeps the ETA quoted when it was accepted.
alter table public.jobs add column if not exists eta_s int check (eta_s is null or eta_s >= 0);
