import chokidar from 'chokidar';
import { join } from 'path';
import { homedir } from 'os';
import type { TrackedSession, SessionIndex, TokenUsage } from './types.js';
import { MAX_CONTEXT_TOKENS } from './types.js';
import { scanClaudeProcesses, getOpenSessionFiles, matchProcessesToSessions } from './data/process-scanner.js';
import { getAllSessions, readConversationTail, calculateTokenUsage } from './data/session-reader.js';
import { getLatestActivity, isSessionActive } from './data/activity-tracker.js';
import { getSessionColor } from './ui/renderer.js';
import { LogRenderer } from './ui/log-renderer.js';
import { ServerClient, type ServerClientConfig } from './sync/server-client.js';

const CLAUDE_DIR = join(homedir(), '.claude');
const PROJECTS_DIR = join(CLAUDE_DIR, 'projects');

/**
 * Configuration options for the monitor.
 */
export interface MonitorConfig {
  /** Server URL for backend sync */
  serverUrl: string;
  /** API key for backend authentication */
  apiKey: string;
}

/**
 * Main monitor class that tracks Claude sessions and optionally syncs to a backend server.
 */
export class ClaudeMonitor {
  private sessions: Map<string, TrackedSession> = new Map();
  private previousSessions: Map<string, TrackedSession> = new Map();
  private watcher: chokidar.FSWatcher | null = null;
  private updateTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private ui: LogRenderer | null = null;
  private serverClient: ServerClient | null = null;

  /**
   * Creates a new ClaudeMonitor instance.
   * @param syncConfig - Optional configuration for server synchronization
   */
  constructor(syncConfig?: MonitorConfig) {
    if (syncConfig) {
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

    if (this.ui) {
      this.ui.destroy();
      this.ui = null;
    }

    process.exit(0);
  }

  /**
   * Sets up file watching for real-time updates.
   */
  private setupWatcher(): void {
    const watchPaths = [
      join(PROJECTS_DIR, '*', 'sessions-index.json'),
      join(PROJECTS_DIR, '*', '*.jsonl'),
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
      const DONE_TIMEOUT_MS = 5 * 60 * 1000;
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
   * Refreshes session data.
   */
  async refresh(): Promise<void> {
    try {
      // Get process info
      const processes = await scanClaudeProcesses();
      const openFiles = await getOpenSessionFiles();
      const sessionToPid = matchProcessesToSessions(processes, openFiles);

      // Get all sessions
      const allSessions = await getAllSessions();

      // Store previous sessions for comparison
      this.previousSessions = new Map(this.sessions);

      // Build tracked sessions
      const newSessions = new Map<string, TrackedSession>();

      for (const [sessionId, sessionInfo] of allSessions) {
        const tracked = await this.buildTrackedSession(
          sessionId,
          sessionInfo,
          sessionToPid
        );

        if (tracked) {
          newSessions.set(sessionId, tracked);
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
    sessionId: string,
    sessionInfo: SessionIndex & { projectDir: string; filePath: string; lastModified?: number },
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

      // Calculate token usage
      const usage = calculateTokenUsage(messages);
      const totalTokens = usage.input_tokens + usage.output_tokens;

      // Get activity (pass lastModified for timeout detection)
      const activity = getLatestActivity(messages, lastModified);

      // Get PID if known
      const pid = sessionToPid.get(sessionInfo.filePath);

      return {
        sessionId,
        slug: sessionInfo.slug || sessionId.slice(0, 8),
        projectPath: sessionInfo.projectPath || sessionInfo.projectDir,
        gitBranch: sessionInfo.gitBranch,
        pid,
        color: getSessionColor(sessionId),
        tokens: {
          used: totalTokens,
          max: MAX_CONTEXT_TOKENS,
          percentage: Math.round((totalTokens / MAX_CONTEXT_TOKENS) * 100),
        },
        activity,
        lastUpdate: new Date(lastModified),
        isSidechain: false, // Would need more logic to detect
        subAgents: [], // Would need more logic to populate
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

    // Filter out done sessions older than 5 minutes
    const DONE_TIMEOUT_MS = 5 * 60 * 1000;
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
