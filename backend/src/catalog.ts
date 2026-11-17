// Ridzo's services and default prices.
// Prices are set by Ridzo admins (not by each mechanic), so every customer sees the same price.
// These values seed the database the first time; after that admins change them in the admin web app.

export type Category = 'tyre' | 'battery' | 'engine' | 'lockout';

export interface CatalogService {
  key: string;
  category: Category;
  name: string;
  durationLabel: string;
  priceRs: number;
  active: boolean;
  sortOrder: number;
}

export const SPECIALTIES: { category: Category; label: string }[] = [
  { category: 'tyre', label: 'Tyres' },
  { category: 'battery', label: 'Battery' },
  { category: 'engine', label: 'Engine' },
  { category: 'lockout', label: 'Locksmith' },
];

const seed = (
  key: string,
  category: Category,
  name: string,
  durationLabel: string,
  priceRs: number,
  sortOrder: number,
): CatalogService => ({ key, category, name, durationLabel, priceRs, active: true, sortOrder });

export const DEFAULT_CATALOG: CatalogService[] = [
  seed('tyre_change', 'tyre', 'Tyre change', '10–20 mins', 4000, 10),
  seed('puncture_repair', 'tyre', 'Puncture repair', '20–30 mins', 2500, 20),
  seed('wheel_alignment', 'tyre', 'Wheel alignment', '1–2 hrs', 10000, 30),
  seed('battery_jump', 'battery', 'Battery jump start', '30–40 mins', 5000, 40),
  seed('battery_fit', 'battery', 'Battery replacement (fitting)', '20–30 mins', 3000, 50),
  seed('engine_diagnosis', 'engine', 'Engine diagnosis', '30–60 mins', 6000, 60),
  seed('overheating_check', 'engine', 'Overheating check', '20–40 mins', 3500, 70),
  seed('lockout', 'lockout', 'Lockout assistance', '20–40 mins', 7500, 80),
];

/** Travel charge + commission settings. One row in the database, edited by admins. */
export interface PricingConfig {
  travelBaseRs: number; // call-out fee, covers the first travelBaseKm
  travelBaseKm: number;
  travelPerKmRs: number; // charged per km after travelBaseKm (one-way road distance)
  travelCapRs: number; // travel charge never goes above this
  nightMultiplier: number; // e.g. 1.25 = +25% at night
  nightStartHour: number; // 0–23, Sri Lanka time
  nightEndHour: number; // 0–23, Sri Lanka time
  roadFactor: number; // straight-line km × this ≈ road km (until a maps API is connected)
  maxRadiusKm: number; // never match a mechanic further than this
  commissionRate: number; // Ridzo's share, e.g. 0.10
  commissionOnTravel: boolean; // false = travel charge goes 100% to the mechanic
  updatedAt: string | null;
}

export const DEFAULT_PRICING: PricingConfig = {
  travelBaseRs: 500,
  travelBaseKm: 3,
  travelPerKmRs: 80,
  travelCapRs: 3000,
  nightMultiplier: 1.25,
  nightStartHour: 22,
  nightEndHour: 6,
  roadFactor: 1.3,
  maxRadiusKm: 15,
  commissionRate: 0.1,
  commissionOnTravel: false,
  updatedAt: null,
};
