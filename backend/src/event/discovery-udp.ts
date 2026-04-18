import { createSocket, type Socket } from 'dgram';
import { networkInterfaces } from 'os';
import { getConfig } from '../config/config-loader.js';

/** Magic probe sent by clients to discover the server */
const DISCOVER_PROBE = 'AGENT_OFFICE_DISCOVER v1';

let socket: Socket | null = null;

function getPreferredLanAddress(): string {
  const ifaces = networkInterfaces();
  for (const entries of Object.values(ifaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family === 'IPv4' && !entry.internal) {
        return entry.address;
      }
    }
  }
  return '127.0.0.1';
}

function buildResponse(): string {
  const config = getConfig();
  const eventMode = config.eventMode;
  const payload = {
    service: 'agent-office',
    version: 1,
    host: getPreferredLanAddress(),
    httpPort: config.server.httpPort,
    wsPort: config.server.wsPort,
    eventMode: eventMode?.enabled ?? false,
    name: eventMode?.serverName ?? 'Agent Office',
  };
  return JSON.stringify(payload);
}

/**
 * Starts a UDP discovery responder on the configured discovery port.
 * Clients send a plain UDP packet with the probe string; the server
 * replies with a JSON payload describing how to reach it.
 */
export function startUdpDiscovery(): void {
  const config = getConfig();
  const eventMode = config.eventMode;
  if (!eventMode?.enabled) return;
  if (socket) return;

  const port = eventMode.discoveryPort;
  const sock = createSocket({ type: 'udp4', reuseAddr: true });

  sock.on('error', (err) => {
    console.error('[UDPDiscovery] Error:', err.message);
  });

  sock.on('message', (msg, rinfo) => {
    const text = msg.toString('utf-8').trim();
    if (!text.startsWith('AGENT_OFFICE_DISCOVER')) return;

    const response = buildResponse();
    sock.send(response, rinfo.port, rinfo.address, (err) => {
      if (err) {
        console.error(`[UDPDiscovery] Failed to reply to ${rinfo.address}:${rinfo.port}:`, err.message);
      }
    });
  });

  sock.on('listening', () => {
    try {
      sock.setBroadcast(true);
    } catch {
      // ignore - not critical
    }
    const addr = sock.address();
    console.log(`[UDPDiscovery] Listening on ${addr.address}:${addr.port} (expected probe: "${DISCOVER_PROBE}")`);
  });

  sock.bind(port);
  socket = sock;
}

/**
 * Stops the UDP discovery responder.
 */
export function stopUdpDiscovery(): Promise<void> {
  return new Promise((resolve) => {
    if (!socket) {
      resolve();
      return;
    }
    socket.close(() => {
      socket = null;
      resolve();
    });
  });
}
