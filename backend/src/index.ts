import express from 'express';
import { getConfig, initConfigWatcher } from './config/config-loader.js';
import { cleanupExpiredTokens, getInactiveUserKeys } from './auth/token-manager.js';
import { getAllAgents, removeAgent, removeAgentsByOwner } from './agents/agent-manager.js';
import routes from './api/routes.js';
import { initWebSocketServer, closeWebSocketServer } from './websocket/server.js';
import { initIdleActionService } from './idle-actions/index.js';

// Initialize configuration watcher for hot-reload
initConfigWatcher();

const config = getConfig();
const app = express();

// Middleware
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.path}`);
  next();
});

// API routes
app.use(routes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[HTTP] Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start HTTP server
const httpServer = app.listen(config.server.httpPort, () => {
  console.log(`[HTTP] Server listening on port ${config.server.httpPort}`);
});

// Initialize idle action service
initIdleActionService();

// Start WebSocket server
initWebSocketServer(config.server.wsPort);

// Periodic token cleanup (every 5 minutes)
const tokenCleanupInterval = setInterval(() => {
  cleanupExpiredTokens();
}, 5 * 60 * 1000);

/** Sidechain (sub-agent) done timeout: 5 minutes */
const DONE_SIDECHAIN_TIMEOUT_MS = 5 * 60 * 1000;
/** Main session done timeout: 15 minutes (stay visible longer on screen) */
const DONE_SESSION_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Removes all agents belonging to users who have exceeded the inactivity timeout.
 */
function removeInactiveOwnerAgents(): void {
  const { inactivityTimeoutSeconds } = getConfig();
  if (inactivityTimeoutSeconds <= 0) return;

  const inactiveKeys = getInactiveUserKeys(inactivityTimeoutSeconds);
  for (const key of inactiveKeys) {
    const removed = removeAgentsByOwner(key);
    if (removed > 0) {
      console.log(`[Server] Removed ${removed} agent(s) due to inactivity`);
    }
  }
}

/**
 * Removes individual agents that have been in the "done" state
 * longer than their respective timeout.
 * Sidechains are ephemeral and reap faster (5 min).
 * Main sessions stay visible longer (15 min).
 */
function reapDoneAgents(): void {
  const now = Date.now();
  for (const agent of getAllAgents()) {
    if (agent.activity !== 'done') continue;
    const timeout = agent.isSidechain ? DONE_SIDECHAIN_TIMEOUT_MS : DONE_SESSION_TIMEOUT_MS;
    if (now - agent.updatedAt > timeout) {
      removeAgent(agent.id, agent.ownerKey);
      console.log(`[Server] Reaped done ${agent.isSidechain ? 'sidechain' : 'session'}: ${agent.id}`);
    }
  }
}

// Periodic agent cleanup (every 10 seconds)
const agentCleanupInterval = setInterval(() => {
  removeInactiveOwnerAgents();
  reapDoneAgents();
}, 10 * 1000);

// Graceful shutdown
function shutdown(signal: string): void {
  console.log(`\n[Server] Received ${signal}, shutting down gracefully...`);

  clearInterval(tokenCleanupInterval);
  clearInterval(agentCleanupInterval);

  httpServer.close(() => {
    console.log('[HTTP] Server closed');
  });

  closeWebSocketServer()
    .then(() => {
      console.log('[Server] Shutdown complete');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Server] Error during shutdown:', err);
      process.exit(1);
    });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

console.log('[Server] Agent Office Backend started');
console.log(`[Server] HTTP: http://localhost:${config.server.httpPort}`);
console.log(`[Server] WebSocket: ws://localhost:${config.server.wsPort}`);
console.log(`[Server] Inactivity timeout: ${config.inactivityTimeoutSeconds}s`);
