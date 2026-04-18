import { getConfig } from '../config/config-loader.js';
import { startMdnsBroadcast, stopMdnsBroadcast } from './discovery-mdns.js';
import { startUdpDiscovery, stopUdpDiscovery } from './discovery-udp.js';
import { cleanupAnonymousAuthState } from './anonymous-auth.js';

let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Initializes all event-mode services (discovery, rate-limit cleanup).
 * No-op if event mode is disabled.
 */
export async function initEventMode(): Promise<void> {
  const config = getConfig();
  const eventMode = config.eventMode;
  if (!eventMode?.enabled) return;

  console.log(`[EventMode] Enabled: "${eventMode.serverName}" (max ${eventMode.maxAgents} agents)`);

  await startMdnsBroadcast();
  startUdpDiscovery();

  cleanupInterval = setInterval(() => {
    cleanupAnonymousAuthState();
  }, 60 * 1000);
}

/**
 * Shuts down event-mode services cleanly.
 */
export async function shutdownEventMode(): Promise<void> {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  await stopUdpDiscovery();
  await stopMdnsBroadcast();
}

export { handleAnonymousAuth } from './anonymous-auth.js';
export { handleEventFlush } from './event-admin.js';
export { handleDownloadPage, handleDownloadBinary } from './download.js';
