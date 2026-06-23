// Minimal SmartThings REST client.
// Docs: https://developer.smartthings.com/docs/api/public
const BASE = 'https://api.smartthings.com/v1';

export type StDevice = {
  deviceId: string;
  label: string;
  name: string;
  capabilities: string[]; // capability ids on the "main" component
};

async function st(token: string, path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let detail = body;
    try {
      detail = JSON.parse(body)?.error?.message ?? body;
    } catch {
      // keep raw body
    }
    throw new Error(`SmartThings ${res.status}: ${detail || res.statusText}`);
  }
  return res;
}

// Returns how many devices the token can see — used to validate a token.
export async function ping(token: string): Promise<number> {
  const res = await st(token, '/devices');
  const json = await res.json();
  return (json.items ?? []).length;
}

// All devices that expose an on/off "switch" (ACs, plugs, lights, etc.).
export async function listSwitchableDevices(token: string): Promise<StDevice[]> {
  const res = await st(token, '/devices');
  const json = await res.json();
  const items = (json.items ?? []) as any[];
  return items
    .map((d) => {
      const components = d.components ?? [];
      const main = components.find((c: any) => c.id === 'main') ?? components[0];
      const capabilities = (main?.capabilities ?? []).map((c: any) => c.id) as string[];
      return {
        deviceId: d.deviceId,
        label: d.label || d.name || 'Unnamed device',
        name: d.name ?? '',
        capabilities,
      };
    })
    .filter((d) => d.capabilities.includes('switch'));
}

// true = on, false = off, null = unknown.
export async function getSwitchState(token: string, deviceId: string): Promise<boolean | null> {
  const res = await st(token, `/devices/${deviceId}/status`);
  const json = await res.json();
  const value = json?.components?.main?.switch?.switch?.value;
  if (value === 'on') return true;
  if (value === 'off') return false;
  return null;
}

export async function setSwitch(token: string, deviceId: string, on: boolean): Promise<void> {
  await st(token, `/devices/${deviceId}/commands`, {
    method: 'POST',
    body: JSON.stringify({
      commands: [{ component: 'main', capability: 'switch', command: on ? 'on' : 'off' }],
    }),
  });
}
