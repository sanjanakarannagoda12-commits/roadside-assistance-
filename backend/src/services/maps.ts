// Road distance + driving time between points.
//
//   GOOGLE_MAPS_API_KEY set  → Google Routes API (computeRouteMatrix): real road distance and a
//                              traffic-aware ETA. One request covers all candidate mechanics at once.
//   not set / Google fails   → estimate: straight line × road factor, ETA at an average city speed.
//
// Callers never need to care which one answered: every result says its `source`.
// Results are cached for 2 minutes (mechanics move, traffic changes) to keep the bill small.
import { estimateRoadKm, type LatLng } from './pricing.js';

export const ROUTE_MATRIX_ENDPOINT = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';
const AVG_KMH = 25; // Sri Lankan town traffic, for the estimate
const CACHE_MS = 2 * 60 * 1000;
const MAX_CACHE = 2000;

export interface RouteInfo {
  km: number;
  durationS: number;
  source: 'google' | 'estimate';
}

export interface Maps {
  readonly provider: 'google' | 'estimate';
  /** Driving route from each origin to one destination. Same order as `origins`. */
  routesTo(origins: LatLng[], destination: LatLng, roadFactor: number): Promise<RouteInfo[]>;
}

export const estimateRoute = (from: LatLng, to: LatLng, roadFactor: number): RouteInfo => {
  const km = estimateRoadKm(from, to, { roadFactor });
  return { km, durationS: Math.round((km / AVG_KMH) * 3600), source: 'estimate' };
};

export function createEstimateMaps(): Maps {
  return {
    provider: 'estimate',
    async routesTo(origins, destination, roadFactor) {
      return origins.map((o) => estimateRoute(o, destination, roadFactor));
    },
  };
}

const point = (p: LatLng) => ({ waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } } });
// ~11 m grid: a mechanic standing still keeps hitting the cache.
const cacheKey = (o: LatLng, d: LatLng) => `${o.lat.toFixed(4)},${o.lng.toFixed(4)}>${d.lat.toFixed(4)},${d.lng.toFixed(4)}`;

export function createGoogleMaps(
  apiKey: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number; trafficAware?: boolean; log?: (m: string) => void } = {},
): Maps {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const log = opts.log ?? ((m: string) => console.warn(m));
  const cache = new Map<string, { at: number; route: RouteInfo }>();

  return {
    provider: 'google',
    async routesTo(origins, destination, roadFactor) {
      const now = Date.now();
      const results: (RouteInfo | null)[] = origins.map((o) => {
        const hit = cache.get(cacheKey(o, destination));
        return hit && now - hit.at < CACHE_MS ? hit.route : null;
      });
      const missing = origins.map((o, i) => ({ o, i })).filter(({ i }) => !results[i]);
      if (!missing.length) return results as RouteInfo[];

      try {
        const res = await fetchImpl(ROUTE_MATRIX_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            // `status` must be in the mask, otherwise every element looks OK.
            'X-Goog-FieldMask': 'originIndex,destinationIndex,status,condition,distanceMeters,duration',
          },
          body: JSON.stringify({
            origins: missing.map(({ o }) => point(o)),
            destinations: [point(destination)],
            travelMode: 'DRIVE',
            routingPreference: opts.trafficAware === false ? 'TRAFFIC_UNAWARE' : 'TRAFFIC_AWARE',
          }),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok || !Array.isArray(body)) {
          throw new Error(`HTTP ${res.status}: ${JSON.stringify(body)?.slice(0, 200)}`);
        }
        // Elements can come back in any order — match them by originIndex.
        for (const el of body as any[]) {
          const idx = missing[el.originIndex ?? 0]?.i;
          if (idx === undefined) continue;
          const ok = (!el.status || !el.status.code) && el.condition === 'ROUTE_EXISTS' && typeof el.distanceMeters === 'number';
          if (!ok) continue; // e.g. ROUTE_NOT_FOUND → falls back to the estimate below
          const route: RouteInfo = {
            km: Math.round(el.distanceMeters / 100) / 10,
            durationS: Math.round(parseFloat(String(el.duration ?? '0').replace(/s$/, ''))),
            source: 'google',
          };
          results[idx] = route;
          if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
          cache.set(cacheKey(origins[idx], destination), { at: now, route });
        }
      } catch (e) {
        log(`[maps] Google Routes failed, using estimates: ${(e as Error).message}`);
      }
      return results.map((r, i) => r ?? estimateRoute(origins[i], destination, roadFactor));
    },
  };
}

export function createMaps(config: { GOOGLE_MAPS_API_KEY?: string; GOOGLE_MAPS_TRAFFIC?: boolean }): Maps {
  return config.GOOGLE_MAPS_API_KEY
    ? createGoogleMaps(config.GOOGLE_MAPS_API_KEY, { trafficAware: config.GOOGLE_MAPS_TRAFFIC })
    : createEstimateMaps();
}
