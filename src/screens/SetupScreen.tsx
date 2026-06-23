import { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ping } from '../smartthings';
import { saveToken } from '../storage';
import { syncNativeConfig } from '../nativeSync';

const TOKENS_URL = 'https://account.smartthings.com/tokens';

export default function SetupScreen({ onConnected }: { onConnected: (token: string) => void }) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    const trimmed = token.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const count = await ping(trimmed);
      await saveToken(trimmed);
      syncNativeConfig();
      if (count === 0) {
        setError('Connected, but the token sees 0 devices. Check its scopes.');
        setBusy(false);
        return;
      }
      onConnected(trimmed);
    } catch (e: any) {
      setError(e?.message ?? 'Could not connect.');
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Point Remote</Text>
      <Text style={styles.sub}>
        Aim your phone at an appliance to switch it on. First, connect SmartThings.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Paste your SmartThings token"
        placeholderTextColor="#555"
        value={token}
        onChangeText={setToken}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.btn, (busy || !token.trim()) && styles.btnDisabled]}
        onPress={connect}
        disabled={busy || !token.trim()}
      >
        {busy ? <ActivityIndicator color="#04130a" /> : <Text style={styles.btnText}>Connect</Text>}
      </Pressable>

      <Pressable onPress={() => Linking.openURL(TOKENS_URL)} style={styles.help}>
        <Text style={styles.helpText}>Need a token? Generate one →</Text>
      </Pressable>

      <View style={styles.note}>
        <Text style={styles.noteText}>
          Create a token with the Devices scopes (list, see, and control), then paste it above. It's
          stored encrypted on this phone only.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'center', padding: 28, gap: 16 },
  title: { color: '#f5f5f5', fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },
  sub: { color: '#9aa0a6', fontSize: 16, lineHeight: 22, marginBottom: 8 },
  input: {
    backgroundColor: '#161616',
    borderColor: '#2a2a2a',
    borderWidth: 1,
    borderRadius: 14,
    color: '#f5f5f5',
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  error: { color: '#f87171', fontSize: 14, lineHeight: 20 },
  btn: {
    backgroundColor: '#4ade80',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#04130a', fontSize: 17, fontWeight: '700' },
  help: { alignItems: 'center', paddingVertical: 8 },
  helpText: { color: '#4ade80', fontSize: 15, fontWeight: '600' },
  note: { backgroundColor: '#121212', borderRadius: 12, padding: 16, marginTop: 8 },
  noteText: { color: '#777', fontSize: 13, lineHeight: 19 },
});
