import { onAgentChange, getAllAgents, getAgent } from '../agents/agent-manager.js';
import type { Agent, AgentChangeCallback } from '../agents/types.js';
import type { IdleActionType, IdleActionAssignment } from '../types.js';
import { incrementCanCount } from '../cleaning/index.js';

/** Callback for idle action changes */
type IdleActionChangeCallback = (agent: Agent) => void;

/** Pending timers for agents waiting to receive idle actions */
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Listeners for idle action changes */
const changeListeners: IdleActionChangeCallback[] = [];

/** Minimum delay before assigning an idle action (ms) */
const MIN_DELAY = 3000;
/** Maximum delay before assigning an idle action (ms) */
const MAX_DELAY = 15000;
/** Maximum fraction of idle agents that can have an action simultaneously */
const MAX_ACTIVE_FRACTION = 0.4;

/**
 * Registers a callback to be notified when an agent's idle action changes.
 * @param callback - Function called with the updated agent
 */
export function onIdleActionChange(callback: IdleActionChangeCallback): void {
  changeListeners.push(callback);
}

/**
 * Notifies all registered listeners of an idle action change.
 */
function notifyListeners(agent: Agent): void {
  for (const callback of changeListeners) {
    try {
      callback(agent);
    } catch (error) {
      console.error('[IdleActions] Error in change listener:', error);
    }
  }
}

/**
 * Picks a random idle action from the available pool.
 */
function pickAction(): IdleActionType {
  return 'get_drink';
}

/**
 * Returns the number of idle agents currently performing an idle action.
 */
function countActiveIdleActions(): number {
  let count = 0;
  for (const agent of getAllAgents()) {
    if (agent.state === 'IDLE' && agent.idleAction !== null) {
      count++;
    }
  }
  return count;
}

/**
 * Returns the number of agents currently in IDLE state.
 */
function countIdleAgents(): number {
  let count = 0;
  for (const agent of getAllAgents()) {
    if (agent.state === 'IDLE') {
      count++;
    }
  }
  return count;
}

/**
 * Schedules an idle action assignment for the given agent after a random delay.
 */
function scheduleIdleAction(agentId: string): void {
  // Cancel any existing timer
  cancelPendingTimer(agentId);

  const delay = MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY);

  const timer = setTimeout(() => {
    pendingTimers.delete(agentId);

    const agent = getAgent(agentId);
    if (!agent || agent.state !== 'IDLE') {
      return;
    }

    // Check capacity limit
    const idleCount = countIdleAgents();
    const activeCount = countActiveIdleActions();
    if (idleCount > 0 && activeCount / idleCount >= MAX_ACTIVE_FRACTION) {
      // Too many active — reschedule with a shorter delay
      scheduleIdleAction(agentId);
      return;
    }

    // Assign the action
    const action: IdleActionAssignment = {
      action: pickAction(),
      assignedAt: Date.now(),
    };
    agent.idleAction = action;
    if (action.action === 'get_drink') {
      incrementCanCount();
    }
    console.log(`[IdleActions] Assigned "${action.action}" to agent ${agentId}`);

    notifyListeners(agent);
  }, delay);

  pendingTimers.set(agentId, timer);
}

/**
 * Cancels a pending idle action timer for the given agent.
 */
function cancelPendingTimer(agentId: string): void {
  const timer = pendingTimers.get(agentId);
  if (timer) {
    clearTimeout(timer);
    pendingTimers.delete(agentId);
  }
}

/**
 * Handles agent change events to manage idle action lifecycle.
 */
function handleAgentChange(type: 'spawn' | 'update' | 'remove', agent: Agent): void {
  switch (type) {
    case 'spawn':
      if (agent.state === 'IDLE') {
        scheduleIdleAction(agent.id);
      }
      break;

    case 'update':
      if (agent.state === 'IDLE' && agent.idleAction === null) {
        // Agent is idle without an action — schedule one
        if (!pendingTimers.has(agent.id)) {
          scheduleIdleAction(agent.id);
        }
      } else if (agent.state !== 'IDLE') {
        // Agent left idle — cancel pending timer and clear action
        cancelPendingTimer(agent.id);
        if (agent.idleAction !== null) {
          agent.idleAction = null;
          notifyListeners(agent);
        }
      }
      break;

    case 'remove':
      cancelPendingTimer(agent.id);
      break;
  }
}

/**
 * Initializes the idle action service.
 * Registers as a listener on agent changes.
 */
export function initIdleActionService(): void {
  onAgentChange(handleAgentChange);
  console.log('[IdleActions] Service initialized');
}
