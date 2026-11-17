-- Ridzo — "mechanic went dark" alerts, customer re-match and cancellation details.
-- Run in Supabase AFTER 004_location_tracking.sql. Safe to re-run.

-- Who cancelled a job and why.
alter table public.jobs add column if not exists cancelled_by  text check (cancelled_by is null or cancelled_by in ('customer', 'admin'));
alter table public.jobs add column if not exists cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 200);
alter table public.jobs add column if not exists cancelled_at  timestamptz;

-- One row per incident, e.g. "no location from the mechanic for 10 minutes while on the way".
create table if not exists public.job_alerts (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs(id) on delete cascade,
  mechanic_id uuid not null references public.users(id) on delete cascade,
  kind        text not null check (kind in ('tracking_lost')),
  last_location_at timestamptz,                 -- the mechanic's last location when the alert opened
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolution  text check (resolution is null or resolution in (
                'location_restored',  -- the mechanic came back
                'rematched',          -- customer or support found another mechanic
                'cancelled',          -- the customer cancelled
                'job_moved_on',       -- the mechanic arrived / finished
                'dismissed')),        -- support checked and closed it
  resolved_by uuid references public.admins(id)
);
-- Only one open alert of each kind per job.
create unique index if not exists job_alerts_one_open on public.job_alerts (job_id, kind) where resolved_at is null;
create index if not exists job_alerts_open_idx on public.job_alerts (created_at) where resolved_at is null;

alter table public.job_alerts enable row level security;
