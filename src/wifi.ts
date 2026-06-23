import { useEffect, useState } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { loadHomeSsid } from './storage';

// Android wraps SSIDs in quotes and returns "<unknown ssid>" without location.
function cleanSsid(state: NetInfoState): string | null {
  if (state.type !== 'wifi') return null;
  const raw = (state.details as any)?.ssid as string | undefined | null;
  if (!raw || raw === '<unknown ssid>') return null;
  return raw.replace(/^"|"$/g, '');
}

export async function currentSsid(): Promise<string | null> {
  return cleanSsid(await NetInfo.fetch());
}

export type WifiState = { ssid: string | null; home: string | null; onHome: boolean | null };

// Live: are we on the saved home Wi-Fi? onHome is null until first read.
export function useHomeWifi(): WifiState {
  const [state, setState] = useState<WifiState>({ ssid: null, home: null, onHome: null });

  useEffect(() => {
    let mounted = true;
    let unsub = () => {};
    (async () => {
      const home = await loadHomeSsid();
      const apply = (s: NetInfoState) => {
        const ssid = cleanSsid(s);
        if (mounted) setState({ ssid, home, onHome: home ? ssid === home : false });
      };
      apply(await NetInfo.fetch());
      unsub = NetInfo.addEventListener(apply);
    })();
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  return state;
}
