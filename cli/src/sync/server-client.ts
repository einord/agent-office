import type { TrackedSession, ActivityType } from '../types.js';
import { generateName } from '../ui/name-generator.js';

/**
 * Configuration for the server client.
 */
export interface ServerClientConfig {
  /** Base URL for the backend server (e.g., http://localhost:3100) */
  serverUrl: string;
  /** API key for authentication */
  apiKey: string;
}

/**
 * Activity type mapping from CLI to backend.
 * CLI uses different activity names than the backend API.
 */
type BackendActivity =
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

/**
 * Maps CLI activity types to backend activity types.
 * @param activity - The CLI activity type
 * @returns The corresponding backend activity
 */
function mapActivityToBackend(activity: ActivityType): BackendActivity {
  switch (activity) {
    case 'reading':
      return 'reading';
    case 'writing':
      return 'writing';
    case 'running_command':
      return 'working';
    case 'spawning_agent':
      return 'working';
    case 'searching':
      return 'reading';
    case 'waiting_input':
      return 'waiting';
    case 'thinking':
      return 'thinking';
    case 'done':
      return 'done';
    case 'idle':
      return 'idle';
    default:
      return 'idle';
  }
}

/**
 * Authentication response from the server.
 */
interface AuthResponse {
  token: string;
  displayName: string;
  expiresAt: string;
}

/**
 * Agent response from the server.
 */
interface AgentResponse {
  id: string;
  displayName: string;
  variantIndex: number;
  activity: BackendActivity;
  state: string;
  userName: string;
}

/**
 * Result of a request, including status information.
 */
interface RequestResult<T> {
  data: T | null;
  notFound: boolean;
  conflict: boolean;
}

/**
 * HTTP client for synchronizing agent status with the backend server.
 * Handles authentication, agent creation, updates, and removal.
 */
export class ServerClient {
  private config: ServerClientConfig;
  private token: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private syncedAgents: Set<string> = new Set();
  private lastActivityMap: Map<string, BackendActivity> = new Map();
  private lastContextMap: Map<string, number> = new Map();

  /**
   * Creates a new ServerClient instance.
   * @param config - Configuration with server URL and API key
   */
  constructor(config: ServerClientConfig) {
    this.config = config;
  }

  /**
   * Authenticates with the backend server and obtains a session token.
   * The token is cached and reused until it expires.
   * @returns True if authentication was successful
   */
  private async authenticate(): Promise<boolean> {
    // Check if we have a valid token
    if (this.token && this.tokenExpiresAt && this.tokenExpiresAt > new Date()) {
      return true;
    }

    try {
      const response = await fetch(`${this.config.serverUrl}/auth`, {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey: this.config.apiKey }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error(`[ServerClient] Authentication failed: ${error.error || response.statusText}`);
        return false;
      }

      const data = (await response.json()) as AuthResponse;
      this.token = data.token;
      this.tokenExpiresAt = new Date(data.expiresAt);

      console.log(`[ServerClient] Authenticated as ${data.displayName}`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('fetch failed') || message.includes('ECONNREFUSED')) {
        console.error(`[ServerClient] Cannot connect to server at ${this.config.serverUrl} - is the backend running?`);
      } else {
        console.error(`[ServerClient] Authentication error: ${message}`);
      }
      return false;
    }
  }

  /**
   * Makes an authenticated request to the backend server.
   * Automatically handles token refresh if needed.
   * @param endpoint - API endpoint (e.g., '/agents')
   * @param options - Fetch options
   * @param context - Optional context for error messages (e.g., agent ID)
   * @returns The response with status info
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    context?: string,
    retryCount: number = 0
  ): Promise<RequestResult<T>> {
    // Ensure we're authenticated
    const authenticated = await this.authenticate();
    if (!authenticated) {
      return { data: null, notFound: false, conflict: false };
    }

    try {
      const response = await fetch(`${this.config.serverUrl}${endpoint}`, {
        ...options,
        signal: AbortSignal.timeout(10_000),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
          ...options.headers,
        },
      });

      if (!response.ok) {
        // If unauthorized, clear token and retry (max 3 attempts)
        if (response.status === 401 && retryCount < 3) {
          this.token = null;
          this.tokenExpiresAt = null;
          const reauthenticated = await this.authenticate();
          if (reauthenticated) {
            return this.request<T>(endpoint, options, context, retryCount + 1);
          }
        }

        // Check for 404 (not found)
        if (response.status === 404) {
          return { data: null, notFound: true, conflict: false };
        }

        // Check for 409 (conflict / already exists)
        if (response.status === 409) {
          return { data: null, notFound: false, conflict: true };
        }

        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        const contextStr = context ? ` (${context})` : '';
        console.error(`[ServerClient] Request failed${contextStr} [${response.status}] ${endpoint}: ${error.error || response.statusText}`);
        return { data: null, notFound: false, conflict: false };
      }

      return { data: (await response.json()) as T, notFound: false, conflict: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('fetch failed') || message.includes('ECONNREFUSED')) {
        console.error(`[ServerClient] Connection lost to ${this.config.serverUrl}`);
      } else {
        console.error(`[ServerClient] Request error: ${message}`);
      }
      return { data: null, notFound: false, conflict: false };
    }
  }

  /**
   * Creates a new agent on the backend server.
   * @param session - The tracked session to create an agent for
   * @returns True if the agent was created successfully
   */
  async createAgent(session: TrackedSession, depth: number = 0): Promise<boolean> {
    const activity = mapActivityToBackend(session.activity.type);
    const displayName = session.isSidechain && session.parentSessionId
      ? generateName(session.parentSessionId)
      : generateName(session.agentId);

    // Use agentId as the unique identifier (same as sessionId for main sessions)
    const id = session.agentId;

    console.log(`[ServerClient] Creating agent: id=${id}, displayName=${displayName}, activity=${activity}, isSidechain=${session.isSidechain}, parentId=${session.parentSessionId || 'none'}`);

    const result = await this.request<AgentResponse>('/agents', {
      method: 'POST',
      body: JSON.stringify({
        id,
        displayName,
        activity,
        parentId: session.parentSessionId || null,
        isSidechain: session.isSidechain,
        contextPercentage: session.tokens.percentage,
      }),
    });

    if (result.data) {
      this.syncedAgents.add(id);
      this.lastActivityMap.set(id, activity);
      this.lastContextMap.set(id, session.tokens.percentage);
      console.log(`[ServerClient] Created agent: ${id} (${session.slug})`);
      return true;
    }

    // Agent already exists on server (e.g. from a previous CLI session) -
    // mark as synced and update instead of repeatedly trying to create
    if (result.conflict && depth < 3) {
      console.log(`[ServerClient] Agent already exists on server, switching to update: ${id}`);
      this.syncedAgents.add(id);
      return this.updateAgent(session, depth + 1);
    }

    return false;
  }

  /**
   * Updates an agent's activity on the backend server.
   * If the agent is not found (404), it will be recreated automatically.
   * @param session - The tracked session to update
   * @returns True if the agent was updated successfully
   */
  async updateAgent(session: TrackedSession, depth: number = 0): Promise<boolean> {
    const activity = mapActivityToBackend(session.activity.type);
    const id = session.agentId;

    // Skip if neither activity nor context percentage have changed
    const lastActivity = this.lastActivityMap.get(id);
    const contextPercentage = session.tokens.percentage;
    const lastContext = this.lastContextMap.get(id);
    if (lastActivity === activity && lastContext === contextPercentage) {
      return true;
    }

    const result = await this.request<AgentResponse>(
      `/agents/${id}`,
      { method: 'PUT', body: JSON.stringify({ activity, contextPercentage }) },
      `agent: ${id}`
    );

    if (result.data) {
      this.lastActivityMap.set(id, activity);
      this.lastContextMap.set(id, contextPercentage);
      console.log(`[ServerClient] Updated agent: ${id} -> ${activity}`);
      return true;
    }

    // If agent not found on server, recreate it (unless it's done - no point spawning a finished agent)
    if (result.notFound && depth < 3) {
      this.syncedAgents.delete(id);
      this.lastActivityMap.delete(id);
      this.lastContextMap.delete(id);
      if (activity === 'done') {
        return true;
      }
      console.log(`[ServerClient] Agent not found on server, recreating: ${id}`);
      return this.createAgent(session, depth + 1);
    }

    return false;
  }

  /**
   * Removes an agent from the backend server.
   * @param sessionId - The session ID of the agent to remove
   * @returns True if the agent was removed successfully
   */
  async removeAgent(sessionId: string): Promise<boolean> {
    const result = await this.request<{ message: string; id: string }>(
      `/agents/${sessionId}`,
      { method: 'DELETE' },
      `agent: ${sessionId}`
    );

    // Consider it successful if agent was deleted or didn't exist
    if (result.data || result.notFound) {
      this.syncedAgents.delete(sessionId);
      this.lastActivityMap.delete(sessionId);
      this.lastContextMap.delete(sessionId);
      if (result.data) {
        console.log(`[ServerClient] Removed agent: ${sessionId}`);
      }
      return true;
    }

    return false;
  }

  /**
   * Sends a heartbeat to the backend to keep the session alive.
   * Used when no other API calls were made during a sync cycle.
   */
  private async heartbeat(): Promise<void> {
    await this.request('/heartbeat', { method: 'POST' });
  }

  /**
   * Synchronizes all tracked sessions with the backend server.
   * Creates new agents, updates existing ones, and removes stale ones.
   * Sends a heartbeat if no API calls were made but agents are synced.
   * @param sessions - Map of agent IDs to tracked sessions
   */
  async syncAll(sessions: Map<string, TrackedSession>): Promise<void> {
    let madeApiCall = false;

    // Find agents to remove (synced but no longer in sessions)
    const agentsToRemove = new Set<string>();
    for (const syncedId of this.syncedAgents) {
      if (!sessions.has(syncedId)) {
        agentsToRemove.add(syncedId);
      }
    }

    // Remove stale agents
    for (const agentId of agentsToRemove) {
      await this.removeAgent(agentId);
      madeApiCall = true;
    }

    // Create or update agents (keyed by agentId)
    for (const [agentId, session] of sessions) {
      if (this.syncedAgents.has(agentId)) {
        // Update existing agent (returns true even if skipped due to no change)
        const activity = mapActivityToBackend(session.activity.type);
        const lastActivity = this.lastActivityMap.get(agentId);
        const lastContext = this.lastContextMap.get(agentId);
        if (lastActivity !== activity || lastContext !== session.tokens.percentage) {
          await this.updateAgent(session);
          madeApiCall = true;
        }
      } else {
        // Don't create agents that are already done (prevents zombie re-discovery from disk)
        const activity = mapActivityToBackend(session.activity.type);
        if (activity === 'done') continue;

        // Create new agent
        await this.createAgent(session);
        madeApiCall = true;
      }
    }

    // If no API calls were made but we have synced agents, send heartbeat
    if (!madeApiCall && this.syncedAgents.size > 0) {
      await this.heartbeat();
    }
  }

  /**
   * Checks if an agent is currently synced with the server.
   * @param sessionId - The session ID to check
   * @returns True if the agent is synced
   */
  isSynced(sessionId: string): boolean {
    return this.syncedAgents.has(sessionId);
  }

  /**
   * Gets the set of currently synced agent IDs.
   * @returns Set of synced session IDs
   */
  getSyncedAgents(): Set<string> {
    return new Set(this.syncedAgents);
  }
}
