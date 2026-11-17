// Matching / dispatch: offers each job to ONE mechanic at a time.
//
//   1. Find approved, online (location in the last 5 min), free mechanics within range who do the job
//      (database pre-filter), then get the real road distance + traffic ETA from Google for them all
//      in one request. Fastest to arrive first, then best rated.   → repo.findCandidates + maps.routesTo
//   2. Offer it to the first one for 30 seconds.                    → repo.createOffer
//   3. Declined or timed out → offer it to the next one.            → decline() / tick()
//   4. A mechanic whose 30 s ran out can STILL accept while nobody else has taken the job.
//   5. Accept is atomic in the database: the first mechanic wins, everyone else's offer is withdrawn.
//   6. Nobody accepted within the search window → job becomes "no_mechanic" (the customer is told).
//
// tick() runs every couple of seconds from server.ts. It is safe to run on several servers at once:
// every step is a conditional update or a unique index in the database.
import type { Job, JobOffer, NewJob, Repo, User } from '../db/types.js';
import type { SmsProvider } from '../sms/index.js';
import { maskPhone } from '../sms/index.js';
import { MechanicBusyError } from '../db/types.js';
import { ApiError } from '../errors.js';
import { travelCharge } from './pricing.js';
import { createEstimateMaps, type Maps } from './maps.js';

export const OFFER_SECONDS = 30;
export const SEARCH_WINDOW_MS = 5 * 60 * 1000; // give up after 5 minutes without a mechanic
// No location for 5 minutes → offline. Background tracking (app minimised / screen locked) reports
// less often when the phone is standing still, so this is a little more forgiving than the 15 s heartbeat.
export const STALE_LOCATION_MS = 5 * 60 * 1000;
const CANDIDATES_PER_TRY = 5;
// A mechanic on the way to a customer with no location for this long → "tracking lost" alert.
export const TRACKING_LOST_MS = 10 * 60 * 1000;
const ALERT_CHECK_EVERY_MS = 30 * 1000; // no need to check every 2 s tick

const iso = (ms: number) => new Date(ms).toISOString();

export function createDispatcher(
  repo: Repo,
  log: (msg: string) => void = () => {},
  sms?: SmsProvider,
  maps: Maps = createEstimateMaps(),
) {
  let lastAlertCheck = 0;

  /** Text a mechanic. Best effort — never fails the action that triggered it. */
  const textMechanic = async (mechanicId: string, message: string) => {
    if (!sms) return false;
    const m = await repo.findUserById(mechanicId);
    if (!m) return false;
    try {
      await sms.send(m.phone, message);
      return true;
    } catch (e) {
      log(`[dispatch] could not SMS mechanic ${maskPhone(m.phone)}: ${(e as Error).message}`);
      return false;
    }
  };

  /**
   * Opens a "tracking lost" alert for every mechanic on the way to a customer who has sent no location
   * for 10 minutes, and closes alerts once the location is back (or the job has moved on).
   */
  async function checkTracking(now: number): Promise<{ opened: number; resolved: number }> {
    let opened = 0;
    let resolved = 0;
    const cutoff = now - TRACKING_LOST_MS;

    for (const job of await repo.listJobsByStatus(['accepted'], 500)) {
      if (!job.mechanicId) continue;
      const m = await repo.findUserById(job.mechanicId);
      const seen = m?.lastSeenAt ? new Date(m.lastSeenAt).getTime() : 0;
      // Give a freshly accepted job time to get going before judging it.
      const since = Math.max(seen, job.acceptedAt ? new Date(job.acceptedAt).getTime() : 0);
      if (since >= cutoff) continue;
      const alert = await repo.openAlert({
        jobId: job.id,
        mechanicId: job.mechanicId,
        kind: 'tracking_lost',
        lastLocationAt: m?.lastSeenAt ?? null,
      });
      if (alert) {
        opened += 1;
        log(`[alerts] job ${job.id.slice(0, 8)}: no location from mechanic ${job.mechanicId.slice(0, 8)} for 10+ min`);
        await textMechanic(
          job.mechanicId,
          `Ridzo: ${job.customerName.split(' ')[0]} can't see you on the map. Please open the Ridzo app so they know you're on the way.`,
        );
      }
    }

    for (const alert of await repo.listOpenAlerts()) {
      const job = await repo.findJob(alert.jobId);
      if (!job || job.status !== 'accepted' || job.mechanicId !== alert.mechanicId) {
        resolved += await repo.resolveAlerts(alert.jobId, 'job_moved_on');
        continue;
      }
      const m = await repo.findUserById(alert.mechanicId);
      if (m?.lastSeenAt && m.lastSeenAt > (alert.lastLocationAt ?? '') && new Date(m.lastSeenAt).getTime() >= cutoff) {
        resolved += await repo.resolveAlerts(alert.jobId, 'location_restored');
        log(`[alerts] job ${job.id.slice(0, 8)}: mechanic location is back`);
      }
    }
    return { opened, resolved };
  }

  /** Offers the job to the best available mechanic. Returns the offer, or null if nobody is free right now. */
  async function dispatch(job: Job): Promise<JobOffer | null> {
    if (job.status !== 'searching') return null;
    if (await repo.hasPendingOffer(job.id)) return null; // someone is already being asked

    const now = Date.now();
    const pricing = await repo.getPricing();
    const google = maps.provider === 'google';
    // With Google, pre-filter generously by straight-line distance (road factor 1) and let the real
    // road distance decide; without it, use the straight line × road factor estimate as before.
    const prefiltered = await repo.findCandidates({
      job,
      maxKm: pricing.maxRadiusKm,
      roadFactor: google ? 1 : pricing.roadFactor,
      seenAfter: iso(now - STALE_LOCATION_MS),
      limit: google ? CANDIDATES_PER_TRY * 2 : CANDIDATES_PER_TRY,
    });
    if (!prefiltered.length) return null;

    const users = await Promise.all(prefiltered.map((c) => repo.findUserById(c.mechanicId)));
    const located = prefiltered
      .map((c, i) => ({ c, u: users[i] }))
      .filter((x) => x.u && x.u.lastLat !== null && x.u.lastLng !== null);
    const routes = await maps.routesTo(
      located.map((x) => ({ lat: x.u!.lastLat!, lng: x.u!.lastLng! })),
      { lat: job.lat, lng: job.lng },
      pricing.roadFactor,
    );
    const ranked = located
      .map((x, i) => ({ ...x.c, route: routes[i] }))
      .filter((x) => x.route.km <= pricing.maxRadiusKm)
      // Who gets there first (traffic-aware with Google), then the better rating.
      .sort((a, b) => a.route.durationS - b.route.durationS || (b.rating ?? -1) - (a.rating ?? -1))
      .slice(0, CANDIDATES_PER_TRY);

    for (const c of ranked) {
      const offer = await repo.createOffer({
        jobId: job.id,
        mechanicId: c.mechanicId,
        distanceKm: c.route.km,
        durationS: c.route.durationS,
        distanceSource: c.route.source,
        // Quoted from the road distance now, locked in when the mechanic accepts.
        travelRs: travelCharge(c.route.km, pricing, new Date(now)).travelRs,
        expiresAt: iso(now + OFFER_SECONDS * 1000),
      });
      if (offer) {
        log(
          `[dispatch] job ${job.id.slice(0, 8)} offered to mechanic ${c.mechanicId.slice(0, 8)} (${c.route.km} km, ~${Math.round(c.route.durationS / 60)} min, ${c.route.source})`,
        );
        return offer;
      }
      // null = that mechanic just got another offer (race) — try the next one
    }
    return null;
  }

  return {
    dispatch,

    async createJob(input: Omit<NewJob, 'searchUntil'>): Promise<{ job: Job; offer: JobOffer | null }> {
      const job = await repo.createJob({ ...input, searchUntil: iso(Date.now() + SEARCH_WINDOW_MS) });
      return { job, offer: await dispatch(job) };
    },

    /** Runs every few seconds: time out offers, move on to the next mechanic, give up on old jobs, drop stale mechanics. */
    checkTracking,

    async tick(): Promise<{ expired: number; offered: number; gaveUp: number; wentOffline: number; alerts: { opened: number; resolved: number } }> {
      const now = Date.now();
      const expired = await repo.expireOffers(iso(now));
      const wentOffline = await repo.markStaleMechanicsOffline(iso(now - STALE_LOCATION_MS));

      let offered = 0;
      let gaveUp = 0;
      for (const job of await repo.listSearchingJobs(100)) {
        if (new Date(job.searchUntil).getTime() < now) {
          if (await repo.hasPendingOffer(job.id)) continue; // let the current mechanic answer first
          if (await repo.updateJob(job.id, ['searching'], { status: 'no_mechanic' })) {
            gaveUp += 1;
            log(`[dispatch] job ${job.id.slice(0, 8)}: no mechanic accepted`);
          }
          continue;
        }
        if (await dispatch(job)) offered += 1;
      }
      let alerts = { opened: 0, resolved: 0 };
      if (now - lastAlertCheck >= ALERT_CHECK_EVERY_MS) {
        lastAlertCheck = now;
        alerts = await checkTracking(now);
      }
      return { expired: expired.length, offered, gaveUp, wentOffline, alerts };
    },

    async accept(jobId: string, mechanic: User): Promise<Job> {
      if (mechanic.status !== 'approved') throw new ApiError(403, 'not_approved', 'Only approved mechanics can take jobs.');
      const offer = await repo.findOffer(jobId, mechanic.id);
      if (!offer) throw new ApiError(404, 'not_found', 'This job was not offered to you.');
      if (offer.status === 'accepted') {
        const job = await repo.findJob(jobId);
        if (job?.mechanicId === mechanic.id) return job; // tapped twice — same result
      }
      if (offer.status === 'declined') throw new ApiError(409, 'offer_closed', 'You declined this job.');

      const closed = async () => {
        const current = await repo.findJob(jobId);
        if (current?.status === 'no_mechanic' || current?.status === 'cancelled') {
          return new ApiError(409, 'job_closed', 'This request is no longer available.');
        }
        return new ApiError(409, 'job_taken', 'Another mechanic already took this job.');
      };
      if (offer.status === 'withdrawn') throw await closed();

      let job: Job | null;
      try {
        // The travel charge quoted in the offer is locked in here.
        job = await repo.acceptJob(jobId, mechanic.id, offer.distanceKm, offer.travelRs);
      } catch (e) {
        if (e instanceof MechanicBusyError) throw new ApiError(409, 'busy', 'Finish your current job before taking another.');
        throw e;
      }
      if (!job) throw await closed();
      if (offer.durationS !== null) job = (await repo.updateJob(job.id, ['accepted'], { etaS: offer.durationS })) ?? job;
      log(`[dispatch] job ${jobId.slice(0, 8)} accepted by ${mechanic.id.slice(0, 8)}${offer.status === 'expired' ? ' (after time-out)' : ''}`);
      return job;
    },

    async decline(jobId: string, mechanic: User): Promise<void> {
      const offer = await repo.findOffer(jobId, mechanic.id);
      if (!offer) throw new ApiError(404, 'not_found', 'This job was not offered to you.');
      await repo.updateOffer(offer.id, ['pending', 'expired'], 'declined');
      const job = await repo.findJob(jobId);
      if (job) await dispatch(job); // move on to the next mechanic straight away
    },

    /** The mechanic went offline: hand their pending offer to someone else now instead of waiting 30 s. */
    async releaseOffersOf(mechanicId: string): Promise<void> {
      const offer = await repo.currentOfferFor(mechanicId);
      if (offer?.status !== 'pending') return;
      if (await repo.updateOffer(offer.id, ['pending'], 'expired')) {
        const job = await repo.findJob(offer.jobId);
        if (job) await dispatch(job);
      }
    },

    /**
     * Customer (or Ridzo support) gives up on the assigned mechanic — e.g. they went dark — and wants
     * someone else. The job goes back to searching; the previous mechanic is never offered it again.
     */
    async rematch(job: Job, reason: string, adminId?: string): Promise<Job> {
      const previous = job.mechanicId;
      if (!previous) throw new ApiError(409, 'invalid_state', 'No mechanic is assigned to this job.');
      const reopened = await repo.updateJob(job.id, ['accepted', 'arrived'], {
        status: 'searching',
        mechanicId: null,
        acceptedAt: null,
        distanceKm: null,
        travelRs: null,
        searchUntil: iso(Date.now() + SEARCH_WINDOW_MS),
      });
      if (!reopened) throw new ApiError(409, 'invalid_state', 'The mechanic has already started this job.');
      const offer = await repo.findOffer(job.id, previous);
      if (offer) await repo.updateOffer(offer.id, ['accepted'], 'withdrawn');
      await repo.resolveAlerts(job.id, 'rematched', adminId);
      log(`[dispatch] job ${job.id.slice(0, 8)} re-matched away from ${previous.slice(0, 8)}: ${reason}`);
      await textMechanic(previous, `Ridzo: ${job.customerName.split(' ')[0]}'s request was given to another mechanic. You don't need to go.`);
      await dispatch(reopened);
      return reopened;
    },

    /** The customer (or support on their behalf) no longer needs help. */
    async cancelForCustomer(job: Job, reason: string, by: 'customer' | 'admin', adminId?: string): Promise<Job> {
      const cancelled = await repo.updateJob(job.id, ['searching', 'accepted', 'arrived'], {
        status: 'cancelled',
        cancelledBy: by,
        cancelReason: reason,
        cancelledAt: new Date().toISOString(),
      });
      if (!cancelled) throw new ApiError(409, 'invalid_state', 'This job can no longer be cancelled.');
      await repo.withdrawPendingOffers(job.id);
      await repo.resolveAlerts(job.id, 'cancelled', adminId);
      if (job.mechanicId) {
        await textMechanic(job.mechanicId, `Ridzo: ${job.customerName.split(' ')[0]} cancelled the request. You don't need to go.`);
      }
      return cancelled;
    },

    /** Mechanic can't make it after accepting: the job goes back to searching for someone else. */
    async cancelByMechanic(job: Job, mechanicId: string): Promise<Job> {
      const offer = await repo.findOffer(job.id, mechanicId);
      const reopened = await repo.updateJob(job.id, ['accepted', 'arrived'], {
        status: 'searching',
        mechanicId: null,
        acceptedAt: null,
        distanceKm: null,
        travelRs: null,
        searchUntil: iso(Date.now() + SEARCH_WINDOW_MS),
      });
      if (!reopened) throw new ApiError(409, 'invalid_state', "This job can't be cancelled now.");
      // Counts against the mechanic's acceptance rate, and they won't be offered it again.
      if (offer) await repo.updateOffer(offer.id, ['accepted'], 'declined');
      await repo.resolveAlerts(job.id, 'job_moved_on');
      await dispatch(reopened);
      return reopened;
    },
  };
}

export type Dispatcher = ReturnType<typeof createDispatcher>;
