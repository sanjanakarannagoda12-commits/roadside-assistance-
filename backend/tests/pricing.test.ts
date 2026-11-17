// The fee formula: travel charge, night rate, cap, bill totals and commission.
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { DEFAULT_CATALOG, DEFAULT_PRICING } from '../src/catalog.js';
import { computeBill, estimateRoadKm, isNight, quote, travelCharge } from '../src/services/pricing.js';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createMemoryFileStore, createMemoryRepo } from '../src/db/memoryRepo.js';

const cfg = DEFAULT_PRICING; // Rs 500 for 3 km, Rs 80/km after, ×1.25 from 22:00–06:00, cap Rs 3,000
const day = new Date('2026-03-10T14:00:00+05:30');
const night = new Date('2026-03-10T23:30:00+05:30');

describe('travel charge', () => {
  it('charges only the call-out fee inside the first 3 km', () => {
    expect(travelCharge(2.4, cfg, day).travelRs).toBe(500);
    expect(travelCharge(3, cfg, day).travelRs).toBe(500);
  });

  it('adds the per-km rate after 3 km', () => {
    const t = travelCharge(8, cfg, day);
    expect(t.extraKm).toBe(5);
    expect(t.travelRs).toBe(900); // 500 + 5 × 80
  });

  it('applies the night multiplier and rounds to the nearest Rs 10', () => {
    const t = travelCharge(8, cfg, night);
    expect(t.night).toBe(true);
    expect(t.travelRs).toBe(1130); // 900 × 1.25 = 1,125 → 1,130
  });

  it('never goes above the cap', () => {
    const t = travelCharge(60, cfg, night);
    expect(t.capped).toBe(true);
    expect(t.travelRs).toBe(3000);
  });

  it('uses Sri Lanka time for night hours, whatever the server time zone', () => {
    expect(isNight(new Date('2026-03-10T22:00:00+05:30'), cfg)).toBe(true);
    expect(isNight(new Date('2026-03-11T05:59:00+05:30'), cfg)).toBe(true);
    expect(isNight(new Date('2026-03-11T06:00:00+05:30'), cfg)).toBe(false);
    expect(isNight(new Date('2026-03-10T21:59:00+05:30'), cfg)).toBe(false);
    // 17:00 UTC = 22:30 in Colombo
    expect(isNight(new Date('2026-03-10T17:00:00Z'), cfg)).toBe(true);
  });

  it('estimates road distance from two locations', () => {
    // Kandy clock tower → Peradeniya: ~5.1 km straight line × 1.3
    const km = estimateRoadKm({ lat: 7.2936, lng: 80.6350 }, { lat: 7.2690, lng: 80.5940 }, cfg);
    expect(km).toBeGreaterThan(6);
    expect(km).toBeLessThan(7.5);
  });
});

describe('bill', () => {
  it('adds services + travel + parts, and the discount never touches travel', () => {
    const bill = computeBill(
      {
        services: [{ label: 'Tyre change', amountRs: 4000 }],
        parts: [{ label: 'Valve', amountRs: 300 }],
        travelRs: 900,
        discountRs: 10_000, // more than services + parts
      },
      cfg,
    );
    expect(bill.subtotalRs).toBe(5200);
    expect(bill.discountRs).toBe(4300); // capped at services + parts
    expect(bill.totalRs).toBe(900); // customer still pays the travel charge
  });

  it('takes commission on services + parts only (travel goes to the mechanic)', () => {
    const bill = computeBill({ services: [{ label: 'Tyre change', amountRs: 4000 }], travelRs: 900 }, cfg);
    expect(bill.totalRs).toBe(4900);
    expect(bill.commissionRs).toBe(400);
    expect(bill.payoutRs).toBe(4500);
  });

  it('can include travel in the commission when the admin turns it on', () => {
    const bill = computeBill({ services: [{ label: 'x', amountRs: 4000 }], travelRs: 900 }, { ...cfg, commissionOnTravel: true });
    expect(bill.commissionRs).toBe(490);
  });

  it('quotes from Ridzo prices and refuses unknown services or long distances', () => {
    const q = quote({ serviceKeys: ['tyre_change', 'puncture_repair'], distanceKm: 8, at: day }, DEFAULT_CATALOG, cfg);
    expect(q.bill.servicesRs).toBe(6500);
    expect(q.bill.totalRs).toBe(7400);
    expect(() => quote({ serviceKeys: ['nope'], distanceKm: 1 }, DEFAULT_CATALOG, cfg)).toThrow(/Unknown service/);
    expect(() => quote({ serviceKeys: ['tyre_change'], distanceKm: 40 }, DEFAULT_CATALOG, cfg)).toThrow(/15 km/);
  });
});

describe('POST /pricing/quote', () => {
  const config = loadConfig({
    NODE_ENV: 'test',
    JWT_SECRET: 'test-jwt-secret-test-jwt-secret-1234',
    OTP_SECRET: 'test-otp-secret-test-otp-secret-1234',
  });
  const app = createApp({ config, repo: createMemoryRepo(), files: createMemoryFileStore(), sms: { async send() {} } });

  it('returns the upfront estimate', async () => {
    const res = await request(app)
      .post('/pricing/quote')
      .send({ serviceKeys: ['battery_jump'], distanceKm: 8, at: '2026-03-10T14:00:00+05:30' })
      .expect(200);
    expect(res.body.travel.travelRs).toBe(900);
    expect(res.body.bill.totalRs).toBe(5900);
  });

  it('works from two locations', async () => {
    const res = await request(app)
      .post('/pricing/quote')
      .send({ serviceKeys: ['battery_jump'], from: { lat: 7.2936, lng: 80.635 }, to: { lat: 7.269, lng: 80.594 } })
      .expect(200);
    expect(res.body.travel.distanceKm).toBeGreaterThan(6);
  });

  it('validates input', async () => {
    await request(app).post('/pricing/quote').send({ serviceKeys: ['battery_jump'] }).expect(400);
    await request(app).post('/pricing/quote').send({ serviceKeys: [], distanceKm: 2 }).expect(400);
    await request(app)
      .post('/pricing/quote')
      .send({ serviceKeys: ['battery_jump'], from: { lat: 51.5, lng: -0.1 }, to: { lat: 7.2, lng: 80.6 } })
      .expect(400); // London is not in Sri Lanka
  });
});
