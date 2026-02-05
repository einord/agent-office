import { WebSocketServer, WebSocket } from 'ws';
import type {
  BackendToGodotMessage,
  GodotToBackendMessage,
  SpawnAgentPayload,
  UpdateAgentPayload,
  RemoveAgentPayload,
  SyncCompletePayload,
  UserStatsPayload,
} from '../types.js';
import type { Agent } from '../agents/types.js';
import { onAgentChange, getAllAgents, confirmAgentRemoved, getAgentsByOwner } from '../agents/agent-manager.js';
import { getActiveUsers } from '../auth/token-manager.js';
import { getConfig } from '../config/config-loader.js';

let wss: WebSocketServer | null = null;
const connectedClients: Set<WebSocket> = new Set();
let userStatsInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Broadcasts a message to all connected clients.
 * @param message - The message to send
 * @returns Number of clients the message was sent to
 */
function broadcastToClients(message: BackendToGodotMessage): number {
  if (connectedClients.size === 0) {
    console.warn('[WebSocket] No clients connected, message not sent');
    return 0;
  }

  const json = JSON.stringify(message);
  let sentCount = 0;

  for (const client of connectedClients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(json);
        sentCount++;
      } catch (error) {
        console.error('[WebSocket] Error sending message to client:', error);
      }
    }
  }

  console.log(`[WebSocket] Broadcast ${message.type} to ${sentCount} client(s)`, message.payload);
  return sentCount;
}

/**
 * Sends a message to a specific client.
 * @param client - The WebSocket client
 * @param message - The message to send
 */
function sendToClient(client: WebSocket, message: BackendToGodotMessage): boolean {
  if (client.readyState !== WebSocket.OPEN) {
    return false;
  }

  try {
    const json = JSON.stringify(message);
    client.send(json);
    return true;
  } catch (error) {
    console.error('[WebSocket] Error sending message to client:', error);
    return false;
  }
}

/**
 * Broadcasts a spawn_agent command to all clients.
 */
function broadcastSpawnAgent(agent: Agent): number {
  const payload: SpawnAgentPayload = {
    id: agent.id,
    displayName: agent.displayName,
    userName: agent.ownerDisplayName,
    variantIndex: agent.variantIndex,
    state: agent.state,
  };

  return broadcastToClients({ type: 'spawn_agent', payload });
}

/**
 * Broadcasts an update_agent command to all clients.
 */
function broadcastUpdateAgent(agent: Agent): number {
  const payload: UpdateAgentPayload = {
    id: agent.id,
    state: agent.state,
  };

  return broadcastToClients({ type: 'update_agent', payload });
}

/**
 * Broadcasts a remove_agent command to all clients.
 */
function broadcastRemoveAgent(agent: Agent): number {
  const payload: RemoveAgentPayload = {
    id: agent.id,
  };

  return broadcastToClients({ type: 'remove_agent', payload });
}

/**
 * Builds the user stats payload with current data.
 */
function buildUserStatsPayload(): UserStatsPayload {
  const config = getConfig();
  const activeUsers = getActiveUsers();
  const allAgents = getAllAgents();

  const users: UserStatsPayload['users'] = config.users.map((configUser) => {
    const activeSession = activeUsers.get(configUser.key);
    const userAgents = getAgentsByOwner(configUser.key);

    return {
      displayName: configUser.displayName,
      sessionCount: activeSession?.sessionCount ?? 0,
      agentCount: userAgents.length,
      isActive: activeSession !== undefined,
    };
  });

  const activeUserCount = users.filter((u) => u.isActive).length;
  const totalSessions = users.reduce((sum, u) => sum + u.sessionCount, 0);
  const totalAgents = allAgents.length;

  return {
    users,
    totals: {
      activeUsers: activeUserCount,
      totalSessions,
      totalAgents,
    },
  };
}

/**
 * Builds and broadcasts user stats to all connected clients.
 */
export function broadcastUserStats(): number {
  const payload = buildUserStatsPayload();
  return broadcastToClients({ type: 'user_stats', payload });
}

/**
 * Handles messages received from Godot.
 */
function handleGodotMessage(data: string): void {
  try {
    const message = JSON.parse(data) as GodotToBackendMessage;
    console.log(`[WebSocket] Received from Godot: ${message.type}`, message.payload);

    switch (message.type) {
      case 'ack':
        // Acknowledgment from Godot
        console.log(
          `[WebSocket] Godot acknowledged: ${message.payload.command} for ${message.payload.id} - success: ${message.payload.success}`
        );
        break;

      case 'agent_removed':
        // Agent has fully left the scene in Godot
        confirmAgentRemoved(message.payload.id);
        break;

      default:
        console.warn('[WebSocket] Unknown message type from Godot:', message);
    }
  } catch (error) {
    console.error('[WebSocket] Error parsing message from Godot:', error);
  }
}

/**
 * Sends a sync_complete message to a specific client.
 */
function sendSyncComplete(client: WebSocket, agentIds: string[]): boolean {
  const payload: SyncCompletePayload = {
    agentIds,
  };

  return sendToClient(client, { type: 'sync_complete', payload });
}

/**
 * Sends current user stats to a specific client.
 */
function sendUserStatsToClient(client: WebSocket): boolean {
  const payload = buildUserStatsPayload();
  return sendToClient(client, { type: 'user_stats', payload });
}

/**
 * Syncs all current agents to a newly connected client.
 * After sending spawn commands for all agents, sends a sync_complete message
 * so the client can clean up any stale agents.
 */
function syncAgentsToClient(client: WebSocket): void {
  const agents = getAllAgents();
  console.log(`[WebSocket] Syncing ${agents.length} agents to new client`);

  for (const agent of agents) {
    const payload: SpawnAgentPayload = {
      id: agent.id,
      displayName: agent.displayName,
      userName: agent.ownerDisplayName,
      variantIndex: agent.variantIndex,
      state: agent.state,
    };
    sendToClient(client, { type: 'spawn_agent', payload });
  }

  // Send sync_complete with all active agent IDs so client can clean up stale agents
  const agentIds = agents.map((a) => a.id);
  sendSyncComplete(client, agentIds);

  // Also send current user stats
  sendUserStatsToClient(client);
}

/**
 * Initializes the WebSocket server for Godot communication.
 * @param port - The port to listen on
 */
export function initWebSocketServer(port: number): void {
  // Clear any existing interval to prevent duplicates
  if (userStatsInterval) {
    clearInterval(userStatsInterval);
    userStatsInterval = null;
  }

  wss = new WebSocketServer({ port });

  wss.on('listening', () => {
    console.log(`[WebSocket] Server listening on port ${port}`);
  });

  wss.on('connection', (ws, req) => {
    const clientAddress = req.socket.remoteAddress;
    console.log(`[WebSocket] Client connected from ${clientAddress} (total: ${connectedClients.size + 1})`);

    // Add to connected clients
    connectedClients.add(ws);

    // Sync existing agents to the new client
    syncAgentsToClient(ws);

    ws.on('message', (data) => {
      handleGodotMessage(data.toString());
    });

    ws.on('close', (code, reason) => {
      connectedClients.delete(ws);
      console.log(`[WebSocket] Client disconnected: ${code} - ${reason.toString()} (remaining: ${connectedClients.size})`);
    });

    ws.on('error', (error) => {
      console.error('[WebSocket] Client error:', error);
      connectedClients.delete(ws);
    });
  });

  wss.on('error', (error) => {
    console.error('[WebSocket] Server error:', error);
  });

  // Register for agent changes
  onAgentChange((type, agent) => {
    switch (type) {
      case 'spawn':
        broadcastSpawnAgent(agent);
        // Broadcast updated user stats when agent spawns
        broadcastUserStats();
        break;
      case 'update':
        broadcastUpdateAgent(agent);
        break;
      case 'remove':
        broadcastRemoveAgent(agent);
        // Broadcast updated user stats when agent is removed
        broadcastUserStats();
        break;
    }
  });

  console.log('[WebSocket] Agent change listener registered');

  // Start periodic user stats broadcast (every 5 seconds)
  userStatsInterval = setInterval(() => {
    if (connectedClients.size > 0) {
      broadcastUserStats();
    }
  }, 5000);

  console.log('[WebSocket] User stats broadcast interval started');
}

/**
 * Closes the WebSocket server.
 */
export function closeWebSocketServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Clear the user stats interval
    if (userStatsInterval) {
      clearInterval(userStatsInterval);
      userStatsInterval = null;
    }

    if (!wss) {
      resolve();
      return;
    }

    // Close all client connections
    for (const client of connectedClients) {
      client.close(1000, 'Server shutting down');
    }
    connectedClients.clear();

    wss.close((err) => {
      if (err) {
        reject(err);
      } else {
        console.log('[WebSocket] Server closed');
        wss = null;
        resolve();
      }
    });
  });
}

/**
 * Checks if any client is currently connected.
 */
export function isClientConnected(): boolean {
  return connectedClients.size > 0;
}

/**
 * Gets the number of connected clients.
 */
export function getConnectedClientCount(): number {
  return connectedClients.size;
}
