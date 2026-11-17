// utils/navigation.ts
// Opens Google Maps straight into turn-by-turn driving directions — like PickMe / Uber driver apps.
//
//   Android: google.navigation:q=lat,lng&mode=d   → starts navigation immediately in the Google Maps app
//   iOS:     comgooglemaps://?daddr=…&directionsmode=driving → Google Maps app, if installed
//   Either, if Google Maps isn't installed: the official Google Maps URL, which opens the app when present
//   (universal link) or Google Maps in the browser otherwise.
import { Linking, Platform } from 'react-native';

export async function openGoogleMapsNavigation(lat: number, lng: number): Promise<void> {
  const dest = `${lat},${lng}`;
  const universal = `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving&dir_action=navigate`;
  const app =
    Platform.OS === 'android'
      ? `google.navigation:q=${dest}&mode=d`
      : `comgooglemaps://?daddr=${dest}&directionsmode=driving`;
  try {
    await Linking.openURL(app);
  } catch {
    await Linking.openURL(universal); // Google Maps not installed (or blocked) → official web link
  }
}
