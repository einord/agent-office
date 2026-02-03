import { WebSocketServer, WebSocket } from 'ws';
import type {
  BackendToGodotMessage,
  GodotToBackendMessage,
  SpawnAgentPayload,
  UpdateAgentPayload,
  RemoveAgentPayload,
} from '../types.js';
import type { Agent } from '../agents/types.js';
import { onAgentChange, getAllAgents, confirmAgentRemoved } from '../agents/agent-manager.js';

let wss: WebSocketServer | null = null;
let godotClient: WebSocket | null = null;

/**
 * Sends a message to the connected Godot client.
 * @param message - The message to send
 * @returns True if sent successfully, false otherwise
 */
function sendToGodot(message: BackendToGodotMessage): boolean {
  if (!godotClient || godotClient.readyState !== WebSocket.OPEN) {
    console.warn('[WebSocket] No Godot client connected, message not sent');
    return false;
  }

  try {
    const json = JSON.stringify(message);
    godotClient.send(json);
    console.log(`[WebSocket] Sent to Godot: ${message.type}`, message.payload);
    return true;
  } catch (error) {
    console.error('[WebSocket] Error sending message to Godot:', error);
    return false;
  }
}

/**
 * Sends a spawn_agent command to Godot.
 */
function sendSpawnAgent(agent: Agent): boolean {
  const payload: SpawnAgentPayload = {
    id: agent.id,
    displayName: agent.displayName,
    userName: agent.ownerDisplayName,
    variantIndex: agent.variantIndex,
    state: agent.state,
  };

  return sendToGodot({ type: 'spawn_agent', payload });
}

/**
 * Sends an update_agent command to Godot.
 */
function sendUpdateAgent(agent: Agent): boolean {
  const payload: UpdateAgentPayload = {
    id: agent.id,
    state: agent.state,
  };

  return sendToGodot({ type: 'update_agent', payload });
}

/**
 * Sends a remove_agent command to Godot.
 */
function sendRemoveAgent(agent: Agent): boolean {
  const payload: RemoveAgentPayload = {
    id: agent.id,
  };

  return sendToGodot({ type: 'remove_agent', payload });
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
 * Syncs all current agents to a newly connected Godot client.
 */
function syncAgentsToGodot(): void {
  const agents = getAllAgents();
  console.log(`[WebSocket] Syncing ${agents.length} agents to Godot`);

  for (const agent of agents) {
    sendSpawnAgent(agent);
  }
}

/**
 * Initializes the WebSocket server for Godot communication.
 * @param port - The port to listen on
 */
export function initWebSocketServer(port: number): void {
  wss = new WebSocketServer({ port });

  wss.on('listening', () => {
    console.log(`[WebSocket] Server listening on port ${port}`);
  });

  wss.on('connection', (ws, req) => {
    const clientAddress = req.socket.remoteAddress;
    console.log(`[WebSocket] Client connected from ${clientAddress}`);

    // Only allow one Godot client at a time
    if (godotClient && godotClient.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] Another client already connected, closing new connection');
      ws.close(1000, 'Another client is already connected');
      return;
    }

    godotClient = ws;

    // Sync existing agents to the new client
    syncAgentsToGodot();

    ws.on('message', (data) => {
      handleGodotMessage(data.toString());
    });

    ws.on('close', (code, reason) => {
      console.log(`[WebSocket] Client disconnected: ${code} - ${reason.toString()}`);
      if (godotClient === ws) {
        godotClient = null;
      }
    });

    ws.on('error', (error) => {
      console.error('[WebSocket] Client error:', error);
    });
  });

  wss.on('error', (error) => {
    console.error('[WebSocket] Server error:', error);
  });

  // Register for agent changes
  onAgentChange((type, agent) => {
    switch (type) {
      case 'spawn':
        sendSpawnAgent(agent);
        break;
      case 'update':
        sendUpdateAgent(agent);
        break;
      case 'remove':
        sendRemoveAgent(agent);
        break;
    }
  });

  console.log('[WebSocket] Agent change listener registered');
}

/**
 * Closes the WebSocket server.
 */
export function closeWebSocketServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!wss) {
      resolve();
      return;
    }

    // Close all client connections
    if (godotClient) {
      godotClient.close(1000, 'Server shutting down');
      godotClient = null;
    }

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
 * Checks if a Godot client is currently connected.
 */
export function isGodotConnected(): boolean {
  return godotClient !== null && godotClient.readyState === WebSocket.OPEN;
}
