import type { AgentState, AgentActivity } from '../types.js';

/**
 * Represents an agent in the system.
 */
export interface Agent {
  /** Unique identifier for the agent */
  id: string;
  /** Display name for the agent (per-agent, not owner name) */
  displayName: string;
  /** Index of the sprite variant to use (0-based) */
  variantIndex: number;
  /** Current activity the agent is performing */
  activity: AgentActivity;
  /** Current state derived from activity */
  state: AgentState;
  /** Owner user's API key */
  ownerKey: string;
  /** Owner user's display name */
  ownerDisplayName: string;
  /** Timestamp when the agent was created */
  createdAt: number;
  /** Timestamp when the agent was last updated */
  updatedAt: number;
  /** Parent agent ID if this is a sub-agent */
  parentId: string | null;
  /** Whether this is a sidechain (sub-agent) */
  isSidechain: boolean;
}

/**
 * Request body for creating a new agent.
 */
export interface CreateAgentRequest {
  /** Unique identifier for the agent */
  id: string;
  /** Display name for the agent */
  displayName: string;
  /** Initial activity for the agent */
  activity: AgentActivity;
  /** Optional variant index (random if not provided) */
  variantIndex?: number;
  /** Parent agent ID if this is a sub-agent */
  parentId?: string | null;
  /** Whether this is a sidechain (sub-agent) */
  isSidechain?: boolean;
}

/**
 * Request body for updating an agent.
 */
export interface UpdateAgentRequest {
  /** New activity for the agent */
  activity: AgentActivity;
}

/**
 * Response body for agent operations.
 */
export interface AgentResponse {
  /** The agent's unique identifier */
  id: string;
  /** The agent's display name */
  displayName: string;
  /** The agent's sprite variant index */
  variantIndex: number;
  /** The agent's current activity */
  activity: AgentActivity;
  /** The agent's current state */
  state: AgentState;
  /** The owner's display name */
  userName: string;
  /** Parent agent ID if this is a sub-agent */
  parentId: string | null;
  /** Whether this is a sidechain (sub-agent) */
  isSidechain: boolean;
}

/**
 * Callback type for agent state change notifications.
 */
export type AgentChangeCallback = (
  type: 'spawn' | 'update' | 'remove',
  agent: Agent
) => void;
