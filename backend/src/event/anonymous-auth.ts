import type { Request, Response } from 'express';
import { generateToken } from '../auth/token-manager.js';
import { getConfig } from '../config/config-loader.js';
import { getAllAgents } from '../agents/agent-manager.js';
import type { AuthResponse } from '../auth/types.js';

/** Rate limit window duration in milliseconds */
const RATE_WINDOW_MS = 60 * 1000;

/** Max length for a user-supplied display name */
const DISPLAY_NAME_MAX = 30;

/** Per-IP auth request timestamps for rate limiting */
const authAttempts = new Map<string, number[]>();

/** Per-userKey last known display name (for rejoins) */
const knownClients = new Map<string, string>();

function normalizeDisplayName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > DISPLAY_NAME_MAX) return null;
  // Allow letters (incl. Nordic/diacritics), numbers, space, and safe punctuation
  if (!/^[\p{L}\p{N} _.,\-'!?()]+$/u.test(trimmed)) return null;
  return trimmed;
}

function isValidUserKey(raw: unknown): raw is string {
  return typeof raw === 'string' && /^anon-[a-zA-Z0-9-]{8,64}$/.test(raw);
}

function getClientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) return xff.split(',')[0].trim();
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

function isRateLimited(ip: string, limit: number): boolean {
  const now = Date.now();
  const history = authAttempts.get(ip) ?? [];
  const recent = history.filter((ts) => now - ts < RATE_WINDOW_MS);

  if (recent.length >= limit) {
    authAttempts.set(ip, recent);
    return true;
  }

  recent.push(now);
  authAttempts.set(ip, recent);
  return false;
}

/**
 * Cleans up rate-limit history older than the window.
 * Should be called periodically to prevent unbounded memory growth.
 */
export function cleanupAnonymousAuthState(): void {
  const now = Date.now();
  for (const [ip, timestamps] of authAttempts) {
    const recent = timestamps.filter((ts) => now - ts < RATE_WINDOW_MS);
    if (recent.length === 0) authAttempts.delete(ip);
    else authAttempts.set(ip, recent);
  }
}

/**
 * Handles anonymous auth requests used by the event client.
 * Only active when `eventMode.enabled` is true in config.
 * Returns 404 when event mode is off so the endpoint looks non-existent to scanners.
 */
export function handleAnonymousAuth(req: Request, res: Response): void {
  const config = getConfig();
  const eventMode = config.eventMode;

  if (!eventMode?.enabled) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const ip = getClientIp(req);
  if (isRateLimited(ip, eventMode.authRateLimit)) {
    res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
    return;
  }

  const body = req.body as { displayName?: unknown; userKey?: unknown };
  const displayName = normalizeDisplayName(body.displayName);
  if (!displayName) {
    res.status(400).json({
      error: `displayName is required (1-${DISPLAY_NAME_MAX} chars, letters/numbers/spaces).`,
    });
    return;
  }

  const providedKey = isValidUserKey(body.userKey) ? body.userKey : null;
  if (!providedKey) {
    res.status(400).json({ error: 'userKey is required (must start with "anon-").' });
    return;
  }

  // Enforce max concurrent anonymous agents, but always let existing clients rejoin
  const existingAgents = getAllAgents().filter((a) => a.ownerKey.startsWith('anon-'));
  const isRejoin = knownClients.has(providedKey) || existingAgents.some((a) => a.ownerKey === providedKey);
  if (!isRejoin && existingAgents.length >= eventMode.maxAgents) {
    res.status(503).json({ error: 'Event is full. Please try again later.' });
    return;
  }

  knownClients.set(providedKey, displayName);

  const token = generateToken({ key: providedKey, displayName });

  const response: AuthResponse = {
    token: token.token,
    displayName,
    expiresAt: new Date(token.expiresAt).toISOString(),
  };

  res.status(200).json(response);
}
