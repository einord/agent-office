import { createSocket } from 'dgram';

/** Discovery payload sent in UDP probe */
const DISCOVER_PROBE = 'AGENT_OFFICE_DISCOVER v1';

/** Default UDP discovery port (must match backend EventModeConfig.discoveryPort) */
const DEFAULT_DISCOVERY_PORT = 3102;

export interface DiscoveryResult {
  serverUrl: string;
  wsUrl: string;
  name: string;
  source: 'mdns' | 'udp';
}

interface UdpResponse {
  service: string;
  version: number;
  host: string;
  httpPort: number;
  wsPort: number;
  eventMode: boolean;
  name: string;
}

/**
 * Tries mDNS first (if bonjour-service is available), then falls back
 * to UDP broadcast. Returns the first valid result, or null if nothing
 * answers within `timeoutMs` total.
 */
export async function discoverServer(timeoutMs: number = 4000): Promise<DiscoveryResult | null> {
  const mdnsBudget = Math.min(2500, Math.floor(timeoutMs * 0.6));
  const mdnsResult = await tryMdns(mdnsBudget);
  if (mdnsResult) return mdnsResult;

  const remaining = Math.max(1500, timeoutMs - mdnsBudget);
  return tryUdpBroadcast(remaining);
}

async function tryMdns(timeoutMs: number): Promise<DiscoveryResult | null> {
  try {
    const mod = await import('bonjour-service');
    type BonjourCtor = new () => {
      find: (
        opts: { type: string; protocol?: string },
        listener: (svc: { name?: string; addresses?: string[]; port?: number; txt?: Record<string, string> }) => void
      ) => { stop: () => void };
      destroy: () => void;
    };
    const candidates = mod as unknown as { Bonjour?: BonjourCtor; default?: BonjourCtor | { Bonjour?: BonjourCtor } };
    const fromDefault = typeof candidates.default === 'function'
      ? candidates.default
      : (candidates.default as { Bonjour?: BonjourCtor } | undefined)?.Bonjour;
    const Bonjour = candidates.Bonjour ?? fromDefault;
    if (!Bonjour) return null;

    const instance = new Bonjour();
    return await new Promise<DiscoveryResult | null>((resolve) => {
      let resolved = false;
      const finish = (value: DiscoveryResult | null) => {
        if (resolved) return;
        resolved = true;
        try {
          browser.stop();
        } catch {
          // ignore
        }
        try {
          instance.destroy();
        } catch {
          // ignore
        }
        resolve(value);
      };

      const browser = instance.find({ type: 'agentoffice', protocol: 'tcp' }, (svc) => {
        const ipv4 = (svc.addresses ?? []).find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a));
        if (!ipv4 || !svc.port) return;
        const wsPort = Number(svc.txt?.ws ?? svc.port);
        finish({
          serverUrl: `http://${ipv4}:${svc.port}`,
          wsUrl: `ws://${ipv4}:${wsPort}`,
          name: svc.name ?? 'Agent Office',
          source: 'mdns',
        });
      });

      setTimeout(() => finish(null), timeoutMs);
    });
  } catch {
    return null;
  }
}

function tryUdpBroadcast(timeoutMs: number): Promise<DiscoveryResult | null> {
  return new Promise((resolve) => {
    let settled = false;
    const sock = createSocket('udp4');

    const finish = (value: DiscoveryResult | null) => {
      if (settled) return;
      settled = true;
      try {
        sock.close();
      } catch {
        // ignore
      }
      resolve(value);
    };

    sock.on('error', () => finish(null));

    sock.on('message', (msg) => {
      try {
        const text = msg.toString('utf-8');
        const data = JSON.parse(text) as UdpResponse;
        if (data?.service !== 'agent-office' || !data.host || !data.httpPort) return;
        finish({
          serverUrl: `http://${data.host}:${data.httpPort}`,
          wsUrl: `ws://${data.host}:${data.wsPort ?? data.httpPort + 1}`,
          name: data.name ?? 'Agent Office',
          source: 'udp',
        });
      } catch {
        // ignore malformed responses
      }
    });

    sock.bind(0, () => {
      try {
        sock.setBroadcast(true);
      } catch {
        // some systems don't permit broadcast - just give up
        finish(null);
        return;
      }

      const probe = Buffer.from(DISCOVER_PROBE, 'utf-8');
      const send = () => {
        if (settled) return;
        sock.send(probe, DEFAULT_DISCOVERY_PORT, '255.255.255.255', () => {
          // ignore - errors usually mean no broadcast permission
        });
      };

      send();
      const interval = setInterval(send, 700);
      setTimeout(() => {
        clearInterval(interval);
        finish(null);
      }, timeoutMs);
    });
  });
}
