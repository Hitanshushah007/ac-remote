import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { compass8 } from '../geometry';
import { listSwitchableDevices, setSwitch, StDevice } from '../smartthings';
import { Calibration, loadCalibrations, saveCalibrations } from '../storage';
import { syncNativeConfig } from '../nativeSync';
import { useAim } from '../useAim';

export default function CalibrateScreen({ token, onBack }: { token: string; onBack: () => void }) {
  const { aim, ready } = useAim(true);
  const [devices, setDevices] = useState<StDevice[]>([]);
  const [cals, setCals] = useState<Calibration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [d, c] = await Promise.all([listSwitchableDevices(token), loadCalibrations()]);
        setDevices(d);
        setCals(c);
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
    next.push({ deviceId: d.deviceId, label: d.label, heading: aim.heading, pitch: aim.pitch });
    setCals(next);
    await saveCalibrations(next);
    syncNativeConfig();
  }

  async function forget(d: StDevice) {
    const next = cals.filter((c) => c.deviceId !== d.deviceId);
    setCals(next);
    await saveCalibrations(next);
    syncNativeConfig();
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

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.back}>
          <Text style={styles.backChevron}>‹</Text>
          <Text style={styles.backText}>Radar</Text>
        </Pressable>
        <View style={styles.heading}>
          <Text style={styles.headingDeg}>{ready ? `${Math.round(aim.heading)}°` : '—'}</Text>
          <Text style={styles.headingPt}>{ready ? compass8(aim.heading) : '…'}</Text>
        </View>
      </View>

      <Text style={styles.title}>Devices</Text>
      <Text style={styles.sub}>
        Stand where you usually do, aim at each appliance, and tap Capture. Re-aim and Recapture any
        time to fix a direction.
      </Text>

      {error && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#4ade80" />
          <Text style={styles.dim}>Loading your devices…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
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
                  <Text style={styles.rowMeta}>
                    {c ? `saved · ${Math.round(c.heading)}° ${compass8(c.heading)}` : 'not calibrated'}
                  </Text>
                  <View style={styles.rowBtns}>
                    {c && (
                      <Pressable style={styles.forgetBtn} onPress={() => forget(d)}>
                        <Text style={styles.forgetText}>Forget</Text>
                      </Pressable>
                    )}
                    <Pressable
                      style={[styles.capBtn, c && styles.capBtnDone]}
                      onPress={() => capture(d)}
                    >
                      <Text style={styles.capText}>{c ? 'Recapture' : 'Capture'}</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      <Pressable style={styles.done} onPress={onBack}>
        <Text style={styles.doneText}>Done</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 56, paddingHorizontal: 20, paddingBottom: 24, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { flexDirection: 'row', alignItems: 'center' },
  backChevron: { color: '#4ade80', fontSize: 30, marginTop: -4, marginRight: 2 },
  backText: { color: '#4ade80', fontSize: 16, fontWeight: '600' },
  heading: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  headingDeg: { color: '#9aa0a6', fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  headingPt: { color: '#666', fontSize: 13, fontWeight: '600' },
  title: { color: '#f5f5f5', fontSize: 28, fontWeight: '800', marginTop: 4 },
  sub: { color: '#9aa0a6', fontSize: 14, lineHeight: 20 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 40 },
  error: { color: '#f87171', fontSize: 14 },
  dim: { color: '#777', fontSize: 15 },
  row: { backgroundColor: '#141414', borderRadius: 14, padding: 14, marginTop: 10, gap: 10 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { color: '#f5f5f5', fontSize: 16, fontWeight: '600', flex: 1 },
  rowMeta: { color: '#777', fontSize: 13 },
  rowBtns: { flexDirection: 'row', gap: 8 },
  testBtn: {
    borderColor: '#2f2f2f',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  testText: { color: '#9aa0a6', fontSize: 14, fontWeight: '600' },
  forgetBtn: { borderColor: '#3a2222', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  forgetText: { color: '#c97a7a', fontSize: 13, fontWeight: '600' },
  capBtn: { backgroundColor: '#1f3d2a', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11 },
  capBtnDone: { backgroundColor: '#23311f' },
  capText: { color: '#4ade80', fontSize: 14, fontWeight: '700' },
  done: { backgroundColor: '#4ade80', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  doneText: { color: '#04130a', fontSize: 17, fontWeight: '700' },
});
