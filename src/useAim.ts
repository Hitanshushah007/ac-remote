import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { DeviceMotion } from 'expo-sensors';

export type Aim = {
  heading: number; // magnetic bearing 0-360
  pitch: number; // front-back tilt, degrees
  accuracy: number; // compass accuracy bucket from expo-location (lower = worse)
};

type Removable = { remove: () => void };

// Live aim from the phone's compass + motion sensors.
// `active` lets callers pause sensor work when a screen is not in front.
export function useAim(active: boolean) {
  const [aim, setAim] = useState<Aim>({ heading: 0, pitch: 0, accuracy: -1 });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pitchRef = useRef(0);

  useEffect(() => {
    if (!active) return;

    let headingSub: Removable | null = null;
    let motionSub: Removable | null = null;
    let cancelled = false;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setError('Location permission is needed to read the compass.');
          return;
        }
        if (cancelled) return;

        DeviceMotion.setUpdateInterval(80);
        motionSub = DeviceMotion.addListener((m) => {
          if (m.rotation) {
            // beta = front-back tilt in radians; keep a consistent convention
            // with calibration so only the *difference* matters.
            pitchRef.current = (m.rotation.beta * 180) / Math.PI;
          }
        });

        headingSub = await Location.watchHeadingAsync((h) => {
          // Prefer magnetic heading for a consistent frame across calibrate +
          // point (true heading depends on a GPS fix and can be unavailable).
          const deg = h.magHeading >= 0 ? h.magHeading : h.trueHeading;
          setAim({ heading: deg, pitch: pitchRef.current, accuracy: h.accuracy });
          setReady(true);
        });
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
    })();

    return () => {
      cancelled = true;
      headingSub?.remove();
      motionSub?.remove();
    };
  }, [active]);

  return { aim, ready, error };
}
