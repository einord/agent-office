import type { AgentActivity } from '../types.js';
import type { Agent, AgentChangeCallback } from './types.js';
import { mapActivityToState } from './state-mapper.js';

/** In-memory storage for agents */
const agents = new Map<string, Agent>();

/** Accumulated tokens for users whose agents have been removed */
const userTokenAccumulator = new Map<string, { input: number; output: number }>();

/** Rolling token history per user for computing tokens/hour */
const userTokenHistory = new Map<string, Array<{ timestamp: number; tokens: number }>>();

/** Max age of token history entries (1 hour in ms) */
const TOKEN_HISTORY_MAX_AGE_MS = 60 * 60 * 1000;

/** Per-user token offset recorded at midnight, subtracted from raw totals to get daily usage */
const userDailyOffset = new Map<string, { input: number; output: number }>();

/** Total agents spawned per user today */
const userDailySpawnCount = new Map<string, number>();

/** Date string of last daily reset */
let lastResetDate: string = new Date().toDateString();

/** Listeners for agent changes */
const changeListeners: AgentChangeCallback[] = [];

/**
 * Resets daily token tracking if the date has changed (midnight reset).
 * Captures current raw totals as offsets so daily usage starts from zero.
 */
function checkDailyReset(): void {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    console.log(`[AgentManager] Daily reset: ${lastResetDate} -> ${today}`);
    // Snapshot current raw totals as offsets for the new day
    const allOwnerKeys = new Set<string>();
    for (const agent of agents.values()) {
      allOwnerKeys.add(agent.ownerKey);
    }
    for (const key of userTokenAccumulator.keys()) {
      allOwnerKeys.add(key);
    }
    for (const ownerKey of allOwnerKeys) {
      userDailyOffset.set(ownerKey, getRawUserTokens(ownerKey));
    }
    userTokenHistory.clear();
    userDailySpawnCount.clear();
    lastResetDate = today;
  }
}

/**
 * Gets the raw (all-time) total tokens for a user, before daily offset.
 */
function getRawUserTokens(ownerKey: string): { input: number; output: number } {
  const accumulated = userTokenAccumulator.get(ownerKey) || { input: 0, output: 0 };
  const ownerAgents = getAgentsByOwner(ownerKey);
  return {
    input: accumulated.input + ownerAgents.reduce((sum, a) => sum + a.totalInputTokens, 0),
    output: accumulated.output + ownerAgents.reduce((sum, a) => sum + a.totalOutputTokens, 0),
  };
}

/**
 * Removes an agent from the map and accumulates its tokens for the owner.
 */
function deleteAgentAndAccumulate(agent: Agent): void {
  const current = userTokenAccumulator.get(agent.ownerKey) || { input: 0, output: 0 };
  userTokenAccumulator.set(agent.ownerKey, {
    input: current.input + agent.totalInputTokens,
    output: current.output + agent.totalOutputTokens,
  });
  agents.delete(agent.id);
}

/**
 * Notifies all registered listeners of an agent change.
 */
function notifyListeners(type: 'spawn' | 'update' | 'remove', agent: Agent): void {
  for (const listener of changeListeners) {
    try {
      listener(type, agent);
    } catch (error) {
      console.error('[AgentManager] Error in change listener:', error);
    }
  }
}

/**
 * Registers a callback to be notified of agent changes.
 * Used by WebSocket server to send updates to Godot.
 * @param callback - Function called when agents change
 */
export function onAgentChange(callback: AgentChangeCallback): void {
  changeListeners.push(callback);
}

/**
 * Removes a previously registered change listener.
 * @param callback - The callback to remove
 */
export function removeAgentChangeListener(callback: AgentChangeCallback): void {
  const index = changeListeners.indexOf(callback);
  if (index !== -1) {
    changeListeners.splice(index, 1);
  }
}

/**
 * Creates a new agent.
 * @param id - Unique identifier for the agent
 * @param displayName - Name to display for the agent
 * @param activity - Initial activity
 * @param ownerKey - API key of the owner
 * @param ownerDisplayName - Display name of the owner
 * @param variantIndex - Optional sprite variant index (random if not provided)
 * @param parentId - Optional parent agent ID (for sub-agents)
 * @param isSidechain - Whether this is a sidechain (sub-agent)
 * @returns The created agent, or null if an agent with that ID already exists
 */
export function createAgent(
  id: string,
  displayName: string,
  activity: AgentActivity,
  ownerKey: string,
  ownerDisplayName: string,
  variantIndex?: number,
  parentId?: string | null,
  isSidechain?: boolean,
  contextPercentage?: number,
  totalInputTokens?: number,
  totalOutputTokens?: number
): Agent | null {
  if (agents.has(id)) {
    console.warn(`[AgentManager] Agent with ID "${id}" already exists`);
    return null;
  }

  const now = Date.now();
  const agent: Agent = {
    id,
    displayName,
    variantIndex: variantIndex ?? -1,  // -1 = let Godot choose randomly from all available variants
    activity,
    state: mapActivityToState(activity),
    ownerKey,
    ownerDisplayName,
    createdAt: now,
    updatedAt: now,
    parentId: parentId ?? null,
    isSidechain: isSidechain ?? false,
    contextPercentage: contextPercentage ?? 0,
    totalInputTokens: totalInputTokens ?? 0,
    totalOutputTokens: totalOutputTokens ?? 0,
    idleAction: null,
  };

  agents.set(id, agent);
  userDailySpawnCount.set(ownerKey, (userDailySpawnCount.get(ownerKey) || 0) + 1);
  console.log(`[AgentManager] Created agent: ${id} (${displayName}) with state ${agent.state}, parentId=${agent.parentId}, isSidechain=${agent.isSidechain}`);

  notifyListeners('spawn', agent);
  return agent;
}

/**
 * Updates an agent's activity.
 * @param id - The agent's ID
 * @param activity - The new activity
 * @param ownerKey - The owner's API key (for authorization)
 * @returns The updated agent, or null if not found or not authorized
 */
export function updateAgentActivity(
  id: string,
  activity: AgentActivity,
  ownerKey: string,
  contextPercentage?: number,
  totalInputTokens?: number,
  totalOutputTokens?: number
): Agent | null {
  const agent = agents.get(id);

  if (!agent) {
    console.warn(`[AgentManager] Agent not found: ${id}`);
    return null;
  }

  if (agent.ownerKey !== ownerKey) {
    console.warn(`[AgentManager] Unauthorized update attempt for agent: ${id}`);
    return null;
  }

  const oldState = agent.state;
  const newState = mapActivityToState(activity);

  agent.activity = activity;
  agent.state = newState;
  agent.updatedAt = Date.now();

  // Clear idle action when leaving IDLE state
  if (newState !== 'IDLE' && agent.idleAction !== null) {
    agent.idleAction = null;
  }

  if (contextPercentage !== undefined) {
    agent.contextPercentage = contextPercentage;
  }

  if (totalInputTokens !== undefined) {
    agent.totalInputTokens = totalInputTokens;
  }

  if (totalOutputTokens !== undefined) {
    agent.totalOutputTokens = totalOutputTokens;
  }

  console.log(`[AgentManager] Updated agent: ${id} -> activity: ${activity}, state: ${newState} (was: ${oldState})`);

  // Always notify listeners so Godot can update the agent
  notifyListeners('update', agent);

  return agent;
}

/**
 * Removes an agent (sends them to exit).
 * @param id - The agent's ID
 * @param ownerKey - The owner's API key (for authorization)
 * @returns The removed agent, or null if not found or not authorized
 */
export function removeAgent(id: string, ownerKey: string): Agent | null {
  const agent = agents.get(id);

  if (!agent) {
    console.warn(`[AgentManager] Agent not found for removal: ${id}`);
    return null;
  }

  if (agent.ownerKey !== ownerKey) {
    console.warn(`[AgentManager] Unauthorized removal attempt for agent: ${id}`);
    return null;
  }

  deleteAgentAndAccumulate(agent);
  console.log(`[AgentManager] Removed agent: ${id}`);

  notifyListeners('remove', agent);
  return agent;
}

/**
 * Gets an agent by ID.
 * @param id - The agent's ID
 */
export function getAgent(id: string): Agent | undefined {
  return agents.get(id);
}

/**
 * Gets all agents owned by a specific user.
 * @param ownerKey - The owner's API key
 */
export function getAgentsByOwner(ownerKey: string): Agent[] {
  const result: Agent[] = [];
  for (const agent of agents.values()) {
    if (agent.ownerKey === ownerKey) {
      result.push(agent);
    }
  }
  return result;
}

/**
 * Gets all agents in the system.
 * Useful for syncing state when Godot connects.
 */
export function getAllAgents(): Agent[] {
  return Array.from(agents.values());
}

/**
 * Gets the count of active agents.
 */
export function getAgentCount(): number {
  return agents.size;
}

/**
 * Handles confirmation that an agent has been removed from Godot.
 * Called when receiving agent_removed message from Godot.
 * @param id - The agent's ID
 */
export function confirmAgentRemoved(id: string): void {
  console.log(`[AgentManager] Agent removal confirmed by Godot: ${id}`);
  // Agent was already removed from our map when DELETE was called
  // This is just for logging/confirmation purposes
}

/**
 * Gets the daily tokens for a user (today's usage only, resets at midnight).
 */
function getUserDailyTokens(ownerKey: string): { input: number; output: number } {
  const raw = getRawUserTokens(ownerKey);
  const offset = userDailyOffset.get(ownerKey) || { input: 0, output: 0 };
  return {
    input: Math.max(0, raw.input - offset.input),
    output: Math.max(0, raw.output - offset.output),
  };
}

/**
 * Records a token snapshot for tokens/hour calculation.
 */
function recordTokenSnapshot(ownerKey: string, totalTokens: number): void {
  const now = Date.now();
  const history = userTokenHistory.get(ownerKey) || [];
  history.push({ timestamp: now, tokens: totalTokens });
  const cutoff = now - TOKEN_HISTORY_MAX_AGE_MS;
  const pruned = history.filter(e => e.timestamp >= cutoff);
  userTokenHistory.set(ownerKey, pruned);
}

/**
 * Gets the output tokens per hour rate for a user over the last hour.
 */
function getUserTokensPerHour(ownerKey: string): number {
  const history = userTokenHistory.get(ownerKey);
  if (!history || history.length < 2) return 0;

  const oldest = history[0];
  const newest = history[history.length - 1];
  const timeDiffMs = newest.timestamp - oldest.timestamp;
  if (timeDiffMs < 5 * 60 * 1000) return 0; // Need at least 5 minutes of data

  const tokenDiff = newest.tokens - oldest.tokens;
  return Math.round((tokenDiff / timeDiffMs) * 3_600_000); // Convert to per hour
}

/**
 * Gets token stats for a user: daily total and tokens/hour.
 * Also records a snapshot for rate calculation and checks for daily reset.
 * @param ownerKey - The owner's API key
 */
export function getUserTokenStats(ownerKey: string): { totalInputTokens: number; totalOutputTokens: number; outputTokensPerHour: number; dailyAgentSpawns: number } {
  checkDailyReset();
  const daily = getUserDailyTokens(ownerKey);
  recordTokenSnapshot(ownerKey, daily.output);
  const outputTokensPerHour = getUserTokensPerHour(ownerKey);
  const dailyAgentSpawns = userDailySpawnCount.get(ownerKey) || 0;
  return { totalInputTokens: daily.input, totalOutputTokens: daily.output, outputTokensPerHour, dailyAgentSpawns };
}

/**
 * Removes all agents owned by a specific user (e.g., due to inactivity).
 * @param ownerKey - The owner's API key
 * @returns Number of agents removed
 */
export function removeAgentsByOwner(ownerKey: string): number {
  const agentsToRemove: Agent[] = [];

  for (const agent of agents.values()) {
    if (agent.ownerKey === ownerKey) {
      agentsToRemove.push(agent);
    }
  }

  for (const agent of agentsToRemove) {
    deleteAgentAndAccumulate(agent);
    console.log(`[AgentManager] Removing agent ${agent.id} due to owner inactivity`);
    notifyListeners('remove', agent);
  }

  return agentsToRemove.length;
}
