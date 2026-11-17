-- Ridzo — route recording while a mechanic is on a job (for live tracking, ETAs and disputes).
-- Run in Supabase AFTER 003_jobs_dispatch.sql. Safe to re-run.

create table if not exists public.job_location_points (
  id          bigint generated always as identity primary key,
  job_id      uuid not null references public.jobs(id) on delete cascade,
  mechanic_id uuid not null references public.users(id) on delete cascade,
  lat         double precision not null check (lat between 5.5 and 10.2),
  lng         double precision not null check (lng between 79.3 and 82.2),
  accuracy_m  double precision check (accuracy_m is null or accuracy_m >= 0),
  speed_mps   double precision check (speed_mps is null or speed_mps >= 0),
  heading     double precision check (heading is null or heading between 0 and 360),
  source      text not null default 'foreground' check (source in ('foreground', 'background')),
  recorded_at timestamptz not null,
  received_at timestamptz not null default now()
);
create index if not exists job_location_points_job_idx on public.job_location_points (job_id, recorded_at);

-- Only the API (service_role) can read or write it.
alter table public.job_location_points enable row level security;
