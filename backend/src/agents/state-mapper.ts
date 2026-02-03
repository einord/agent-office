import type { AgentState, AgentActivity } from '../types.js';

/**
 * Maps an agent activity to its corresponding state.
 *
 * Mapping rules:
 * - thinking, working, coding, reading, writing -> WORKING
 * - done, idle, waiting, paused -> IDLE
 * - leaving, offline, disconnected -> LEAVING
 *
 * @param activity - The current agent activity
 * @returns The corresponding agent state
 */
export function mapActivityToState(activity: AgentActivity): AgentState {
  switch (activity) {
    // Working activities
    case 'thinking':
    case 'working':
    case 'coding':
    case 'reading':
    case 'writing':
      return 'WORKING';

    // Idle activities
    case 'done':
    case 'idle':
    case 'waiting':
    case 'paused':
      return 'IDLE';

    // Leaving activities
    case 'leaving':
    case 'offline':
    case 'disconnected':
      return 'LEAVING';

    default:
      // TypeScript exhaustive check - should never reach here
      const _exhaustiveCheck: never = activity;
      console.warn(`[StateMapper] Unknown activity: ${_exhaustiveCheck}, defaulting to IDLE`);
      return 'IDLE';
  }
}

/**
 * Checks if an activity represents an active working state.
 * @param activity - The activity to check
 */
export function isWorkingActivity(activity: AgentActivity): boolean {
  return mapActivityToState(activity) === 'WORKING';
}

/**
 * Checks if an activity represents an idle state.
 * @param activity - The activity to check
 */
export function isIdleActivity(activity: AgentActivity): boolean {
  return mapActivityToState(activity) === 'IDLE';
}

/**
 * Checks if an activity represents a leaving state.
 * @param activity - The activity to check
 */
export function isLeavingActivity(activity: AgentActivity): boolean {
  return mapActivityToState(activity) === 'LEAVING';
}

/**
 * Gets all activities that map to a given state.
 * Useful for validation or UI purposes.
 * @param state - The state to get activities for
 */
export function getActivitiesForState(state: AgentState): AgentActivity[] {
  const activities: AgentActivity[] = [
    'thinking', 'working', 'coding', 'reading', 'writing',
    'done', 'idle', 'waiting', 'paused',
    'leaving', 'offline', 'disconnected'
  ];

  return activities.filter((activity) => mapActivityToState(activity) === state);
}

/**
 * Validates if a string is a valid activity.
 * @param activity - The string to validate
 */
export function isValidActivity(activity: string): activity is AgentActivity {
  const validActivities: string[] = [
    'thinking', 'working', 'coding', 'reading', 'writing',
    'done', 'idle', 'waiting', 'paused',
    'leaving', 'offline', 'disconnected'
  ];

  return validActivities.includes(activity);
}
