# Point Remote

Aim your Pixel at an appliance (AC, plug, light) and toggle it. The phone's compass
selects *which* device you're pointing at; the on/off command goes to **SmartThings**
over the internet. Built with Expo (SDK 56), runs on bun.

## How it works

1. **Setup** — paste a SmartThings personal access token (stored encrypted on-device).
2. **Calibrate** — stand in your usual spot, aim at each appliance, tap *Capture*. The
   app saves each device's compass bearing + tilt. *Test* briefly switches a device on
   so you can confirm which physical unit it is.
3. **Point** — the live aim locks onto the nearest calibrated device within ~22°. Big
   toggle sends the command. A list below also lets you tap any device directly.

Pointing is *bearing matching*, not 3D positioning — it disambiguates appliances that
sit in different directions from where you stand. Tune `LOCK_THRESHOLD` in
`src/screens/PointScreen.tsx` if locks feel too loose/tight.

## Run it (fast iteration — Expo Go)

```bash
bun install
bunx expo start
```

Install **Expo Go** from the Play Store on the Pixel (same Wi-Fi), scan the QR. Sensors,
compass, secure storage, and SmartThings all work in Expo Go.

## Build an installable APK (EAS, cloud)

```bash
bunx eas-cli login          # free Expo account
bunx eas-cli build -p android --profile preview
```

Produces an internal-distribution **APK** with a download link — sideload it on the Pixel.
No Android SDK needed locally; the build runs in Expo's cloud.

## Layout

- `src/smartthings.ts` — SmartThings REST client (list / status / command)
- `src/useAim.ts` — compass heading + tilt fused into a live aim
- `src/geometry.ts` — angular matching math
- `src/storage.ts` — token (SecureStore) + calibrations (AsyncStorage)
- `src/screens/` — Setup, Calibrate, Point
