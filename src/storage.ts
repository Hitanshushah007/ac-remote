import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'st_token';
const CAL_KEY = 'calibrations_v1';
const LAST_ROOM_KEY = 'last_room_v1';

export type Calibration = {
  deviceId: string;
  label: string;
  room?: string; // which room this appliance lives in; defaults to its label
  heading: number; // magnetic compass bearing the phone faced, 0-360
  pitch: number; // phone tilt (degrees) when captured
};

// The room an appliance belongs to (falls back to its own label).
export function roomOf(c: Calibration): string {
  return (c.room && c.room.trim()) || c.label;
}

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

export async function loadLastRoom(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_ROOM_KEY);
}

export async function saveLastRoom(room: string): Promise<void> {
  await AsyncStorage.setItem(LAST_ROOM_KEY, room);
}
