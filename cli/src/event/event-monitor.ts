/**
 * Event-mode monitor: ties together the SessionWatcher (local Claude Code activity)
 * and the EventClient (talks to the server), with a small reconnect/heartbeat loop.
 */

import { EventClient, type EventActivity } from './client.js';
import { SessionWatcher, type ActivitySnapshot } from './session-watcher.js';
import { discoverServer } from './discovery.js';
import { mapActivity, activityLabelSv } from './activity-mapper.js';

/** How often to send a heartbeat when nothing else changes */
const HEARTBEAT_INTERVAL_MS = 30_000;

/** Initial backoff after a failure */
const INITIAL_BACKOFF_MS = 2_000;

/** Cap on backoff between reconnect attempts */
const MAX_BACKOFF_MS = 30_000;

/** After this many consecutive failures, try fresh discovery in case the server moved */
const FAILURES_BEFORE_REDISCOVERY = 4;

export interface EventMonitorOptions {
  client: EventClient;
  watcher: SessionWatcher;
  /** Called whenever the displayed connection status should change */
  onStatusChange?: (status: ConnectionStatus) => void;
}

export interface ConnectionStatus {
  connected: boolean;
  serverUrl: string;
  activity: EventActivity;
  message: string;
}

export class EventMonitor {
  private client: EventClient;
  private watcher: SessionWatcher;
  private onStatusChange: (status: ConnectionStatus) => void;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connected = false;
  private failureCount = 0;
  private currentActivity: EventActivity = 'idle';
  private currentContext = 0;
  private currentSessionId: string | null = null;
  private stopped = false;

  constructor(opts: EventMonitorOptions) {
    this.client = opts.client;
    this.watcher = opts.watcher;
    this.onStatusChange = opts.onStatusChange ?? (() => {});
  }

  async start(): Promise<void> {
    this.watcher.onActivityChange((snap) => this.handleSnapshot(snap));
    await this.watcher.start();

    // Pick up whatever the watcher saw during start()
    const initial = this.watcher.getSnapshot();
    this.currentActivity = mapActivity(initial.type);
    this.currentContext = initial.contextPercentage;
    this.currentSessionId = initial.sessionId;

    await this.connectLoop();

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat().catch(() => {
        // failures are surfaced through the connect loop
      });
    }, HEARTBEAT_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.watcher.stop();
    if (this.connected) {
      await this.client.removeAgent();
    }
  }

  private handleSnapshot(snap: ActivitySnapshot): void {
    this.currentActivity = mapActivity(snap.type);
    this.currentContext = snap.contextPercentage;
    this.currentSessionId = snap.sessionId;
    this.pushActivity().catch(() => {
      // Failures schedule a reconnect via the catch in pushActivity
    });
  }

  private async pushActivity(): Promise<void> {
    if (this.stopped) return;
    try {
      await this.client.ensureAgent(this.currentActivity, this.currentContext, this.currentSessionId);
      this.markConnected();
    } catch (err) {
      this.markDisconnected(err);
    }
  }

  private async sendHeartbeat(): Promise<void> {
    if (this.stopped) return;
    try {
      // Re-assert activity (catches server restarts that lose the agent)
      await this.client.ensureAgent(this.currentActivity, this.currentContext, this.currentSessionId);
      this.markConnected();
    } catch (err) {
      this.markDisconnected(err);
    }
  }

  private markConnected(): void {
    const wasConnected = this.connected;
    this.connected = true;
    this.failureCount = 0;
    if (wasConnected) {
      this.emitStatus(`Ansluten. Aktivitet: ${activityLabelSv(this.currentActivity)}.`);
    } else {
      this.emitStatus(`Ansluten som ${this.client.getDisplayName()}. Aktivitet: ${activityLabelSv(this.currentActivity)}.`);
    }
  }

  private markDisconnected(err: unknown): void {
    this.connected = false;
    this.failureCount++;
    const reason = err instanceof Error ? err.message : String(err);
    this.emitStatus(`Tappade kontakt med servern (${reason}). Försöker igen…`);
    this.scheduleReconnect();
  }

  private emitStatus(message: string): void {
    this.onStatusChange({
      connected: this.connected,
      serverUrl: this.client.getServerUrl(),
      activity: this.currentActivity,
      message,
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.stopped) return;
    const backoff = Math.min(MAX_BACKOFF_MS, INITIAL_BACKOFF_MS * 2 ** Math.min(6, this.failureCount - 1));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectLoop().catch(() => {
        // Errors are already surfaced through markDisconnected
      });
    }, backoff);
  }

  private async connectLoop(): Promise<void> {
    if (this.stopped) return;

    if (this.failureCount >= FAILURES_BEFORE_REDISCOVERY) {
      this.emitStatus('Letar efter servern på nätverket igen…');
      const found = await discoverServer(4_000);
      if (found) {
        this.client.invalidate();
        this.client.setServerUrl(found.serverUrl);
        this.emitStatus(`Hittade servern på ${found.serverUrl}. Återansluter…`);
      }
    }

    try {
      await this.client.ensureAgent(this.currentActivity, this.currentContext, this.currentSessionId);
      this.markConnected();
    } catch (err) {
      this.markDisconnected(err);
    }
  }
}
