import * as FileSystem from 'expo-file-system/legacy';
import { loadCalibrations, loadHomeSsid, loadToken } from './storage';

// Mirrors token + calibrations + home Wi-Fi into a plain JSON file in the app's
// files dir, so the native Accessibility Service (Kotlin) can read them when a
// volume-combo fires. Best-effort; the service degrades gracefully if absent.
export async function syncNativeConfig(): Promise<void> {
  try {
    const [token, cals, homeSsid] = await Promise.all([
      loadToken(),
      loadCalibrations(),
      loadHomeSsid(),
    ]);
    const payload = {
      token: token ?? '',
      homeSsid: homeSsid ?? '',
      calibrations: cals.map((c) => ({ deviceId: c.deviceId, label: c.label, heading: c.heading })),
    };
    const dir = FileSystem.documentDirectory;
    if (!dir) return;
    await FileSystem.writeAsStringAsync(dir + 'native_config.json', JSON.stringify(payload));
  } catch {
    // ignore — non-critical
  }
}
