import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';

/**
 * Persistent state stored locally so the same client always reuses
 * the same userKey (so reconnects don't spawn a duplicate avatar).
 */
export interface EventClientState {
  userKey: string;
  displayName: string;
  /** Last successful server URL (used as a hint for reconnects) */
  lastServerUrl?: string;
}

const STATE_FILE = join(homedir(), '.agent-office-event.json');

export function getStateFilePath(): string {
  return STATE_FILE;
}

/**
 * Loads the client state from disk, or returns null if no state exists yet.
 * Errors are swallowed so a corrupt file just falls back to a fresh state.
 */
export async function loadState(): Promise<EventClientState | null> {
  try {
    const raw = await readFile(STATE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<EventClientState>;
    if (!parsed.userKey || !parsed.displayName) return null;
    return {
      userKey: parsed.userKey,
      displayName: parsed.displayName,
      lastServerUrl: parsed.lastServerUrl,
    };
  } catch {
    return null;
  }
}

/**
 * Persists the state to disk. Uses mode 0o600 so the display name and
 * userKey aren't world-readable on shared machines (no-op on Windows,
 * where Node silently ignores POSIX modes).
 */
export async function saveState(state: EventClientState): Promise<void> {
  await mkdir(dirname(STATE_FILE), { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2), { encoding: 'utf-8', mode: 0o600 });
}

/**
 * Generates a new opaque userKey for an anonymous client.
 * Format: "anon-<uuid>" - the backend rejects keys not matching this prefix.
 */
export function generateUserKey(): string {
  return `anon-${randomUUID()}`;
}
