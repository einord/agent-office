/**
 * HTTP client for the event server: anonymous auth + agent CRUD.
 * Mirrors `sync/server-client.ts` but without API key handling and
 * using a single persistent agent per client.
 */

import { generateName } from '../ui/name-generator.js';

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

const REQUEST_TIMEOUT_MS = 8_000;

export class EventClient {
  private serverUrl: string;
  private userKey: string;
  private displayName: string;
  private token: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private agentCreated = false;
  private lastActivity: EventActivity | null = null;
  /**
   * Display name currently set on the server for the agent. Derived from
   * the active Claude session ID (generateName(sessionId)) — falls back to
   * generateName(userKey) when no session is active. We track it so we
   * can DELETE+POST the agent when the session changes (the backend's
   * PUT /agents/:id doesn't allow changing displayName).
   */
  private currentAgentName: string | null = null;
  private lastTotalInputTokens: number | null = null;
  private lastTotalOutputTokens: number | null = null;
  private lastSycophancyCount: number | null = null;
  private lastContextPercentage: number | null = null;

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
    this.agentCreated = false;
    this.lastActivity = null;
    this.currentAgentName = null;
    this.lastTotalInputTokens = null;
    this.lastTotalOutputTokens = null;
    this.lastSycophancyCount = null;
    this.lastContextPercentage = null;
  }

  getServerUrl(): string {
    return this.serverUrl;
  }

  getAgentId(): string {
    return this.userKey;
  }

  getDisplayName(): string {
    return this.displayName;
  }

  /**
   * Ensures we have a valid token. Re-authenticates if needed.
   * Returns true on success.
   */
  private async authenticate(): Promise<boolean> {
    if (this.token && this.tokenExpiresAt && this.tokenExpiresAt.getTime() - Date.now() > 60_000) {
      return true;
    }

    try {
      const response = await fetch(`${this.serverUrl}/auth/anonymous`, {
        method: 'POST',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userKey: this.userKey, displayName: this.displayName }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(`Auth failed (${response.status}): ${err.error ?? 'unknown'}`);
      }

      const data = (await response.json()) as AuthResponse;
      this.token = data.token;
      this.tokenExpiresAt = new Date(data.expiresAt);
      return true;
    } catch (err) {
      this.token = null;
      this.tokenExpiresAt = null;
      throw err;
    }
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<{ status: number; data: T | null }> {
    const ok = await this.authenticate();
    if (!ok) return { status: 0, data: null };

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
   * Reconciles the remote agent with the local state. Called whenever the
   * SessionWatcher emits a snapshot.
   *
   * - If no Claude session is active (sessionId === null): ensures no agent
   *   exists on the server. The client stays connected (token is kept alive
   *   via heartbeat) but the user doesn't appear on the big screen until
   *   they actually start Claude Code — matches the main CLI's behaviour.
   * - If a session is active: ensures an agent exists with the right
   *   displayName (generateName(sessionId)) and activity. On session
   *   switches, DELETE + POST so the name on the big screen updates.
   */
  async ensureAgent(
    activity: EventActivity,
    contextPercentage: number = 0,
    sessionId: string | null = null,
    depth: number = 0,
    tokens?: { totalInputTokens: number; totalOutputTokens: number; sycophancyCount: number },
  ): Promise<void> {
    // Cap recursion: the 404 → recreate path below calls ensureAgent again,
    // which in turn may hit 404 again if the server is in a bad state. A
    // simple depth counter prevents us from growing the call stack forever
    // and hanging the client mid-event.
    if (depth > 3) {
      throw new Error('ensureAgent: too many recreate attempts — giving up for now');
    }
    if (sessionId === null) {
      // No active session → tear down any existing agent and stop.
      if (this.agentCreated) {
        await this.request(`/agents/${encodeURIComponent(this.userKey)}`, { method: 'DELETE' });
        this.agentCreated = false;
        this.lastActivity = null;
        this.currentAgentName = null;
      }
      return;
    }

    const desiredName = generateName(sessionId);

    // Session switch → rename via DELETE + POST (backend PUT can't rename).
    if (this.agentCreated && this.currentAgentName !== null && this.currentAgentName !== desiredName) {
      await this.request(`/agents/${encodeURIComponent(this.userKey)}`, { method: 'DELETE' });
      this.agentCreated = false;
      this.lastActivity = null;
      this.currentAgentName = null;
    }

    if (!this.agentCreated) {
      const created = await this.request<{ id: string }>('/agents', {
        method: 'POST',
        body: JSON.stringify({
          id: this.userKey,
          displayName: desiredName,
          activity,
          contextPercentage,
          parentId: null,
          isSidechain: false,
          ...(tokens ?? {}),
        }),
      });

      // 201 = created. 409 = already exists from a previous session — fine, fall through.
      if (created.status === 201 || created.status === 409) {
        this.agentCreated = true;
        this.lastActivity = activity;
        this.currentAgentName = desiredName;
        if (created.status === 201) return;
      } else {
        throw new Error(`Failed to create agent (status ${created.status})`);
      }
    }

    const tokensChanged =
      tokens !== undefined && (
        tokens.totalInputTokens !== this.lastTotalInputTokens ||
        tokens.totalOutputTokens !== this.lastTotalOutputTokens ||
        tokens.sycophancyCount !== this.lastSycophancyCount
      );
    const contextChanged = contextPercentage !== this.lastContextPercentage;

    if (this.lastActivity === activity && !tokensChanged && !contextChanged) return;

    const updated = await this.request<unknown>(`/agents/${encodeURIComponent(this.userKey)}`, {
      method: 'PUT',
      body: JSON.stringify({ activity, contextPercentage, ...(tokens ?? {}) }),
    });

    if (updated.status === 200) {
      this.lastActivity = activity;
      this.lastContextPercentage = contextPercentage;
      if (tokens) {
        this.lastTotalInputTokens = tokens.totalInputTokens;
        this.lastTotalOutputTokens = tokens.totalOutputTokens;
        this.lastSycophancyCount = tokens.sycophancyCount;
      }
      return;
    }

    if (updated.status === 404) {
      // Server lost the agent (restart, flush) - recreate
      this.agentCreated = false;
      await this.ensureAgent(activity, contextPercentage, sessionId, depth + 1, tokens);
      return;
    }

    throw new Error(`Failed to update agent (status ${updated.status})`);
  }

  /**
   * Sends a heartbeat to keep the session alive when nothing else changed.
   */
  async heartbeat(): Promise<void> {
    await this.request('/heartbeat', { method: 'POST' });
  }

  /**
   * Best-effort agent removal on shutdown.
   */
  async removeAgent(): Promise<void> {
    if (!this.agentCreated) return;
    try {
      await this.request(`/agents/${encodeURIComponent(this.userKey)}`, { method: 'DELETE' });
    } catch {
      // ignore - shutdown path
    }
    this.agentCreated = false;
  }

  /**
   * Reset internal state without contacting the server.
   * Used when the network or server seems unreachable.
   */
  invalidate(): void {
    this.token = null;
    this.tokenExpiresAt = null;
    this.agentCreated = false;
    this.lastActivity = null;
    this.currentAgentName = null;
    this.lastTotalInputTokens = null;
    this.lastTotalOutputTokens = null;
    this.lastSycophancyCount = null;
    this.lastContextPercentage = null;
  }
}
