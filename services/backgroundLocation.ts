// services/backgroundLocation.ts
//
// Location tracking the way ride-hailing apps do it: while a mechanic is online, their location keeps
// reaching Ridzo even when they switch to WhatsApp, Maps or lock the screen.
//   • Android: a foreground service with a permanent "Ridzo — you're online" notification keeps it alive.
//   • iOS: background location mode, with the blue location indicator in the status bar.
//
// Needs a development / store build. Expo Go can't run background location, so there the app falls back
// to tracking only while it's open (see LocationReporter).
//
// IMPORTANT: this file must be imported from index.js BEFORE the app registers. When the phone wakes
// the app in the background to deliver locations, no screens are mounted — the task has to exist already.
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Alert } from 'react-native';
import { getAccessToken, loadTokens } from './apiClient';
import { sendLocation } from './mechanicApi';

export const LOCATION_TASK = 'ridzo-mechanic-location';
const MIN_SEND_GAP_MS = 10_000; // phones can deliver many fixes a second; send at most one per 10 s

export type TrackingMode = 'idle' | 'job'; // idle = online waiting for jobs, job = driving to / at a customer

let lastSentAt = 0;
let onStoppedByServer: (() => void) | null = null;

/** Called when the server says we're no longer online (suspended, timed out, logged out elsewhere). */
export function setOnTrackingStoppedByServer(cb: (() => void) | null) {
  onStoppedByServer = cb;
}

type TaskData = { locations?: Location.LocationObject[] };

TaskManager.defineTask<TaskData>(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const latest = data.locations[data.locations.length - 1];
  if (Date.now() - lastSentAt < MIN_SEND_GAP_MS) return;
  lastSentAt = Date.now();

  try {
    // When the phone wakes the app just for this, the login token may not be loaded yet.
    if (!getAccessToken() && !(await loadTokens())) {
      await stopBackgroundTracking();
      return;
    }
    const res = await sendLocation({
      lat: latest.coords.latitude,
      lng: latest.coords.longitude,
      accuracyM: latest.coords.accuracy,
      speedMps: latest.coords.speed,
      heading: latest.coords.heading,
      recordedAt: new Date(latest.timestamp).toISOString(),
      source: 'background',
    });
    if (!res.online) {
      onStoppedByServer?.(); // update the app's online state…
      // …but keep tracking while on a job: the customer is waiting for this mechanic.
      if (!res.onJob) await stopBackgroundTracking();
    }
  } catch {
    // Offline / server busy: the next fix will try again.
  }
});

/** Expo Go can't do background location — only a development or store build can. */
export const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient &&
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  Constants.appOwnership === 'expo';

export async function canTrackInBackground(): Promise<boolean> {
  if (isExpoGo) return false;
  try {
    return (await TaskManager.isAvailableAsync()) && (await Location.isBackgroundLocationAvailableAsync());
  } catch {
    return false;
  }
}

export async function hasBackgroundPermission(): Promise<boolean> {
  try {
    return (await Location.getBackgroundPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

const confirm = (title: string, message: string, ok: string) =>
  new Promise<boolean>((resolve) =>
    Alert.alert(title, message, [
      { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
      { text: ok, onPress: () => resolve(true) },
    ]),
  );

/**
 * Asks for "Allow all the time" / "Always" — explaining why first, as both app stores require.
 * Foreground permission must already be granted.
 */
export async function ensureBackgroundPermission(): Promise<boolean> {
  if (await hasBackgroundPermission()) return true;
  const go = await confirm(
    'Stay online in other apps',
    'Ridzo needs your location "All the time" so customers can see you coming and jobs keep reaching you while you use Maps, WhatsApp or lock your phone.\n\nIt is only used while you are online or on a job.',
    'Continue',
  );
  if (!go) return false;
  // Android 11+ opens the settings page here: choose "Allow all the time".
  const res = await Location.requestBackgroundPermissionsAsync();
  return res.granted;
}

export async function startBackgroundTracking(mode: TrackingMode): Promise<void> {
  lastSentAt = 0;
  // Calling this again with the same task just updates the settings (e.g. idle → job).
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: mode === 'job' ? Location.Accuracy.High : Location.Accuracy.Balanced,
    timeInterval: 15_000, // Android: a fix every ~15 s even when standing still (the heartbeat)
    distanceInterval: mode === 'job' ? 20 : 0,
    activityType: Location.ActivityType.AutomotiveNavigation,
    pausesUpdatesAutomatically: false, // iOS must not pause while a mechanic waits for a job
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: mode === 'job' ? 'Ridzo — on a job' : "Ridzo — you're online",
      notificationBody:
        mode === 'job'
          ? 'Sharing your location with the customer until the job is done.'
          : 'Sharing your location so nearby breakdown jobs can reach you.',
      notificationColor: '#DE6627',
      killServiceOnDestroy: false, // keep going if the app is swiped away (Android)
    },
  });
}

export async function stopBackgroundTracking(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    }
  } catch {
    // not running
  }
}
