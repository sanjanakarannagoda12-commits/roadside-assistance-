// services/location.ts
// Foreground GPS: getting a fix when going online, and tracking while the app is open.
// Background tracking (other apps / screen locked) lives in backgroundLocation.ts.
import * as Location from 'expo-location';
import { Alert, Linking } from 'react-native';

export type LatLng = { lat: number; lng: number };

/** Asks for "while using the app" permission. Shows a helpful message if it's refused. */
export async function ensureLocationPermission(): Promise<boolean> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return true;
  const asked = current.canAskAgain ? await Location.requestForegroundPermissionsAsync() : current;
  if (asked.granted) return true;
  Alert.alert(
    'Location needed',
    'Ridzo sends you jobs near where you are, so it needs your location while you are online.',
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open settings', onPress: () => Linking.openSettings().catch(() => {}) },
    ],
  );
  return false;
}

export async function currentPosition(): Promise<LatLng> {
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

/** Calls onUpdate whenever the phone moves ~50 m. Returns a function that stops watching. */
export async function watchPosition(
  onUpdate: (p: LatLng & { accuracyM: number | null }) => void,
  accuracy: Location.Accuracy = Location.Accuracy.Balanced,
): Promise<() => void> {
  const sub = await Location.watchPositionAsync(
    { accuracy, distanceInterval: accuracy >= Location.Accuracy.High ? 20 : 50, timeInterval: 15000 },
    (pos) => onUpdate({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy }),
  );
  return () => sub.remove();
}
