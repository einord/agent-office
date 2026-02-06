import { v4 as uuidv4 } from 'uuid';
import type { AuthUser, Token } from './types.js';
import { getConfig } from '../config/config-loader.js';

/** In-memory storage for active tokens */
const tokens = new Map<string, Token>();

function isExpired(token: Token, now: number): boolean {
  return now > token.expiresAt;
}

/**
 * Generates a new session token for an authenticated user.
 * @param user - The authenticated user
 * @returns The generated token object
 */
export function generateToken(user: AuthUser): Token {
  const config = getConfig();
  const now = Date.now();
  const expiresAt = now + config.tokenExpirySeconds * 1000;

  const token: Token = {
    token: uuidv4(),
    user,
    createdAt: now,
    expiresAt,
    lastActivity: now,
  };

  tokens.set(token.token, token);
  console.log(`[TokenManager] Generated token for user: ${user.displayName}`);

  return token;
}

/**
 * Validates a token and returns the associated token data if valid.
 * Also updates the lastActivity timestamp.
 * @param tokenString - The token string to validate
 * @returns The token object if valid, null otherwise
 */
export function validateToken(tokenString: string): Token | null {
  const token = tokens.get(tokenString);

  if (!token) {
    return null;
  }

  const now = Date.now();

  if (isExpired(token, now)) {
    tokens.delete(tokenString);
    console.log(`[TokenManager] Token expired for user: ${token.user.displayName}`);
    return null;
  }

  token.lastActivity = now;

  return token;
}

/**
 * Revokes a token, removing it from the active tokens.
 * @param tokenString - The token string to revoke
 * @returns True if the token was revoked, false if it didn't exist
 */
export function revokeToken(tokenString: string): boolean {
  const token = tokens.get(tokenString);
  if (token) {
    tokens.delete(tokenString);
    console.log(`[TokenManager] Revoked token for user: ${token.user.displayName}`);
    return true;
  }
  return false;
}

/**
 * Gets the user associated with a valid token.
 * @param tokenString - The token string
 * @returns The user if token is valid, null otherwise
 */
export function getUserFromToken(tokenString: string): AuthUser | null {
  const token = validateToken(tokenString);
  return token ? token.user : null;
}

/**
 * Cleans up expired tokens from memory.
 * Should be called periodically to prevent memory leaks.
 */
export function cleanupExpiredTokens(): void {
  const now = Date.now();
  let cleaned = 0;

  for (const [tokenString, token] of tokens.entries()) {
    if (isExpired(token, now)) {
      tokens.delete(tokenString);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[TokenManager] Cleaned up ${cleaned} expired tokens`);
  }
}

/**
 * Gets the count of active (non-expired) tokens.
 * Useful for monitoring and debugging.
 */
export function getActiveTokenCount(): number {
  const now = Date.now();
  let count = 0;

  for (const token of tokens.values()) {
    if (!isExpired(token, now)) {
      count++;
    }
  }

  return count;
}

/**
 * Finds users who have been inactive for longer than the specified timeout.
 * @param timeoutSeconds - The inactivity timeout in seconds
 * @returns Array of API keys for inactive users
 */
export function getInactiveUserKeys(timeoutSeconds: number): string[] {
  if (timeoutSeconds <= 0) {
    return [];
  }

  const now = Date.now();
  const timeoutMs = timeoutSeconds * 1000;

  // Find the most recent activity per user (across all their tokens)
  const userLatestActivity = new Map<string, { lastActivity: number; displayName: string }>();

  for (const token of tokens.values()) {
    if (isExpired(token, now)) {
      continue;
    }

    const existing = userLatestActivity.get(token.user.key);
    if (!existing || token.lastActivity > existing.lastActivity) {
      userLatestActivity.set(token.user.key, {
        lastActivity: token.lastActivity,
        displayName: token.user.displayName,
      });
    }
  }

  // Only flag users whose most recent token is inactive
  const inactiveKeys: string[] = [];
  for (const [key, info] of userLatestActivity) {
    const inactiveFor = now - info.lastActivity;
    if (inactiveFor > timeoutMs) {
      inactiveKeys.push(key);
      console.log(
        `[TokenManager] User ${info.displayName} inactive for ${Math.round(inactiveFor / 1000)}s`
      );
    }
  }

  return inactiveKeys;
}

/**
 * Marks a token as active (updates lastActivity).
 * Useful for explicit heartbeat calls.
 * @param tokenString - The token string
 * @returns True if token was found and updated
 */
export function touchToken(tokenString: string): boolean {
  const token = tokens.get(tokenString);
  const now = Date.now();
  if (token && !isExpired(token, now)) {
    token.lastActivity = now;
    return true;
  }
  return false;
}

/** User session info for stats */
export interface ActiveUserSession {
  key: string;
  displayName: string;
  sessionCount: number;
}

/**
 * Gets a map of active users with their session counts.
 * Groups tokens by user key and counts active sessions.
 * Only counts tokens with recent activity (within inactivityTimeoutSeconds)
 * to avoid showing stale sessions from disconnected CLIs.
 * @returns Map of user key to session info
 */
export function getActiveUsers(): Map<string, ActiveUserSession> {
  const config = getConfig();
  const now = Date.now();
  const inactivityMs = config.inactivityTimeoutSeconds * 1000;
  const userMap = new Map<string, ActiveUserSession>();

  for (const token of tokens.values()) {
    if (isExpired(token, now)) {
      continue;
    }
    if (inactivityMs > 0 && (now - token.lastActivity) > inactivityMs) {
      continue;
    }

    const existing = userMap.get(token.user.key);
    if (existing) {
      existing.sessionCount++;
    } else {
      userMap.set(token.user.key, {
        key: token.user.key,
        displayName: token.user.displayName,
        sessionCount: 1,
      });
    }
  }

  return userMap;
}
