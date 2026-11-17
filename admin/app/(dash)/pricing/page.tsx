import { adminApi } from '@/lib/api';
import { formatDate, formatRs, type CatalogService, type PricingResponse } from '@/lib/types';
import { PricingForm } from './PricingForm';
import { ServiceRow } from './ServiceRow';

export default async function PricingPage() {
  const [{ pricing, examples }, { services }] = await Promise.all([
    adminApi<PricingResponse>('/pricing'),
    adminApi<{ services: CatalogService[] }>('/catalog'),
  ]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pricing</h1>
          <p className="muted">Ridzo sets every price. Mechanics only choose which services they do.</p>
        </div>
        <span className="muted small">Last changed {formatDate(pricing.updatedAt)}</span>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16, alignItems: 'start' }}>
        <section className="card">
          <h2>Travel charge &amp; commission</h2>
          <PricingForm pricing={pricing} />
        </section>

        <section className="card">
          <h2>How a job is priced</h2>
          <div className="formula">
            {`Travel = ${formatRs(pricing.travelBaseRs)} (first ${pricing.travelBaseKm} km)
       + ${formatRs(pricing.travelPerKmRs)} × each km after that
       × ${pricing.nightMultiplier} from ${String(pricing.nightStartHour).padStart(2, '0')}:00 to ${String(pricing.nightEndHour).padStart(2, '0')}:00
       capped at ${formatRs(pricing.travelCapRs)}, rounded to Rs 10

Total  = services + travel + parts − discount
Ridzo  = ${Math.round(pricing.commissionRate * 1000) / 10}% of services + parts − discount${pricing.commissionOnTravel ? ' + travel' : ''}
Payout = total − Ridzo`}
          </div>
          <h2 style={{ marginTop: 18 }}>Travel charge examples</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Distance</th>
                  <th>Day</th>
                  <th>Night</th>
                </tr>
              </thead>
              <tbody>
                {examples.map((e) => (
                  <tr key={e.distanceKm}>
                    <td>{e.distanceKm} km</td>
                    <td>{formatRs(e.dayRs)}</td>
                    <td>{formatRs(e.nightRs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            Distance is the one-way road distance from the mechanic to the customer, estimated as straight-line × {pricing.roadFactor}.
            Jobs further than {pricing.maxRadiusKm} km are not offered.
          </p>
        </section>
      </div>

      <section className="card" style={{ padding: 0 }}>
        <div style={{ padding: '18px 18px 0' }}>
          <h2>Service price list</h2>
          <p className="muted small" style={{ marginBottom: 12 }}>
            Changes apply to new jobs straight away. Hidden services disappear from the app and can&apos;t be booked.
          </p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Service</th>
                <th>Category</th>
                <th>Time</th>
                <th>Price (Rs)</th>
                <th>Offered</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <ServiceRow key={s.key} service={s} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
