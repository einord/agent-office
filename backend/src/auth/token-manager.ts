import { v4 as uuidv4 } from 'uuid';
import type { AuthUser, Token } from './types.js';
import { getConfig } from '../config/config-loader.js';

/** In-memory storage for active tokens */
const tokens = new Map<string, Token>();

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
  };

  tokens.set(token.token, token);
  console.log(`[TokenManager] Generated token for user: ${user.displayName}`);

  return token;
}

/**
 * Validates a token and returns the associated token data if valid.
 * @param tokenString - The token string to validate
 * @returns The token object if valid, null otherwise
 */
export function validateToken(tokenString: string): Token | null {
  const token = tokens.get(tokenString);

  if (!token) {
    return null;
  }

  // Check if token has expired
  if (Date.now() > token.expiresAt) {
    tokens.delete(tokenString);
    console.log(`[TokenManager] Token expired for user: ${token.user.displayName}`);
    return null;
  }

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
    if (now > token.expiresAt) {
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
    if (now <= token.expiresAt) {
      count++;
    }
  }

  return count;
}
