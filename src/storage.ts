import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'st_token';
const CAL_KEY = 'calibrations_v1';

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
