-- Ridzo — jobs, one-at-a-time dispatch, live location, dashboard, avatars.
-- Run in Supabase AFTER 002_admin_pricing.sql: SQL Editor → New query → paste → Run. Safe to re-run.

-- ─── Users: avatar + fast "who is near here" lookups ────────────────────────
alter table public.users add column if not exists avatar_path text;
-- Bounding-box index: the dispatcher first narrows to a lat/lng square around the
-- breakdown, then measures exact distance. Plenty fast for Sri Lanka-sized data;
-- switch to PostGIS (ST_DWithin) if it ever isn't.
create index if not exists users_online_location_idx on public.users (last_lat, last_lng) where is_online;

-- ─── Jobs (one customer request) ────────────────────────────────────────────
create table if not exists public.jobs (
  id               uuid primary key default gen_random_uuid(),
  status           text not null default 'searching' check (status in (
                     'searching',      -- looking for a mechanic
                     'accepted',       -- a mechanic is on the way
                     'arrived', 'in_progress', 'bill_sent',
                     'completed',
                     'no_mechanic',    -- nobody accepted in time
                     'cancelled')),    -- by the customer
  customer_name    text not null check (char_length(customer_name) between 2 and 60),
  customer_phone   text not null check (customer_phone ~ '^\+947[0-9]{8}$'),
  vehicle          text not null check (char_length(vehicle) between 2 and 60),
  vehicle_type     text not null check (char_length(vehicle_type) between 2 and 30),
  issue_summary    text not null check (char_length(issue_summary) between 3 and 140),
  issue_category   text not null check (issue_category in ('tyre', 'battery', 'engine', 'lockout', 'other')),
  service_keys     text[] not null default '{}',
  lat              double precision not null check (lat between 5.5 and 10.2),
  lng              double precision not null check (lng between 79.3 and 82.2),
  address          text not null check (char_length(address) between 2 and 200),
  payment_method   text not null check (payment_method in ('card', 'cash')),
  estimate_rs      int not null default 0,
  mechanic_id      uuid references public.users(id),
  distance_km      double precision,          -- locked when accepted
  travel_rs        int,                       -- locked when accepted
  diagnosis_note   text check (diagnosis_note is null or char_length(diagnosis_note) <= 500),
  bill             jsonb,
  total_rs         int,
  commission_rs    int,
  payout_rs        int,
  paid_by          text check (paid_by is null or paid_by in ('card', 'cash')),
  mechanic_rating  smallint check (mechanic_rating between 1 and 5),  -- customer rates mechanic
  customer_rating  smallint check (customer_rating between 1 and 5),  -- mechanic rates customer
  search_until     timestamptz not null,
  created_at       timestamptz not null default now(),
  accepted_at      timestamptz,
  arrived_at       timestamptz,
  completed_at     timestamptz,
  updated_at       timestamptz not null default now()
);

drop trigger if exists jobs_touch on public.jobs;
create trigger jobs_touch before update on public.jobs
  for each row execute function public.touch_updated_at();

create index if not exists jobs_searching_idx on public.jobs (created_at) where status = 'searching';
create index if not exists jobs_mechanic_completed_idx on public.jobs (mechanic_id, completed_at) where status = 'completed';
-- A mechanic can only ever have ONE active job, even if two accepts race.
create unique index if not exists jobs_one_active_per_mechanic on public.jobs (mechanic_id)
  where status in ('accepted', 'arrived', 'in_progress', 'bill_sent');

-- ─── Offers (one job offered to one mechanic, 30 s to answer) ───────────────
create table if not exists public.job_offers (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.jobs(id) on delete cascade,
  mechanic_id  uuid not null references public.users(id) on delete cascade,
  status       text not null default 'pending'
                 check (status in ('pending', 'accepted', 'declined', 'expired', 'withdrawn')),
  distance_km  double precision not null,
  travel_rs    int not null,
  offered_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  responded_at timestamptz,
  unique (job_id, mechanic_id)               -- never offer the same job to the same mechanic twice
);
-- Only one mechanic is asked at a time per job, and a mechanic only sees one new offer at a time.
create unique index if not exists job_offers_one_pending_per_job on public.job_offers (job_id) where status = 'pending';
create unique index if not exists job_offers_one_pending_per_mechanic on public.job_offers (mechanic_id) where status = 'pending';
create index if not exists job_offers_pending_expiry_idx on public.job_offers (expires_at) where status = 'pending';
create index if not exists job_offers_mechanic_idx on public.job_offers (mechanic_id, offered_at desc);

-- ─── Distance helper (km, straight line) ────────────────────────────────────
create or replace function public.km_between(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- ─── Who can get this job? ──────────────────────────────────────────────────
-- Approved + online + recent GPS + free + not already asked + within range + offers the service.
-- Nearest (by road estimate) first, then best rated.
create or replace function public.dispatch_candidates(
  p_job_id uuid, p_lat double precision, p_lng double precision,
  p_max_km double precision, p_road_factor double precision,
  p_category text, p_service_keys text[], p_seen_after timestamptz, p_limit int
) returns table (mechanic_id uuid, road_km double precision, rating double precision)
language sql stable as $$
  with box as (
    select p_max_km / p_road_factor / 111.0 as dlat,
           p_max_km / p_road_factor / (111.0 * cos(radians(p_lat))) as dlng
  ),
  near as (
    select u.id,
           round((public.km_between(p_lat, p_lng, u.last_lat, u.last_lng) * p_road_factor)::numeric, 1)::double precision as road_km
      from public.users u cross join box
     where u.is_online and u.status = 'approved' and u.last_seen_at >= p_seen_after
       and u.last_lat between p_lat - box.dlat and p_lat + box.dlat
       and u.last_lng between p_lng - box.dlng and p_lng + box.dlng
  )
  select n.id, n.road_km,
         (select avg(j.mechanic_rating)::double precision from public.jobs j
           where j.mechanic_id = n.id and j.mechanic_rating is not null) as rating
    from near n
   where n.road_km <= p_max_km
     and not exists (select 1 from public.jobs j where j.mechanic_id = n.id
                      and j.status in ('accepted', 'arrived', 'in_progress', 'bill_sent'))
     and not exists (select 1 from public.job_offers o where o.mechanic_id = n.id and o.status = 'pending')
     and not exists (select 1 from public.job_offers o where o.mechanic_id = n.id and o.job_id = p_job_id)
     and (
       case
         when cardinality(p_service_keys) > 0 then not exists (
           select 1 from unnest(p_service_keys) k
            where k not in (select ms.service_key from public.mechanic_services ms where ms.user_id = n.id))
         when p_category = 'other' then exists (select 1 from public.mechanic_services ms where ms.user_id = n.id)
         else exists (select 1 from public.mechanic_services ms
                        join public.service_catalog c on c.key = ms.service_key
                       where ms.user_id = n.id and c.category = p_category and c.active)
       end
     )
   order by n.road_km asc, rating desc nulls last
   limit p_limit;
$$;

-- ─── Accept a job: first mechanic wins, everyone else loses ─────────────────
-- Works for a pending offer AND for an offer whose 30 s ran out, as long as the
-- job is still searching. Returns no row if the job was already taken / closed.
create or replace function public.accept_job(
  p_job_id uuid, p_mechanic_id uuid, p_distance_km double precision, p_travel_rs int
) returns setof public.jobs
language plpgsql as $$
declare
  j public.jobs;
begin
  update public.jobs
     set status = 'accepted', mechanic_id = p_mechanic_id, accepted_at = now(),
         distance_km = p_distance_km, travel_rs = p_travel_rs
   where id = p_job_id and status = 'searching'
  returning * into j;
  if not found then
    return;
  end if;

  update public.job_offers set status = 'accepted', responded_at = now()
   where job_id = p_job_id and mechanic_id = p_mechanic_id;
  -- Someone else may be looking at this job right now — take it back from them.
  update public.job_offers set status = 'withdrawn', responded_at = now()
   where job_id = p_job_id and mechanic_id <> p_mechanic_id and status = 'pending';

  return next j;
end $$;

-- ─── Security ───────────────────────────────────────────────────────────────
alter table public.jobs       enable row level security;
alter table public.job_offers enable row level security;

revoke execute on function public.km_between(double precision, double precision, double precision, double precision) from public, anon, authenticated;
revoke execute on function public.dispatch_candidates(uuid, double precision, double precision, double precision, double precision, text, text[], timestamptz, int) from public, anon, authenticated;
revoke execute on function public.accept_job(uuid, uuid, double precision, int) from public, anon, authenticated;
