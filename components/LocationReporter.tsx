// components/LocationReporter.tsx
// Keeps Ridzo up to date with the mechanic's location while they are online or on a job.
//
//   Real app build + "Allow all the time"  → background tracking (keeps working in other apps / screen off)
//   Expo Go, or only "While using the app"  → foreground tracking (only while Ridzo is open)
//
// On a job it switches to higher accuracy so the customer can follow the mechanic on the map.
// Every update doubles as the heartbeat: nothing for 5 minutes → the server switches the mechanic offline.
// Renders nothing; mounted once in App.tsx.
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { useAppContext } from '../context/AppContext';
import { useJob } from '../context/JobContext';
import { LatLng, watchPosition } from '../services/location';
import { sendLocation } from '../services/mechanicApi';
import {
  TrackingMode,
  canTrackInBackground,
  hasBackgroundPermission,
  setOnTrackingStoppedByServer,
  startBackgroundTracking,
  stopBackgroundTracking,
} from '../services/backgroundLocation';

const HEARTBEAT_MS = 15000;

export default function LocationReporter() {
  const { online, setOnline, setTracking } = useAppContext();
  const { request } = useJob();
  const mode: TrackingMode = request ? 'job' : 'idle';
  // Track while online, AND always while on a job — even if the server switched the mechanic offline
  // because the app was closed for a while (the customer still needs to see them coming).
  const active = online || Boolean(request);
  const last = useRef<(LatLng & { accuracyM: number | null }) | null>(null);

  // If the server switches us off while we're in the background, reflect it when the app is next opened.
  useEffect(() => {
    setOnTrackingStoppedByServer(() => setOnline(false));
    return () => setOnTrackingStoppedByServer(null);
  }, [setOnline]);

  useEffect(() => {
    if (!active) {
      stopBackgroundTracking();
      setTracking('off');
      return;
    }

    let cancelled = false;
    let stopWatch: (() => void) | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;

    const report = async () => {
      if (!last.current || AppState.currentState !== 'active') return;
      try {
        const res = await sendLocation({ ...last.current, source: 'foreground', recordedAt: new Date().toISOString() });
        if (!res.online) setOnline(false); // switched off by the server (tracking continues if on a job)
      } catch {
        // network blip — try again on the next beat
      }
    };

    (async () => {
      if ((await canTrackInBackground()) && (await hasBackgroundPermission())) {
        try {
          await startBackgroundTracking(mode);
          if (!cancelled) setTracking('background');
          return;
        } catch {
          // fall through to foreground tracking
        }
      }
      await stopBackgroundTracking();
      if (cancelled) return;
      setTracking('foreground');
      stopWatch = await watchPosition((p) => {
        const first = !last.current;
        last.current = p;
        if (first) report();
      }, mode === 'job' ? Location.Accuracy.High : Location.Accuracy.Balanced).catch(() => null);
      if (cancelled) stopWatch?.();
      timer = setInterval(report, HEARTBEAT_MS);
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      stopWatch?.();
      // Background tracking is NOT stopped here: switching idle → job just updates its settings.
    };
  }, [active, mode, setOnline, setTracking]);

  return null;
}
