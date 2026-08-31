# Road Assistance — Frontend Starter

This folder contains starter screens restyled to the new dark/orange color scheme
(from the Corundai reference image), following the layouts from your Figma export.

## How to use these files

1. Create your Expo project (see Step 2 in the chat).
2. Copy these files/folders into your project root, **replacing** the matching files:
   - `App.tsx`
   - `theme/`
   - `screens/`
   - `components/`
   - `navigation/`
   - `tailwind.config.js`
3. Create an `assets/` folder in your project and add these images (rename to match, or update the `require()` paths in the screens):
   - `mechanic-hero.jpg` → from your Figma export, the "Get Started" background photo
   - `mechanic-illustration.png` → the mechanic + car illustration from the Login screen
   - `google-icon.png` → small Google "G" logo
   - `avatar.png` → the profile photo circle on Home
4. Run:
   ```bash
   npx expo start
   ```
   Scan the QR code with the **Expo Go** app on your phone to preview live.

## What's built so far
- `GetStartedScreen` — hero photo + headline + CTA button (dark button instead of navy)
- `LoginScreen` — form fields, orange primary button, Google sign-in row
- `HomeScreen` — greeting header, dark hero card, 4 service cards using the new
  peach-icon-chip + orange-arrow style from your reference image
- `ServiceCard` and `BottomNav` — reusable components so every other screen
  (Services, Booking, Chat, Profile, mechanic-side Home) can reuse the same style

## Next screens to build (in this order, matching your Project Plan phases)
1. Sign Up (User) + Sign Up (Service Provider) — same form style as Login
2. Services / Book a Garage / Book a Mechanic — reuse `ServiceCard`
3. Booking details + Assign Mechanic
4. Chat screen
5. Profile + Reviews
6. Mechanic/Garage-side Home (from "Home Page Mechanic.png")

Say the word and I'll build the next batch of screens the same way.
