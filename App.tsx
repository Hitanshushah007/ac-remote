import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import SetupScreen from './src/screens/SetupScreen';
import CalibrateScreen from './src/screens/CalibrateScreen';
import PointScreen from './src/screens/PointScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { loadToken } from './src/storage';
import { syncNativeConfig } from './src/nativeSync';

type Screen = 'loading' | 'setup' | 'calibrate' | 'point' | 'settings';

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    loadToken().then((t) => {
      setToken(t);
      setScreen(t ? 'point' : 'setup');
    });
    syncNativeConfig();
  }, []);

  // Keep the background volume-toggle service's config fresh on each foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') syncNativeConfig();
    });
    return () => sub.remove();
  }, []);

  // Android hardware back: Calibrate returns to the radar; the radar is the
  // root, so back there exits the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'calibrate' || screen === 'settings') {
        setScreen('point');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [screen]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {screen === 'loading' && <ActivityIndicator color="#4ade80" />}

      {screen === 'setup' && (
        <SetupScreen
          onConnected={(t) => {
            setToken(t);
            setScreen('calibrate');
          }}
        />
      )}

      {screen === 'calibrate' && token && (
        <CalibrateScreen token={token} onBack={() => setScreen('point')} />
      )}

      {screen === 'point' && token && (
        <PointScreen
          token={token}
          onCalibrate={() => setScreen('calibrate')}
          onSettings={() => setScreen('settings')}
        />
      )}

      {screen === 'settings' && <SettingsScreen onBack={() => setScreen('point')} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'stretch', justifyContent: 'center' },
});
