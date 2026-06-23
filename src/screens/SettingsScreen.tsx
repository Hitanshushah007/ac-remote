import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { currentSsid } from '../wifi';
import { syncNativeConfig } from '../nativeSync';
import {
  clearHomeSsid,
  loadHomeSsid,
  loadInstantMode,
  saveHomeSsid,
  saveInstantMode,
} from '../storage';

export default function SettingsScreen({ onBack }: { onBack: () => void }) {
  const [home, setHome] = useState<string | null>(null);
  const [ssid, setSsid] = useState<string | null>(null);
  const [instant, setInstant] = useState(false);

  async function refresh() {
    const [h, s, i] = await Promise.all([loadHomeSsid(), currentSsid(), loadInstantMode()]);
    setHome(h);
    setSsid(s);
    setInstant(i);
  }
  useEffect(() => {
    refresh();
  }, []);

  async function setAsHome() {
    if (!ssid) return;
    await saveHomeSsid(ssid);
    setHome(ssid);
    syncNativeConfig();
  }
  async function clearHome() {
    await clearHomeSsid();
    setHome(null);
    syncNativeConfig();
  }
  async function toggleInstant(v: boolean) {
    setInstant(v);
    await saveInstantMode(v);
  }

  const onHome = !!home && ssid === home;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.back}>
          <Text style={styles.backChevron}>‹</Text>
          <Text style={styles.backText}>Radar</Text>
        </Pressable>
      </View>
      <Text style={styles.title}>Settings</Text>

      <ScrollView contentContainerStyle={{ paddingBottom: 24, gap: 16 }}>
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Touchless toggle</Text>
            <Switch
              value={instant}
              onValueChange={toggleInstant}
              trackColor={{ true: '#2f6b45', false: '#333' }}
              thumbColor={instant ? '#4ade80' : '#888'}
            />
          </View>
          <Text style={styles.cardBody}>
            When on, opening the app (e.g. via Quick Tap) points and auto-toggles the appliance you're
            aimed at — only while on your home Wi-Fi.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Home Wi-Fi</Text>
          <Text style={styles.kv}>
            Current: <Text style={styles.kvVal}>{ssid ?? '— (turn on location/Wi-Fi)'}</Text>
          </Text>
          <Text style={styles.kv}>
            Home: <Text style={styles.kvVal}>{home ?? 'not set'}</Text>
            {onHome ? '  ✓ on home' : ''}
          </Text>
          <View style={styles.btnRow}>
            <Pressable
              style={[styles.btn, !ssid && styles.btnDisabled]}
              onPress={setAsHome}
              disabled={!ssid}
            >
              <Text style={styles.btnText}>Set current as home</Text>
            </Pressable>
            {home && (
              <Pressable style={styles.btnGhost} onPress={clearHome}>
                <Text style={styles.btnGhostText}>Clear</Text>
              </Pressable>
            )}
          </View>
        </View>

        <Pressable style={styles.refresh} onPress={refresh}>
          <Text style={styles.refreshText}>Refresh Wi-Fi</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 56, paddingHorizontal: 20, paddingBottom: 20 },
  header: { flexDirection: 'row', alignItems: 'center' },
  back: { flexDirection: 'row', alignItems: 'center' },
  backChevron: { color: '#4ade80', fontSize: 30, marginTop: -4, marginRight: 2 },
  backText: { color: '#4ade80', fontSize: 16, fontWeight: '600' },
  title: { color: '#f5f5f5', fontSize: 30, fontWeight: '800', marginTop: 6, marginBottom: 8 },
  card: { backgroundColor: '#141414', borderRadius: 16, padding: 16, gap: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { color: '#f5f5f5', fontSize: 17, fontWeight: '700' },
  cardBody: { color: '#9aa0a6', fontSize: 14, lineHeight: 20 },
  kv: { color: '#9aa0a6', fontSize: 15 },
  kvVal: { color: '#f5f5f5', fontWeight: '600' },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn: { backgroundColor: '#1f3d2a', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#4ade80', fontSize: 15, fontWeight: '700' },
  btnGhost: { borderColor: '#3a2222', borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  btnGhostText: { color: '#c97a7a', fontSize: 15, fontWeight: '600' },
  refresh: { alignItems: 'center', paddingVertical: 10 },
  refreshText: { color: '#4ade80', fontSize: 15, fontWeight: '600' },
});
