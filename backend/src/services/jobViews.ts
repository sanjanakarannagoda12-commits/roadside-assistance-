// What the mechanic app sees for offers and jobs.
// Before accepting, the customer's phone number is hidden; only their first name is shown.
import type { Job, JobOffer, JobPhoto } from '../db/types.js';

/** Rough city driving speed, used when Google Maps didn't give a driving time. */
const AVG_KMH = 25;
export const etaMinutes = (km: number) => Math.max(3, Math.round((km / AVG_KMH) * 60));
const etaFrom = (durationS: number | null, km: number) => (durationS !== null ? Math.max(1, Math.ceil(durationS / 60)) : etaMinutes(km));

const firstName = (full: string) => {
  const [first, last] = full.trim().split(/\s+/);
  return last ? `${first} ${last[0]}.` : first;
};

export function offerView(offer: JobOffer, job: Job) {
  const secondsLeft = Math.max(0, Math.ceil((new Date(offer.expiresAt).getTime() - Date.now()) / 1000));
  return {
    offerId: offer.id,
    jobId: job.id,
    // pending = within the 30 s; missed = time ran out but the job is still open, so it can still be accepted
    state: offer.status === 'pending' && secondsLeft > 0 ? ('pending' as const) : ('missed' as const),
    secondsLeft,
    expiresAt: offer.expiresAt,
    customerName: firstName(job.customerName),
    vehicle: job.vehicle,
    vehicleType: job.vehicleType,
    issueSummary: job.issueSummary,
    issueCategory: job.issueCategory,
    paymentMethod: job.paymentMethod,
    distanceKm: offer.distanceKm,
    etaMin: etaFrom(offer.durationS, offer.distanceKm),
    distanceSource: offer.distanceSource, // 'google' = real road distance, 'estimate' = approximate
    estimateRs: job.estimateRs,
    travelRs: offer.travelRs,
    location: { lat: job.lat, lng: job.lng, address: job.address },
  };
}

export function jobView(job: Job, photos: JobPhoto[] = []) {
  return {
    id: job.id,
    status: job.status,
    customerName: job.customerName,
    customerPhone: job.customerPhone,
    vehicle: job.vehicle,
    vehicleType: job.vehicleType,
    issueSummary: job.issueSummary,
    issueCategory: job.issueCategory,
    serviceKeys: job.serviceKeys,
    paymentMethod: job.paymentMethod,
    distanceKm: job.distanceKm ?? 0,
    etaMin: etaFrom(job.etaS, job.distanceKm ?? 0),
    estimateRs: job.estimateRs,
    travelRs: job.travelRs ?? 0,
    location: { lat: job.lat, lng: job.lng, address: job.address },
    diagnosisNote: job.diagnosisNote,
    photos: { before: photos.some((p) => p.kind === 'before'), after: photos.some((p) => p.kind === 'after') },
    bill: job.bill,
    paidBy: job.paidBy,
    acceptedAt: job.acceptedAt,
    arrivedAt: job.arrivedAt,
    completedAt: job.completedAt,
  };
}
