import type { Service } from 'bonjour-service';
import { getConfig } from '../config/config-loader.js';

let published: Service | null = null;
let bonjourInstance: unknown = null;

/**
 * Attempts to register an mDNS service for the event server.
 * Uses a dynamic import so the bonjour-service dependency stays optional -
 * if it's not installed, we just skip mDNS and rely on UDP discovery.
 */
export async function startMdnsBroadcast(): Promise<void> {
  const config = getConfig();
  const eventMode = config.eventMode;
  if (!eventMode?.enabled) return;
  if (published) return;

  try {
    const mod = await import('bonjour-service');
    type BonjourCtor = new () => { publish: (opts: Record<string, unknown>) => Service; destroy: () => void };
    const candidates = mod as unknown as { Bonjour?: BonjourCtor; default?: BonjourCtor | { Bonjour?: BonjourCtor } };
    const fromDefault = typeof candidates.default === 'function'
      ? candidates.default
      : (candidates.default as { Bonjour?: BonjourCtor } | undefined)?.Bonjour;
    const Bonjour = candidates.Bonjour ?? fromDefault;
    if (!Bonjour) throw new Error('bonjour-service: no Bonjour constructor exported');
    const instance = new Bonjour();
    bonjourInstance = instance;

    published = instance.publish({
      name: eventMode.serverName,
      type: 'agentoffice',
      protocol: 'tcp',
      port: config.server.httpPort,
      txt: {
        v: '1',
        eventmode: 'true',
        ws: String(config.server.wsPort),
      },
    });

    console.log(`[mDNS] Broadcasting "${eventMode.serverName}" as _agentoffice._tcp on port ${config.server.httpPort}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[mDNS] Broadcast unavailable (${msg}). Clients will use UDP discovery instead.`);
  }
}

/**
 * Stops the mDNS broadcast cleanly.
 */
export async function stopMdnsBroadcast(): Promise<void> {
  if (published) {
    try {
      const stop = (published as { stop?: () => void }).stop;
      if (typeof stop === 'function') stop.call(published);
    } catch {
      // ignore
    }
    published = null;
  }
  if (bonjourInstance && typeof (bonjourInstance as { destroy?: () => void }).destroy === 'function') {
    try {
      (bonjourInstance as { destroy: () => void }).destroy();
    } catch {
      // ignore
    }
    bonjourInstance = null;
  }
}
