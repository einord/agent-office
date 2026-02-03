/**
 * Represents an authenticated user in the system.
 */
export interface AuthUser {
  /** The user's API key */
  key: string;
  /** The user's display name */
  displayName: string;
}

/**
 * Represents a session token with metadata.
 */
export interface Token {
  /** The unique token string */
  token: string;
  /** The associated user */
  user: AuthUser;
  /** Timestamp when the token was created (milliseconds since epoch) */
  createdAt: number;
  /** Timestamp when the token expires (milliseconds since epoch) */
  expiresAt: number;
}

/**
 * Request body for authentication endpoint.
 */
export interface AuthRequest {
  /** The API key to authenticate with */
  apiKey: string;
}

/**
 * Response body for successful authentication.
 */
export interface AuthResponse {
  /** The generated session token */
  token: string;
  /** The authenticated user's display name */
  displayName: string;
  /** Token expiration timestamp (ISO 8601) */
  expiresAt: string;
}
