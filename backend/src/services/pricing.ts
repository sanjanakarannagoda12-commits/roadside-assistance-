// Ridzo's fee formula. All money is whole rupees.
//
//   Travel  = base call-out fee (covers the first N km)
//           + per-km rate × km beyond N           (one-way road distance)
//           × night multiplier                     (night hours, Sri Lanka time)
//           capped at a maximum, rounded to the nearest Rs 10
//
//   Total   = services (Ridzo's price list) + travel + parts − discount
//   Ridzo   = commission rate × (services + parts − discount)  [+ travel if commissionOnTravel]
//   Payout  = total − Ridzo commission
//
// The server is the only place these numbers are calculated. Apps only display them.
import type { CatalogService, PricingConfig } from '../catalog.js';
import { ApiError } from '../errors.js';

export interface LatLng {
  lat: number;
  lng: number;
}

/** Straight-line distance in km (haversine). */
export function straightLineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Estimated road distance. Roads are longer than a straight line, so we multiply by roadFactor.
 * Swap this for the Google Routes API later — nothing else needs to change.
 */
export function estimateRoadKm(from: LatLng, to: LatLng, cfg: Pick<PricingConfig, 'roadFactor'>): number {
  return Math.round(straightLineKm(from, to) * cfg.roadFactor * 10) / 10;
}

/** Hour of the day (0–23) in Sri Lanka, whatever time zone the server runs in. */
export function sriLankaHour(at: Date): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', hour: '2-digit', hourCycle: 'h23' }).format(at);
  return Number(h);
}

export function isNight(at: Date, cfg: Pick<PricingConfig, 'nightStartHour' | 'nightEndHour'>): boolean {
  const h = sriLankaHour(at);
  const { nightStartHour: s, nightEndHour: e } = cfg;
  if (s === e) return false; // night pricing switched off
  return s > e ? h >= s || h < e : h >= s && h < e; // handles windows that cross midnight (22 → 6)
}

const roundTo10 = (n: number) => Math.round(n / 10) * 10;

export interface TravelBreakdown {
  distanceKm: number;
  baseRs: number;
  extraKm: number;
  extraRs: number;
  night: boolean;
  nightMultiplier: number;
  capped: boolean;
  travelRs: number;
}

export function travelCharge(distanceKm: number, cfg: PricingConfig, at: Date = new Date()): TravelBreakdown {
  const km = Math.max(0, distanceKm);
  const extraKm = Math.max(0, Math.round((km - cfg.travelBaseKm) * 10) / 10);
  const extraRs = extraKm * cfg.travelPerKmRs;
  const night = isNight(at, cfg);
  const multiplier = night ? cfg.nightMultiplier : 1;
  const raw = roundTo10((cfg.travelBaseRs + extraRs) * multiplier);
  const capped = raw > cfg.travelCapRs;
  return {
    distanceKm: Math.round(km * 10) / 10,
    baseRs: cfg.travelBaseRs,
    extraKm,
    extraRs: Math.round(extraRs),
    night,
    nightMultiplier: multiplier,
    capped,
    travelRs: capped ? cfg.travelCapRs : raw,
  };
}

export interface BillLine {
  label: string;
  amountRs: number;
}

export interface Bill {
  services: BillLine[];
  parts: BillLine[];
  servicesRs: number;
  partsRs: number;
  travelRs: number;
  subtotalRs: number;
  discountRs: number;
  totalRs: number;
  commissionRate: number;
  commissionRs: number;
  payoutRs: number;
}

export function computeBill(
  input: { services: BillLine[]; parts?: BillLine[]; travelRs: number; discountRs?: number },
  cfg: Pick<PricingConfig, 'commissionRate' | 'commissionOnTravel'>,
): Bill {
  const parts = input.parts ?? [];
  const servicesRs = input.services.reduce((s, l) => s + l.amountRs, 0);
  const partsRs = parts.reduce((s, l) => s + l.amountRs, 0);
  const travelRs = Math.max(0, input.travelRs);
  // A discount can only come off services + parts, never off the travel charge.
  const discountRs = Math.min(Math.max(input.discountRs ?? 0, 0), servicesRs + partsRs);
  const subtotalRs = servicesRs + partsRs + travelRs;
  const totalRs = subtotalRs - discountRs;
  const commissionBase = servicesRs + partsRs - discountRs + (cfg.commissionOnTravel ? travelRs : 0);
  const commissionRs = Math.round(commissionBase * cfg.commissionRate);
  return {
    services: input.services,
    parts,
    servicesRs,
    partsRs,
    travelRs,
    subtotalRs,
    discountRs,
    totalRs,
    commissionRate: cfg.commissionRate,
    commissionRs,
    payoutRs: totalRs - commissionRs,
  };
}

/** Upfront estimate shown before a job is accepted (no parts yet). */
export function quote(
  input: { serviceKeys: string[]; distanceKm: number; at?: Date },
  catalog: CatalogService[],
  cfg: PricingConfig,
) {
  const byKey = new Map(catalog.filter((s) => s.active).map((s) => [s.key, s]));
  const unknown = input.serviceKeys.filter((k) => !byKey.has(k));
  if (unknown.length) throw new ApiError(400, 'validation_error', `Unknown service: ${unknown[0]}`);
  if (input.distanceKm > cfg.maxRadiusKm) {
    throw new ApiError(400, 'too_far', `Mechanics only travel up to ${cfg.maxRadiusKm} km.`, {
      maxRadiusKm: cfg.maxRadiusKm,
    });
  }
  const travel = travelCharge(input.distanceKm, cfg, input.at);
  const services = input.serviceKeys.map((k) => ({ label: byKey.get(k)!.name, amountRs: byKey.get(k)!.priceRs }));
  return { travel, bill: computeBill({ services, travelRs: travel.travelRs }, cfg) };
}
