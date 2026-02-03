import express from 'express';
import { getConfig, initConfigWatcher } from './config/config-loader.js';
import { cleanupExpiredTokens } from './auth/token-manager.js';
import routes from './api/routes.js';
import { initWebSocketServer, closeWebSocketServer } from './websocket/server.js';

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

// Start WebSocket server
initWebSocketServer(config.server.wsPort);

// Periodic token cleanup (every 5 minutes)
const tokenCleanupInterval = setInterval(() => {
  cleanupExpiredTokens();
}, 5 * 60 * 1000);

// Graceful shutdown
function shutdown(signal: string): void {
  console.log(`\n[Server] Received ${signal}, shutting down gracefully...`);

  clearInterval(tokenCleanupInterval);

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
