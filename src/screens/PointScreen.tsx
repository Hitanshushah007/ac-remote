import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { compass8, relativeBearing } from '../geometry';
import { getSwitchState, setSwitch } from '../smartthings';
import { Calibration, loadCalibrations } from '../storage';
import { useAim } from '../useAim';

const LOCK = 24; // degrees of aim tolerance to lock a device
const RADAR = 300; // px
const C = RADAR / 2; // center
const R = C - 26; // radius the blips sit on

export default function PointScreen({
  token,
  onCalibrate,
}: {
  token: string;
  onCalibrate: () => void;
}) {
  const { aim, ready, error } = useAim(true);
  const [cals, setCals] = useState<Calibration[]>([]);
  const [states, setStates] = useState<Record<string, boolean | null>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadCalibrations().then(setCals);
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 2800,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [sweep]);

  // Each device's signed angle from where we're aiming, nearest-to-ahead first.
  const ranked = useMemo(
    () =>
      cals
        .map((c) => ({ c, rel: relativeBearing(aim.heading, c.heading) }))
        .sort((a, b) => Math.abs(a.rel) - Math.abs(b.rel)),
    [cals, aim.heading]
  );
  const locked = ranked.length && Math.abs(ranked[0].rel) <= LOCK ? ranked[0].c : null;
  const lockedId = locked?.deviceId ?? null;

  useEffect(() => {
    if (!lockedId) return;
    Haptics.selectionAsync();
    if (!(lockedId in states)) {
      getSwitchState(token, lockedId)
        .then((v) => setStates((s) => ({ ...s, [lockedId]: v })))
        .catch(() => {});
    }
  }, [lockedId]);

  async function toggle(c: Calibration) {
    setBusyId(c.deviceId);
    setActionError(null);
    try {
      const known = states[c.deviceId];
      const current = known ?? (await getSwitchState(token, c.deviceId));
      const next = !current;
      await setSwitch(token, c.deviceId, next);
      setStates((s) => ({ ...s, [c.deviceId]: next }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setActionError(e?.message ?? 'Command failed.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusyId(null);
    }
  }

  if (cals.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Nothing calibrated yet</Text>
        <Text style={styles.emptySub}>Capture the direction of each appliance to start pointing.</Text>
        <Pressable style={styles.primary} onPress={onCalibrate}>
          <Text style={styles.primaryText}>Add devices</Text>
        </Pressable>
      </View>
    );
  }

  const lockedState = locked ? states[locked.deviceId] : undefined;
  const sweepRotate = sweep.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const ring = (size: number) => ({
    position: 'absolute' as const,
    width: size,
    height: size,
    borderRadius: size / 2,
    left: C - size / 2,
    top: C - size / 2,
    borderWidth: 1,
    borderColor: '#1c2a20',
  });

  return (
    <View style={styles.root}>
      <View style={styles.topbar}>
        <Text style={styles.heading}>
          {ready ? `${Math.round(aim.heading)}° ${compass8(aim.heading)}` : 'reading compass…'}
        </Text>
        <Pressable onPress={onCalibrate} hitSlop={10}>
          <Text style={styles.link}>Devices</Text>
        </Pressable>
      </View>

      <View style={styles.radarWrap}>
        <View style={{ width: RADAR, height: RADAR }}>
          <View style={ring(RADAR)} />
          <View style={ring(RADAR * 0.66)} />
          <View style={ring(RADAR * 0.33)} />

          {/* lock zone wedge + aim line at the top (12 o'clock = where you point) */}
          <View style={styles.aimLine} />
          <View style={styles.aimDot} />

          {/* rotating radar sweep */}
          <Animated.View
            style={[styles.sweepBox, { transform: [{ rotate: sweepRotate }] }]}
            pointerEvents="none"
          >
            <View style={styles.sweepArm} />
          </Animated.View>

          {/* device blips, positioned by their angle relative to your aim */}
          {ranked.map(({ c, rel }) => {
            const th = (rel * Math.PI) / 180;
            const x = C + R * Math.sin(th);
            const y = C - R * Math.cos(th);
            const isLocked = lockedId === c.deviceId;
            const on = states[c.deviceId];
            return (
              <View
                key={c.deviceId}
                style={[
                  styles.blip,
                  { left: x - 7, top: y - 7 },
                  on === true && styles.blipOn,
                  isLocked && styles.blipLocked,
                ]}
              />
            );
          })}

          {/* center readout */}
          <View style={styles.center} pointerEvents="none">
            {locked ? (
              <>
                <Text style={styles.lockName} numberOfLines={2}>
                  {locked.label}
                </Text>
                <Text style={styles.lockState}>
                  {lockedState === true ? 'ON' : lockedState === false ? 'OFF' : '—'}
                </Text>
              </>
            ) : (
              <Text style={styles.lockHint}>aim at{'\n'}a device</Text>
            )}
          </View>
        </View>
      </View>

      <Pressable
        style={[styles.toggle, !locked && styles.toggleOff, busyId && styles.toggleBusy]}
        onPress={() => locked && toggle(locked)}
        disabled={!locked || !!busyId}
      >
        <Text style={styles.toggleText}>
          {locked ? (lockedState === true ? 'Turn off' : 'Turn on') : 'Point at a device'}
        </Text>
      </Pressable>

      {actionError && <Text style={styles.err}>{actionError}</Text>}
      {error && <Text style={styles.err}>{error}</Text>}

      <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 16 }}>
        {ranked.map(({ c, rel }) => {
          const on = states[c.deviceId];
          return (
            <Pressable
              key={c.deviceId}
              style={[styles.row, lockedId === c.deviceId && styles.rowLocked]}
              onPress={() => toggle(c)}
              disabled={!!busyId}
            >
              <Text style={styles.rowLabel} numberOfLines={1}>
                {c.label}
              </Text>
              <Text style={styles.rowDelta}>{Math.round(Math.abs(rel))}°</Text>
              <Text style={[styles.pill, on === true && styles.pillOn, on === false && styles.pillOff]}>
                {busyId === c.deviceId ? '…' : on === true ? 'ON' : on === false ? 'OFF' : '?'}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 56, paddingHorizontal: 20, paddingBottom: 18 },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heading: { color: '#9aa0a6', fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  link: { color: '#4ade80', fontSize: 15, fontWeight: '600' },
  radarWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },

  aimLine: {
    position: 'absolute',
    left: C - 1,
    top: 6,
    width: 2,
    height: C - 6,
    backgroundColor: '#23402d',
  },
  aimDot: {
    position: 'absolute',
    left: C - 5,
    top: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4ade80',
  },
  sweepBox: { position: 'absolute', width: RADAR, height: RADAR },
  sweepArm: {
    position: 'absolute',
    left: C - 1,
    top: 0,
    width: 2,
    height: C,
    backgroundColor: '#2f6b45',
    opacity: 0.7,
  },

  blip: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#3a3a3a',
    borderWidth: 1,
    borderColor: '#555',
  },
  blipOn: { backgroundColor: '#2f6b45', borderColor: '#4ade80' },
  blipLocked: {
    backgroundColor: '#4ade80',
    borderColor: '#bbf7d0',
    width: 18,
    height: 18,
    borderRadius: 9,
    marginLeft: -2,
    marginTop: -2,
  },

  center: {
    position: 'absolute',
    left: C - 70,
    top: C - 38,
    width: 140,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  lockName: { color: '#f5f5f5', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  lockState: { color: '#4ade80', fontSize: 26, fontWeight: '800', letterSpacing: 1 },
  lockHint: { color: '#5a5a5a', fontSize: 16, textAlign: 'center', lineHeight: 21 },

  toggle: {
    backgroundColor: '#4ade80',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 4,
  },
  toggleOff: { backgroundColor: '#1f2a22' },
  toggleBusy: { opacity: 0.6 },
  toggleText: { color: '#04130a', fontSize: 18, fontWeight: '800' },
  err: { color: '#f87171', fontSize: 13, textAlign: 'center', marginTop: 6 },

  list: { marginTop: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#141414',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 8,
  },
  rowLocked: { borderWidth: 1, borderColor: '#2c4a35' },
  rowLabel: { color: '#f5f5f5', fontSize: 16, fontWeight: '600', flex: 1 },
  rowDelta: { color: '#777', fontSize: 13, fontVariant: ['tabular-nums'] },
  pill: {
    color: '#888',
    fontSize: 13,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1d1d1d',
    minWidth: 48,
    textAlign: 'center',
  },
  pillOn: { color: '#04130a', backgroundColor: '#4ade80' },
  pillOff: { color: '#bbb', backgroundColor: '#222' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 },
  emptyTitle: { color: '#f5f5f5', fontSize: 22, fontWeight: '700' },
  emptySub: { color: '#9aa0a6', fontSize: 15, textAlign: 'center', lineHeight: 21 },
  primary: { backgroundColor: '#4ade80', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 28, marginTop: 8 },
  primaryText: { color: '#04130a', fontSize: 17, fontWeight: '700' },
});
