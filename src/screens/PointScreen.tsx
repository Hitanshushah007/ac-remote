import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { aimDistance, compass8, headingDelta } from '../geometry';
import { getSwitchState, setSwitch } from '../smartthings';
import {
  Calibration,
  loadCalibrations,
  loadLastRoom,
  roomOf,
  saveLastRoom,
} from '../storage';
import { useAim } from '../useAim';

// Aim tolerance before a device locks. Generous because within one room the
// candidates are usually far apart (e.g. east vs west ends).
const LOCK_THRESHOLD = 40;

function uniqueRooms(cals: Calibration[]): string[] {
  const out: string[] = [];
  for (const c of cals) {
    const r = roomOf(c);
    if (!out.includes(r)) out.push(r);
  }
  return out;
}

export default function PointScreen({
  token,
  onCalibrate,
}: {
  token: string;
  onCalibrate: () => void;
}) {
  const { aim, ready, error } = useAim(true);
  const [cals, setCals] = useState<Calibration[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [states, setStates] = useState<Record<string, boolean | null>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [c, last] = await Promise.all([loadCalibrations(), loadLastRoom()]);
      setCals(c);
      const roomList = uniqueRooms(c);
      setSelectedRoom((last && roomList.includes(last) ? last : roomList[0]) ?? null);
    })();
  }, []);

  const rooms = useMemo(() => uniqueRooms(cals), [cals]);
  const candidates = useMemo(
    () => cals.filter((c) => roomOf(c) === selectedRoom),
    [cals, selectedRoom]
  );
  const multi = candidates.length > 1;

  function pickRoom(room: string) {
    setSelectedRoom(room);
    saveLastRoom(room);
    Haptics.selectionAsync();
  }

  // The targeted appliance: the only one in the room, or the one we're aiming at.
  const locked = useMemo<Calibration | null>(() => {
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    let best: Calibration | null = null;
    let bestD = Infinity;
    for (const c of candidates) {
      const d = aimDistance(aim.heading, aim.pitch, c);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best && bestD <= LOCK_THRESHOLD ? best : null;
  }, [aim, candidates]);

  const lockedId = locked?.deviceId ?? null;
  useEffect(() => {
    if (!lockedId) return;
    if (multi) Haptics.selectionAsync();
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
        <Text style={styles.emptySub}>Teach the app where each appliance is to start pointing.</Text>
        <Pressable style={styles.primary} onPress={onCalibrate}>
          <Text style={styles.primaryText}>Calibrate appliances</Text>
        </Pressable>
      </View>
    );
  }

  const lockedState = locked ? states[locked.deviceId] : undefined;

  return (
    <View style={styles.root}>
      <View style={styles.topbar}>
        <Text style={styles.heading}>
          {ready ? `${Math.round(aim.heading)}° ${compass8(aim.heading)}` : 'compass…'}
        </Text>
        <Pressable onPress={onCalibrate}>
          <Text style={styles.link}>Recalibrate</Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chips}
        contentContainerStyle={styles.chipsContent}
      >
        {rooms.map((r) => (
          <Pressable
            key={r}
            style={[styles.chip, r === selectedRoom && styles.chipOn]}
            onPress={() => pickRoom(r)}
          >
            <Text style={[styles.chipText, r === selectedRoom && styles.chipTextOn]}>{r}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.stage}>
        <View style={[styles.reticle, locked && styles.reticleLocked]}>
          {locked ? (
            <>
              <Text style={styles.lockedLabel}>{locked.label}</Text>
              <Text style={styles.lockedState}>
                {lockedState === true ? 'ON' : lockedState === false ? 'OFF' : '—'}
              </Text>
              {multi && <Text style={styles.lockedDir}>facing {compass8(locked.heading)}</Text>}
            </>
          ) : (
            <Text style={styles.scan}>
              {multi ? 'Aim at the\nappliance' : 'No appliance\nin this room'}
            </Text>
          )}
        </View>

        <Pressable
          style={[styles.toggle, !locked && styles.toggleDisabled, busyId && styles.toggleBusy]}
          onPress={() => locked && toggle(locked)}
          disabled={!locked || !!busyId}
        >
          <Text style={styles.toggleText}>
            {locked ? (lockedState === true ? 'Turn off' : 'Turn on') : multi ? 'Point at one' : '—'}
          </Text>
        </Pressable>

        {multi && <Text style={styles.hint}>Two+ in this room — point to choose</Text>}
        {actionError && <Text style={styles.error}>{actionError}</Text>}
        {error && <Text style={styles.error}>{error}</Text>}
      </View>

      <Text style={styles.listTitle}>{selectedRoom ?? 'Room'}</Text>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {candidates
          .map((c) => ({ c, delta: headingDelta(aim.heading, c.heading) }))
          .sort((a, b) => a.delta - b.delta)
          .map(({ c, delta }) => {
            const on = states[c.deviceId];
            const isLocked = lockedId === c.deviceId;
            return (
              <Pressable
                key={c.deviceId}
                style={[styles.row, isLocked && styles.rowLocked]}
                onPress={() => toggle(c)}
                disabled={!!busyId}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>{c.label}</Text>
                  <Text style={styles.rowMeta}>
                    {multi ? `${Math.round(delta)}° away · ${compass8(c.heading)}` : compass8(c.heading)}
                  </Text>
                </View>
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
  root: { flex: 1, paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20 },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heading: { color: '#9aa0a6', fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  link: { color: '#4ade80', fontSize: 15, fontWeight: '600' },
  chips: { flexGrow: 0, marginTop: 14 },
  chipsContent: { gap: 8, paddingRight: 12 },
  chip: {
    backgroundColor: '#161616',
    borderColor: '#2a2a2a',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  chipOn: { backgroundColor: '#1f3d2a', borderColor: '#2c4a35' },
  chipText: { color: '#9aa0a6', fontSize: 14, fontWeight: '600' },
  chipTextOn: { color: '#4ade80' },
  stage: { alignItems: 'center', gap: 16, paddingVertical: 22 },
  reticle: {
    width: 210,
    height: 210,
    borderRadius: 105,
    borderWidth: 2,
    borderColor: '#262626',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  reticleLocked: { borderColor: '#4ade80', backgroundColor: '#0f1f14' },
  scan: { color: '#666', fontSize: 18, textAlign: 'center', lineHeight: 24 },
  lockedLabel: { color: '#f5f5f5', fontSize: 20, fontWeight: '700', textAlign: 'center', paddingHorizontal: 12 },
  lockedState: { color: '#4ade80', fontSize: 32, fontWeight: '800', letterSpacing: 1 },
  lockedDir: { color: '#5c8b6e', fontSize: 13, fontWeight: '600' },
  toggle: {
    backgroundColor: '#4ade80',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 48,
    minWidth: 240,
    alignItems: 'center',
  },
  toggleDisabled: { backgroundColor: '#1f2a22' },
  toggleBusy: { opacity: 0.6 },
  toggleText: { color: '#04130a', fontSize: 18, fontWeight: '800' },
  hint: { color: '#777', fontSize: 13 },
  error: { color: '#f87171', fontSize: 13, textAlign: 'center' },
  listTitle: {
    color: '#777',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
  },
  rowLocked: { borderWidth: 1, borderColor: '#2c4a35' },
  rowLabel: { color: '#f5f5f5', fontSize: 16, fontWeight: '600' },
  rowMeta: { color: '#777', fontSize: 13, marginTop: 2, fontVariant: ['tabular-nums'] },
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
