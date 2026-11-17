# Background location (staying online in other apps)

Like PickMe and Uber, an online Ridzo mechanic keeps sharing their location when they switch to Maps or WhatsApp, or lock the phone.

| | Expo Go | Ridzo app build (development / store) |
|---|---|---|
| Location while Ridzo is open | ✅ | ✅ |
| Location in other apps / screen locked | ❌ (an Expo Go limitation) | ✅ |
| Android "Ridzo — you're online" notification | – | ✅ (keeps the tracking alive) |
| iOS blue location indicator | – | ✅ |

## Make a development build (once)

Background location can't run in Expo Go, so you need your own build of the app:

```bash
# Android phone connected by USB (or an emulator):
npx expo run:android

# iPhone (needs a Mac with Xcode and a free Apple developer account):
npx expo run:ios --device
```

Or build in the cloud with EAS: `npm i -g eas-cli && eas build --profile development --platform android`.

After that, `npx expo start` opens the project in **your build** instead of Expo Go.

## What the mechanic sees
1. They tap **Go online** and allow location. Ridzo explains why it needs location **all the time**, then asks.
   - On Android 11+, the system opens Settings. The mechanic must choose **"Allow all the time"**.
   - On iOS, they choose **"Change to Always Allow"** when asked.
2. While online, Android shows a notification: **"Ridzo — you're online"**. During a job it changes to **"Ridzo — on a job"**.
3. If they only allow "While using the app", they can still go online. Home then shows a message reminding them to keep Ridzo open.
4. Going offline or logging out stops all tracking straight away.

## How it works
- [services/backgroundLocation.ts](services/backgroundLocation.ts): the background task, which is registered in [index.js](index.js) before the app starts.
- [components/LocationReporter.tsx](components/LocationReporter.tsx): chooses background or foreground tracking, and uses higher accuracy during a job.
- **Server** (`POST /mechanic/location`):
  - ignores late or out-of-order points;
  - records the route while the mechanic is on a job;
  - switches a mechanic offline after 5 minutes with no location.

## Store review
Both stores review "location all the time":
- **Google Play** asks for a short video showing the feature and the in-app explanation (the "Stay online in other apps" dialog).
- **Apple** checks that the permission text explains the purpose. Ours is set in `app.json` under the `expo-location` plugin.
