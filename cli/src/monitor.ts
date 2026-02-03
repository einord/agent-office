import chokidar from 'chokidar';
import { join } from 'path';
import { homedir } from 'os';
import type { TrackedSession, SessionIndex, TokenUsage } from './types.js';
import { MAX_CONTEXT_TOKENS } from './types.js';
import { scanClaudeProcesses, getOpenSessionFiles, matchProcessesToSessions } from './data/process-scanner.js';
import { getAllSessions, readConversationTail, calculateTokenUsage } from './data/session-reader.js';
import { getLatestActivity, isSessionActive } from './data/activity-tracker.js';
import { renderMonitor, getSessionColor } from './ui/renderer.js';

const CLAUDE_DIR = join(homedir(), '.claude');
const PROJECTS_DIR = join(CLAUDE_DIR, 'projects');

/**
 * Main monitor class that tracks Claude sessions
 */
export class ClaudeMonitor {
  private sessions: Map<string, TrackedSession> = new Map();
  private watcher: chokidar.FSWatcher | null = null;
  private updateTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  /**
   * Starts the monitor
   */
  async start(): Promise<void> {
    this.isRunning = true;

    // Initial scan
    await this.refresh();
    this.render();

    // Set up file watching
    this.setupWatcher();

    // Periodic refresh as fallback if file watching misses changes
    this.updateTimer = setInterval(() => {
      this.refresh().then(() => this.render());
    }, 60_000);

    // Re-render on terminal resize
    process.stdout.on('resize', () => this.render());

    // Handle exit
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());
  }

  /**
   * Stops the monitor
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

    console.log('\n\nMonitor stopped.');
    process.exit(0);
  }

  /**
   * Sets up file watching for real-time updates
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
    });

    this.watcher.on('add', async (path) => {
      await this.refresh();
      this.render();
    });
  }

  /**
   * Refreshes session data
   */
  async refresh(): Promise<void> {
    try {
      // Get process info
      const processes = await scanClaudeProcesses();
      const openFiles = await getOpenSessionFiles();
      const sessionToPid = matchProcessesToSessions(processes, openFiles);

      // Get all sessions
      const allSessions = await getAllSessions();

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
   * Builds a tracked session from session info
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
   * Renders the current state to the terminal
   */
  private render(): void {
    if (!this.isRunning) return;

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

    const output = renderMonitor(visibleSessions);
    process.stdout.write(output);
  }
}
