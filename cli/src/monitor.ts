import chokidar from 'chokidar';
import { join } from 'path';
import { homedir } from 'os';
import type { TrackedSession, SessionIndex, TokenUsage } from './types.js';
import { MAX_CONTEXT_TOKENS } from './types.js';
import { scanClaudeProcesses, getOpenSessionFiles, matchProcessesToSessions } from './data/process-scanner.js';
import { getAllSessions, readConversationTail, calculateTokenUsage, getContextWindowUsage, setClaudeDir, getClaudeDir } from './data/session-reader.js';
import { getLatestActivity, isSessionActive, detectSidechain } from './data/activity-tracker.js';
import { getSessionColor } from './ui/renderer.js';
import { LogRenderer } from './ui/log-renderer.js';
import { ServerClient, type ServerClientConfig } from './sync/server-client.js';
import { resetIncrementalReader } from './data/incremental-reader.js';

/** Session reaping interval in milliseconds (30 seconds) */
const REAP_INTERVAL_MS = 30_000;

/** Session time-to-live in milliseconds (2 minutes after last update) */
const SESSION_TTL_MS = 2 * 60 * 1000;

/** Timeout for "done" sessions before removing from display (5 minutes) */
const DONE_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Configuration options for the monitor.
 */
export interface MonitorConfig {
  /** Server URL for backend sync */
  serverUrl: string;
  /** API key for backend authentication */
  apiKey: string;
  /** Optional custom claude directory path (defaults to ~/.claude) */
  claudeDir?: string;
}

/**
 * Main monitor class that tracks Claude sessions and optionally syncs to a backend server.
 */
export class ClaudeMonitor {
  private sessions: Map<string, TrackedSession> = new Map();
  private previousSessions: Map<string, TrackedSession> = new Map();
  private watcher: chokidar.FSWatcher | null = null;
  private updateTimer: NodeJS.Timeout | null = null;
  private reapTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private ui: LogRenderer | null = null;
  private serverClient: ServerClient | null = null;
  private claudeDir: string;

  /**
   * Creates a new ClaudeMonitor instance.
   * @param syncConfig - Optional configuration for server synchronization and claude directory
   */
  constructor(syncConfig?: MonitorConfig) {
    // Set claude directory (use config, env var, or default)
    this.claudeDir = syncConfig?.claudeDir
      || process.env.CLAUDE_CONFIG_DIR
      || join(homedir(), '.claude');

    // Update session reader to use the configured directory
    setClaudeDir(this.claudeDir);

    if (syncConfig?.serverUrl && syncConfig?.apiKey) {
      this.serverClient = new ServerClient(syncConfig);
    }
  }

  /**
   * Starts the monitor.
   */
  async start(): Promise<void> {
    this.isRunning = true;

    // Initialize log-based UI
    this.ui = new LogRenderer();

    // Initial scan
    await this.refresh();

    // Initial sync if server client is configured (before rendering status)
    if (this.serverClient) {
      await this.syncToServer();
    }

    // Render initial status (after server connection is established)
    this.render();

    // Set up file watching
    this.setupWatcher();

    // Periodic refresh as fallback if file watching misses changes
    this.updateTimer = setInterval(() => {
      this.refresh().then(() => {
        this.render();
        if (this.serverClient) {
          this.syncToServer();
        }
      });
    }, 60_000);

    // Active session reaping - removes stale sessions periodically
    this.reapTimer = setInterval(() => {
      this.reapStaleSessions();
    }, REAP_INTERVAL_MS);
  }

  /**
   * Stops the monitor.
   */
  stop(): void {
    this.isRunning = false;

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }

    if (this.reapTimer) {
      clearInterval(this.reapTimer);
      this.reapTimer = null;
    }

    if (this.ui) {
      this.ui.destroy();
      this.ui = null;
    }

    // Clear incremental reader cache
    resetIncrementalReader();

    process.exit(0);
  }

  /**
   * Sets up file watching for real-time updates.
   */
  private setupWatcher(): void {
    const projectsDir = join(this.claudeDir, 'projects');
    const watchPaths = [
      join(projectsDir, '*', 'sessions-index.json'),
      join(projectsDir, '*', '*.jsonl'),
      // Watch for sub-agent files: <project>/<session-id>/subagents/agent-*.jsonl
      join(projectsDir, '*', '*', 'subagents', 'agent-*.jsonl'),
    ];

    this.watcher = chokidar.watch(watchPaths, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    this.watcher.on('change', async (path) => {
      await this.refresh();
      this.render();
      if (this.serverClient) {
        await this.syncToServer();
      }
    });

    this.watcher.on('add', async (path) => {
      await this.refresh();
      this.render();
      if (this.serverClient) {
        await this.syncToServer();
      }
    });
  }

  /**
   * Synchronizes sessions to the backend server.
   * Detects new, updated, and removed sessions and syncs accordingly.
   */
  private async syncToServer(): Promise<void> {
    if (!this.serverClient) return;

    try {
      // Get visible sessions (same filter as render)
      const visibleSessions = new Map<string, TrackedSession>();

      for (const [id, session] of this.sessions) {
        if (session.activity.type === 'done') {
          const age = Date.now() - session.lastUpdate.getTime();
          if (age < DONE_TIMEOUT_MS) {
            visibleSessions.set(id, session);
          }
        } else {
          visibleSessions.set(id, session);
        }
      }

      // Sync all sessions
      await this.serverClient.syncAll(visibleSessions);
    } catch (error) {
      // Log but don't crash - sync failures shouldn't stop the monitor
      console.error('[Monitor] Sync error:', error instanceof Error ? error.message : error);
    }
  }

  /**
   * Actively removes stale sessions that haven't been updated within the TTL.
   * This runs periodically to clean up memory and ensure accurate sync state.
   */
  private reapStaleSessions(): void {
    const now = Date.now();
    const sessionsToRemove: string[] = [];

    for (const [agentId, session] of this.sessions) {
      const age = now - session.lastUpdate.getTime();

      // Remove sessions that are "done" and older than DONE_TIMEOUT
      if (session.activity.type === 'done' && age > DONE_TIMEOUT_MS) {
        sessionsToRemove.push(agentId);
        continue;
      }

      // Remove any session that hasn't been updated within SESSION_TTL
      // (except those waiting for input, which can be idle longer)
      if (session.activity.type !== 'waiting_input' && age > SESSION_TTL_MS) {
        sessionsToRemove.push(agentId);
      }
    }

    // Remove stale sessions and notify server (use agentId as the unique identifier)
    for (const agentId of sessionsToRemove) {
      this.sessions.delete(agentId);

      if (this.serverClient) {
        this.serverClient.removeAgent(agentId).catch((error) => {
          console.error(`[Monitor] Failed to remove agent ${agentId}:`, error);
        });
      }
    }

    // Re-render if sessions were removed
    if (sessionsToRemove.length > 0) {
      this.render();
    }
  }

  /**
   * Refreshes session data.
   */
  async refresh(): Promise<void> {
    try {
      // Get process info
      const processes = await scanClaudeProcesses();
      const openFiles = await getOpenSessionFiles();
      const sessionToPid = matchProcessesToSessions(processes, openFiles);

      // Get all sessions (includes sub-agents)
      const allSessions = await getAllSessions();

      // Store previous sessions for comparison
      this.previousSessions = new Map(this.sessions);

      // Build tracked sessions
      const newSessions = new Map<string, TrackedSession>();

      for (const [uniqueId, sessionInfo] of allSessions) {
        const tracked = await this.buildTrackedSession(
          uniqueId,
          sessionInfo,
          sessionToPid
        );

        if (tracked) {
          // Use agentId as the map key (agentId for sub-agents, sessionId for main sessions)
          newSessions.set(tracked.agentId, tracked);
        }
      }

      this.sessions = newSessions;
    } catch (error) {
      // Silently handle errors during refresh
    }
  }

  /**
   * Builds a tracked session from session info.
   */
  private async buildTrackedSession(
    uniqueId: string,
    sessionInfo: SessionIndex & { projectDir: string; filePath: string; lastModified?: number; agentId?: string; isSidechain?: boolean },
    sessionToPid: Map<string, number>
  ): Promise<TrackedSession | null> {
    try {
      // Read conversation data
      const messages = await readConversationTail(sessionInfo.filePath, 100);

      // Check if active
      const lastModified = sessionInfo.lastModified || Date.now();
      if (!isSessionActive(messages, lastModified)) {
        return null;
      }

      // Get current context window usage (last API response's input + output tokens)
      const contextTokens = getContextWindowUsage(messages);

      // Get activity (pass lastModified for timeout detection)
      const activity = getLatestActivity(messages, lastModified);

      // Get PID if known
      const pid = sessionToPid.get(sessionInfo.filePath);

      // Determine if this is a sidechain - use sessionInfo.isSidechain if set (from subagent file),
      // otherwise fall back to detecting from messages
      const isSidechain = sessionInfo.isSidechain ?? detectSidechain(messages);

      // For sub-agents, use agentId; for main sessions, use sessionId
      const agentId = sessionInfo.agentId || sessionInfo.sessionId;

      // parentSessionId: for sub-agents it's the sessionId field from the subagent file
      // (which is the parent's session ID)
      const parentSessionId = isSidechain ? sessionInfo.sessionId : undefined;

      return {
        sessionId: sessionInfo.sessionId,
        agentId,
        slug: sessionInfo.slug || agentId.slice(0, 8),
        projectPath: sessionInfo.projectPath || sessionInfo.projectDir,
        gitBranch: sessionInfo.gitBranch,
        pid,
        color: getSessionColor(agentId),
        tokens: {
          used: contextTokens,
          max: MAX_CONTEXT_TOKENS,
          percentage: Math.round((contextTokens / MAX_CONTEXT_TOKENS) * 100),
        },
        activity,
        lastUpdate: new Date(lastModified),
        isSidechain,
        parentSessionId,
        subAgents: [], // Sub-agent linking would require cross-session correlation
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Renders the current state to the terminal.
   */
  private render(): void {
    if (!this.isRunning || !this.ui) return;

    const sessionsArray = Array.from(this.sessions.values());

    // Filter out done sessions older than the timeout
    const visibleSessions = sessionsArray.filter(session => {
      if (session.activity.type === 'done') {
        const age = Date.now() - session.lastUpdate.getTime();
        return age < DONE_TIMEOUT_MS;
      }
      return true;
    });

    this.ui.update(visibleSessions);
  }
}
