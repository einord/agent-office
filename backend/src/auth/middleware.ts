import type { Request, Response, NextFunction } from 'express';
import { validateToken } from './token-manager.js';
import type { AuthUser } from './types.js';

/** Extended request interface with authenticated user */
export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

/**
 * Express middleware that validates Bearer tokens.
 * Extracts the token from the Authorization header and validates it.
 * If valid, attaches the user to the request object.
 *
 * Usage: Add this middleware to routes that require authentication.
 */
export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: 'Authorization header is required' });
    return;
  }

  // Check for Bearer token format
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    res.status(401).json({ error: 'Invalid authorization format. Use: Bearer <token>' });
    return;
  }

  const tokenString = parts[1];
  const token = validateToken(tokenString);

  if (!token) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  // Attach user to request for use in route handlers
  req.user = token.user;
  next();
}

/**
 * Optional authentication middleware.
 * Same as authMiddleware but doesn't return an error if no token is provided.
 * Useful for routes that have different behavior for authenticated vs anonymous users.
 */
export function optionalAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    next();
    return;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    next();
    return;
  }

  const tokenString = parts[1];
  const token = validateToken(tokenString);

  if (token) {
    req.user = token.user;
  }

  next();
}
