/**
 * Common types shared across the backend application.
 */

/** Possible states an agent can be in */
export type AgentState = 'WORKING' | 'IDLE' | 'LEAVING';

/** Activities that map to agent states */
export type AgentActivity =
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

/** Available idle action types */
export type IdleActionType = 'get_drink' | 'get_coffee' | 'bouncy_castle';

/** Idle action assignment for an agent */
export interface IdleActionAssignment {
  action: IdleActionType;
  assignedAt: number;
}

/** WebSocket message types from backend to Godot */
export type BackendMessageType = 'spawn_agent' | 'update_agent' | 'remove_agent' | 'sync_complete' | 'trigger_cleaning';

/** WebSocket message types from Godot to backend */
export type GodotMessageType = 'ack' | 'agent_removed';

/** Base WebSocket message structure */
export interface WebSocketMessage<T extends string, P> {
  type: T;
  payload: P;
}

/** Spawn agent payload */
export interface SpawnAgentPayload {
  id: string;
  displayName: string;
  userName: string;
  variantIndex: number;
  state: AgentState;
  /** Detailed activity (e.g. thinking, reading, coding) */
  activity: AgentActivity;
  /** Parent agent ID if this is a sub-agent */
  parentId: string | null;
  /** Whether this is a sidechain (sub-agent) */
  isSidechain: boolean;
  /** Context window usage percentage (0-100) */
  contextPercentage: number;
  /** Currently assigned idle action */
  idleAction: IdleActionAssignment | null;
}

/** Update agent payload */
export interface UpdateAgentPayload {
  id: string;
  state: AgentState;
  /** Detailed activity (e.g. thinking, reading, coding) */
  activity: AgentActivity;
  /** Context window usage percentage (0-100) */
  contextPercentage: number;
  /** Currently assigned idle action */
  idleAction: IdleActionAssignment | null;
}

/** Remove agent payload */
export interface RemoveAgentPayload {
  id: string;
}

/** Trigger cleaning payload - signals Godot to start vacuum cleaning */
export interface TriggerCleaningPayload {}

/** Sync complete payload - sent after all spawn_agent messages during initial sync */
export interface SyncCompletePayload {
  /** Array of all active agent IDs in the backend */
  agentIds: string[];
  /** Number of cans dropped since last cleaning */
  canCount: number;
  /** Event-mode download URL (audience client). Undefined when event-mode is off. */
  downloadUrl?: string;
}

/** Ack payload from Godot */
export interface AckPayload {
  command: BackendMessageType;
  id: string;
  success: boolean;
}

/** Agent removed payload from Godot */
export interface AgentRemovedPayload {
  id: string;
}

/** Backend to Godot messages */
export type BackendToGodotMessage =
  | WebSocketMessage<'spawn_agent', SpawnAgentPayload>
  | WebSocketMessage<'update_agent', UpdateAgentPayload>
  | WebSocketMessage<'remove_agent', RemoveAgentPayload>
  | WebSocketMessage<'sync_complete', SyncCompletePayload>
  | WebSocketMessage<'user_stats', UserStatsPayload>
  | WebSocketMessage<'trigger_cleaning', TriggerCleaningPayload>;

/** User stats for a single user */
export interface UserStats {
  displayName: string;
  sessionCount: number;
  agentCount: number;
  isActive: boolean;
  totalInputTokens: number;
  totalOutputTokens: number;
  outputTokensPerHour: number;
  dailyAgentSpawns: number;
  dailySycophancyCount: number;
}

/** User stats payload sent to clients */
export interface UserStatsPayload {
  users: UserStats[];
  totals: {
    activeUsers: number;
    totalSessions: number;
    totalAgents: number;
    viewerCount: number;
  };
}

/** Godot to Backend messages */
export type GodotToBackendMessage =
  | WebSocketMessage<'ack', AckPayload>
  | WebSocketMessage<'agent_removed', AgentRemovedPayload>;

/** Configuration user entry */
export interface ConfigUser {
  key: string;
  displayName: string;
}

/** Server configuration */
export interface ServerConfig {
  httpPort: number;
  wsPort: number;
}

/** Event mode configuration - enables anonymous auth and LAN discovery */
export interface EventModeConfig {
  /** Whether event mode is enabled */
  enabled: boolean;
  /** Friendly name for the server (shown in mDNS and discovery responses) */
  serverName: string;
  /** Admin token for DELETE /event/flush endpoint (header: X-Event-Admin) */
  adminToken?: string;
  /** UDP port for broadcast discovery responder (default: 3102) */
  discoveryPort: number;
  /** Max anonymous agents allowed concurrently */
  maxAgents: number;
  /** Rate limit: max anonymous auth requests per IP per minute */
  authRateLimit: number;
}

/** Full application configuration */
export interface AppConfig {
  users: ConfigUser[];
  server: ServerConfig;
  tokenExpirySeconds: number;
  /** Seconds of inactivity before agents are removed (0 = disabled) */
  inactivityTimeoutSeconds: number;
  /** Event mode configuration (optional, defaults to disabled) */
  eventMode?: EventModeConfig;
}
