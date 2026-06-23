import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { compass8 } from '../geometry';
import { listSwitchableDevices, setSwitch, StDevice } from '../smartthings';
import { Calibration, loadCalibrations, roomOf, saveCalibrations } from '../storage';
import { useAim } from '../useAim';

export default function CalibrateScreen({
  token,
  onDone,
}: {
  token: string;
  onDone: () => void;
}) {
  const { aim, ready } = useAim(true);
  const [devices, setDevices] = useState<StDevice[]>([]);
  const [cals, setCals] = useState<Calibration[]>([]);
  const [rooms, setRooms] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [d, c] = await Promise.all([listSwitchableDevices(token), loadCalibrations()]);
        setDevices(d);
        setCals(c);
        const r: Record<string, string> = {};
        for (const dev of d) {
          const existing = c.find((x) => x.deviceId === dev.deviceId);
          r[dev.deviceId] = existing ? roomOf(existing) : dev.label;
        }
        setRooms(r);
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load devices.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  function calFor(deviceId: string): Calibration | undefined {
    return cals.find((c) => c.deviceId === deviceId);
  }

  async function capture(d: StDevice) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const next = cals.filter((c) => c.deviceId !== d.deviceId);
    next.push({
      deviceId: d.deviceId,
      label: d.label,
      room: (rooms[d.deviceId] || d.label).trim(),
      heading: aim.heading,
      pitch: aim.pitch,
    });
    setCals(next);
    await saveCalibrations(next);
  }

  // Briefly switch a device on so the user can confirm which physical unit it is.
  async function test(d: StDevice) {
    setTesting(d.deviceId);
    try {
      await setSwitch(token, d.deviceId, true);
    } catch (e: any) {
      setError(e?.message ?? 'Test failed.');
    } finally {
      setTesting(null);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#4ade80" />
        <Text style={styles.dim}>Loading your devices…</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Calibrate</Text>
      <Text style={styles.sub}>
        Stand in the room, aim at each appliance, tap Capture. Give two ACs in the same room the same
        Room name — then you point east/west to choose between them.
      </Text>

      <View style={styles.heading}>
        <Text style={styles.headingDeg}>{ready ? `${Math.round(aim.heading)}°` : '—'}</Text>
        <Text style={styles.headingPt}>{ready ? compass8(aim.heading) : 'reading compass…'}</Text>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {devices.length === 0 && (
          <Text style={styles.dim}>No switchable devices found on this account.</Text>
        )}
        {devices.map((d) => {
          const c = calFor(d.deviceId);
          return (
            <View key={d.deviceId} style={styles.row}>
              <View style={styles.rowTop}>
                <Text style={styles.rowLabel}>{d.label}</Text>
                <Pressable style={styles.testBtn} onPress={() => test(d)} disabled={!!testing}>
                  {testing === d.deviceId ? (
                    <ActivityIndicator color="#9aa0a6" />
                  ) : (
                    <Text style={styles.testText}>Test</Text>
                  )}
                </Pressable>
              </View>

              <View style={styles.rowBottom}>
                <View style={styles.roomWrap}>
                  <Text style={styles.roomLabel}>ROOM</Text>
                  <TextInput
                    style={styles.roomInput}
                    value={rooms[d.deviceId] ?? ''}
                    onChangeText={(t) => setRooms((r) => ({ ...r, [d.deviceId]: t }))}
                    placeholder="Room name"
                    placeholderTextColor="#555"
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                </View>
                <Pressable style={[styles.capBtn, c && styles.capBtnDone]} onPress={() => capture(d)}>
                  <Text style={styles.capText}>{c ? 'Recapture' : 'Capture'}</Text>
                </Pressable>
              </View>

              <Text style={styles.rowMeta}>
                {c ? `saved · ${Math.round(c.heading)}° ${compass8(c.heading)}` : 'not calibrated'}
              </Text>
            </View>
          );
        })}
      </ScrollView>

      <Pressable
        style={[styles.done, cals.length === 0 && styles.btnDisabled]}
        onPress={onDone}
        disabled={cals.length === 0}
      >
        <Text style={styles.doneText}>Done — start pointing</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 64, paddingHorizontal: 20, paddingBottom: 24, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  title: { color: '#f5f5f5', fontSize: 30, fontWeight: '800' },
  sub: { color: '#9aa0a6', fontSize: 14, lineHeight: 20 },
  heading: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginVertical: 2 },
  headingDeg: { color: '#4ade80', fontSize: 40, fontWeight: '800', fontVariant: ['tabular-nums'] },
  headingPt: { color: '#777', fontSize: 16, fontWeight: '600' },
  error: { color: '#f87171', fontSize: 14 },
  dim: { color: '#777', fontSize: 15 },
  row: { backgroundColor: '#141414', borderRadius: 14, padding: 14, marginTop: 10, gap: 10 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowBottom: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  rowLabel: { color: '#f5f5f5', fontSize: 16, fontWeight: '600' },
  rowMeta: { color: '#777', fontSize: 13 },
  roomWrap: { flex: 1, gap: 4 },
  roomLabel: { color: '#666', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  roomInput: {
    backgroundColor: '#0e0e0e',
    borderColor: '#2a2a2a',
    borderWidth: 1,
    borderRadius: 10,
    color: '#f5f5f5',
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  testBtn: {
    borderColor: '#2f2f2f',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  testText: { color: '#9aa0a6', fontSize: 14, fontWeight: '600' },
  capBtn: { backgroundColor: '#1f3d2a', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11 },
  capBtnDone: { backgroundColor: '#23311f' },
  capText: { color: '#4ade80', fontSize: 14, fontWeight: '700' },
  done: { backgroundColor: '#4ade80', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  doneText: { color: '#04130a', fontSize: 17, fontWeight: '700' },
  btnDisabled: { opacity: 0.4 },
});
