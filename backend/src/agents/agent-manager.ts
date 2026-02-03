import type { AgentActivity } from '../types.js';
import type { Agent, AgentChangeCallback } from './types.js';
import { mapActivityToState } from './state-mapper.js';

/** Number of available sprite variants */
const VARIANT_COUNT = 6;

/** In-memory storage for agents */
const agents = new Map<string, Agent>();

/** Listeners for agent changes */
const changeListeners: AgentChangeCallback[] = [];

/**
 * Generates a random variant index for agent sprites.
 */
function getRandomVariantIndex(): number {
  return Math.floor(Math.random() * VARIANT_COUNT);
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
 * @returns The created agent, or null if an agent with that ID already exists
 */
export function createAgent(
  id: string,
  displayName: string,
  activity: AgentActivity,
  ownerKey: string,
  ownerDisplayName: string,
  variantIndex?: number
): Agent | null {
  if (agents.has(id)) {
    console.warn(`[AgentManager] Agent with ID "${id}" already exists`);
    return null;
  }

  const now = Date.now();
  const agent: Agent = {
    id,
    displayName,
    variantIndex: variantIndex ?? getRandomVariantIndex(),
    activity,
    state: mapActivityToState(activity),
    ownerKey,
    ownerDisplayName,
    createdAt: now,
    updatedAt: now,
  };

  agents.set(id, agent);
  console.log(`[AgentManager] Created agent: ${id} (${displayName}) with state ${agent.state}`);

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
  ownerKey: string
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

  agents.delete(id);
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
