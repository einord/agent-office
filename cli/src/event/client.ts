/**
 * HTTP client for the event server: anonymous auth + agent CRUD.
 *
 * Maintains a Map<agentId, SyncedState> so that the event client can represent
 * multiple concurrent sessions (including sub-agents) per user — mirrors the
 * main CLI's ServerClient but talking to /auth/anonymous instead of /auth.
 */

import { generateName } from '../ui/name-generator.js';
import { mapActivity } from './activity-mapper.js';
import type { SessionActivity } from './session-watcher.js';

export type EventActivity =
  | 'thinking'
  | 'working'
  | 'coding'
  | 'reading'
  | 'writing'
  | 'done'
  | 'idle'
  | 'waiting'
  | 'paused'
  | 'leaving'
  | 'offline'
  | 'disconnected';

export interface EventClientConfig {
  serverUrl: string;
  userKey: string;
  displayName: string;
}

interface AuthResponse {
  token: string;
  displayName: string;
  expiresAt: string;
}

/** Snapshot of what we last told the server about an agent. */
interface SyncedAgentState {
  activity: EventActivity;
  contextPercentage: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  sycophancyCount: number;
}

const REQUEST_TIMEOUT_MS = 8_000;

export class EventClient {
  private serverUrl: string;
  private userKey: string;
  private displayName: string;
  private token: string | null = null;
  private tokenExpiresAt: Date | null = null;
  /** Map from agentId → last-synced state. Presence means the server has the agent. */
  private syncedAgents: Map<string, SyncedAgentState> = new Map();

  constructor(config: EventClientConfig) {
    this.serverUrl = config.serverUrl.replace(/\/+$/, '');
    this.userKey = config.userKey;
    this.displayName = config.displayName;
  }

  /**
   * Updates the server URL — useful after a reconnect that picked a new server.
   * Forces a re-auth on next request.
   */
  setServerUrl(url: string): void {
    const next = url.replace(/\/+$/, '');
    if (next === this.serverUrl) return;
    this.serverUrl = next;
    this.token = null;
    this.tokenExpiresAt = null;
    this.syncedAgents.clear();
  }

  getServerUrl(): string {
    return this.serverUrl;
  }

  getDisplayName(): string {
    return this.displayName;
  }

  /**
   * Ensures we have a valid token. Re-authenticates if needed.
   */
  private async authenticate(): Promise<void> {
    if (this.token && this.tokenExpiresAt && this.tokenExpiresAt.getTime() - Date.now() > 60_000) {
      return;
    }

    const response = await fetch(`${this.serverUrl}/auth/anonymous`, {
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userKey: this.userKey, displayName: this.displayName }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      this.token = null;
      this.tokenExpiresAt = null;
      throw new Error(`Auth failed (${response.status}): ${err.error ?? 'unknown'}`);
    }

    const data = (await response.json()) as AuthResponse;
    this.token = data.token;
    this.tokenExpiresAt = new Date(data.expiresAt);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<{ status: number; data: T | null }> {
    await this.authenticate();

    const response = await fetch(`${this.serverUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
        ...(init.headers ?? {}),
      },
    });

    if (response.status === 401) {
      this.token = null;
      this.tokenExpiresAt = null;
      return { status: 401, data: null };
    }

    let data: T | null = null;
    try {
      data = (await response.json()) as T;
    } catch {
      data = null;
    }
    return { status: response.status, data };
  }

  /**
   * Reconciles the server's view of this user's agents with the supplied local
   * sessions. Creates new agents, updates changed ones, removes missing ones,
   * and sends a heartbeat when nothing changed (keeps the session alive).
   */
  async syncSessions(sessions: SessionActivity[]): Promise<void> {
    let madeApiCall = false;

    // Delete agents that are no longer present locally
    const incomingIds = new Set(sessions.map((s) => s.agentId));
    for (const syncedId of [...this.syncedAgents.keys()]) {
      if (!incomingIds.has(syncedId)) {
        await this.deleteAgent(syncedId);
        madeApiCall = true;
      }
    }

    // Create or update each active session. Isolate failures per session so
    // one bad agent doesn't stall the whole batch — network/auth failures
    // still bubble up so the monitor can trigger a reconnect.
    let transientError: Error | null = null;
    for (const session of sessions) {
      try {
        const changed = await this.syncOne(session);
        if (changed) madeApiCall = true;
      } catch (err) {
        const wrapped = err instanceof Error ? err : new Error(String(err));
        if (isConnectionError(wrapped)) {
          transientError = wrapped;
          break;
        }
        console.error(`[EventClient] syncOne failed for ${session.agentId}: ${wrapped.message}`);
      }
    }

    if (transientError) throw transientError;

    // Keep the token alive when nothing changed
    if (!madeApiCall) {
      await this.heartbeat();
    }
  }

  private async syncOne(session: SessionActivity, depth = 0): Promise<boolean> {
    if (depth > 3) {
      throw new Error(`syncOne: too many recreate attempts for ${session.agentId}`);
    }

    const activity = mapActivity(session.activity);
    const state: SyncedAgentState = {
      activity,
      contextPercentage: session.contextPercentage,
      totalInputTokens: session.totalInputTokens,
      totalOutputTokens: session.totalOutputTokens,
      sycophancyCount: session.sycophancyCount,
    };

    const existing = this.syncedAgents.get(session.agentId);
    if (!existing) {
      // Don't create agents that are already finished — mirrors main CLI behaviour
      if (activity === 'done') return false;
      return this.createAgent(session, state, depth);
    }

    // Skip the API call when nothing changed
    if (sameState(existing, state)) return false;

    return this.updateAgent(session, state, depth);
  }

  private async createAgent(session: SessionActivity, state: SyncedAgentState, depth: number): Promise<boolean> {
    const displayName = session.isSidechain && session.parentSessionId
      ? generateName(session.parentSessionId)
      : generateName(session.agentId);

    const result = await this.request<{ id: string }>('/agents', {
      method: 'POST',
      body: JSON.stringify({
        id: session.agentId,
        displayName,
        activity: state.activity,
        contextPercentage: state.contextPercentage,
        parentId: session.parentSessionId,
        isSidechain: session.isSidechain,
        totalInputTokens: state.totalInputTokens,
        totalOutputTokens: state.totalOutputTokens,
        sycophancyCount: state.sycophancyCount,
      }),
    });

    if (result.status === 201) {
      this.syncedAgents.set(session.agentId, state);
      return true;
    }

    // Agent already exists on server (e.g. a previous session didn't clean up).
    // Mark it as synced and follow up with an update so the server reflects
    // the current state instead of whatever was left behind.
    if (result.status === 409) {
      this.syncedAgents.set(session.agentId, state);
      await this.updateAgent(session, state, depth + 1);
      return true;
    }

    throw new Error(`Failed to create agent ${session.agentId} (status ${result.status})`);
  }

  private async updateAgent(session: SessionActivity, state: SyncedAgentState, depth: number): Promise<boolean> {
    const result = await this.request<unknown>(
      `/agents/${encodeURIComponent(session.agentId)}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          activity: state.activity,
          contextPercentage: state.contextPercentage,
          totalInputTokens: state.totalInputTokens,
          totalOutputTokens: state.totalOutputTokens,
          sycophancyCount: state.sycophancyCount,
        }),
      },
    );

    if (result.status === 200) {
      this.syncedAgents.set(session.agentId, state);
      return true;
    }

    if (result.status === 404) {
      // Server lost the agent (restart/flush). No point recreating a session
      // that's already done — just drop the local record.
      this.syncedAgents.delete(session.agentId);
      if (state.activity === 'done') return true;
      return this.syncOne(session, depth + 1);
    }

    throw new Error(`Failed to update agent ${session.agentId} (status ${result.status})`);
  }

  private async deleteAgent(agentId: string): Promise<void> {
    try {
      await this.request(`/agents/${encodeURIComponent(agentId)}`, { method: 'DELETE' });
    } catch {
      // Ignore — the map entry is cleared either way so we won't retry forever
    }
    this.syncedAgents.delete(agentId);
  }

  /**
   * Sends a heartbeat to keep the session alive when nothing else changed.
   */
  async heartbeat(): Promise<void> {
    await this.request('/heartbeat', { method: 'POST' });
  }

  /**
   * Best-effort removal of every known agent on shutdown.
   */
  async removeAllAgents(): Promise<void> {
    const ids = [...this.syncedAgents.keys()];
    for (const id of ids) {
      await this.deleteAgent(id);
    }
  }

  /**
   * Reset internal state without contacting the server.
   * Used when the network or server seems unreachable.
   */
  invalidate(): void {
    this.token = null;
    this.tokenExpiresAt = null;
    this.syncedAgents.clear();
  }
}

function sameState(a: SyncedAgentState, b: SyncedAgentState): boolean {
  return (
    a.activity === b.activity &&
    a.contextPercentage === b.contextPercentage &&
    a.totalInputTokens === b.totalInputTokens &&
    a.totalOutputTokens === b.totalOutputTokens &&
    a.sycophancyCount === b.sycophancyCount
  );
}

/**
 * Heuristic: does this error look like a network / auth problem rather than
 * a per-agent server-side error? Used to decide whether to bail the whole
 * sync batch (and trigger a reconnect) vs. skip a single agent.
 */
function isConnectionError(err: Error): boolean {
  const msg = err.message.toLowerCase();
  return (
    msg.includes('auth failed') ||
    msg.includes('fetch failed') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('timeout') ||
    msg.includes('aborted') ||
    msg.includes('network')
  );
}
