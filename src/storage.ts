import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'st_token';
const CAL_KEY = 'calibrations_v1';
const HOME_SSID_KEY = 'home_ssid_v1';
const INSTANT_KEY = 'instant_mode_v1';

export type Calibration = {
  deviceId: string;
  label: string;
  heading: number; // magnetic compass bearing the phone faced, 0-360
  pitch: number; // phone tilt when captured (kept for future use)
};

export async function saveToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function loadToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function loadCalibrations(): Promise<Calibration[]> {
  const raw = await AsyncStorage.getItem(CAL_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Calibration[];
  } catch {
    return [];
  }
}

export async function saveCalibrations(cals: Calibration[]): Promise<void> {
  await AsyncStorage.setItem(CAL_KEY, JSON.stringify(cals));
}

// The Wi-Fi network the touchless toggle is allowed to fire on.
export async function loadHomeSsid(): Promise<string | null> {
  return AsyncStorage.getItem(HOME_SSID_KEY);
}
export async function saveHomeSsid(ssid: string): Promise<void> {
  await AsyncStorage.setItem(HOME_SSID_KEY, ssid);
}
export async function clearHomeSsid(): Promise<void> {
  await AsyncStorage.removeItem(HOME_SSID_KEY);
}

// Whether opening the app auto-toggles whatever you're pointing at.
export async function loadInstantMode(): Promise<boolean> {
  return (await AsyncStorage.getItem(INSTANT_KEY)) === '1';
}
export async function saveInstantMode(on: boolean): Promise<void> {
  await AsyncStorage.setItem(INSTANT_KEY, on ? '1' : '0');
}
