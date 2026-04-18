/**
 * Cross-platform Claude Code session detection.
 *
 * Unlike the main monitor (which uses ps/lsof), this watcher only relies on
 * the JSONL conversation files in ~/.claude/projects/. That makes it work on
 * macOS, Linux AND Windows — at the cost of slightly less accurate "is the
 * process still running" info, which doesn't matter for event mode.
 */

import chokidar from 'chokidar';
import { join } from 'path';
import { homedir } from 'os';
import { stat } from 'fs/promises';
import {
  getAllSessions,
  readConversationTail,
  setClaudeDir,
} from '../data/session-reader.js';
import { getLatestActivity } from '../data/activity-tracker.js';
import type { ActivityType } from '../types.js';

/** A session is considered active if its file changed within this many ms */
const ACTIVE_WINDOW_MS = 5 * 60 * 1000;

/** Debounce interval for file change events */
const DEBOUNCE_MS = 400;

/** Periodic full rescan interval (covers cases where chokidar misses events) */
const RESCAN_INTERVAL_MS = 15_000;

export type ActivitySnapshot = {
  type: ActivityType;
  contextPercentage: number;
};

export type ActivityListener = (snapshot: ActivitySnapshot) => void;

export class SessionWatcher {
  private claudeDir: string;
  private watcher: chokidar.FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private rescanInterval: NodeJS.Timeout | null = null;
  private lastSnapshot: ActivitySnapshot | null = null;
  private listeners: ActivityListener[] = [];
  private isRefreshing = false;
  private refreshPending = false;

  constructor(customClaudeDir?: string) {
    this.claudeDir = customClaudeDir
      || process.env.CLAUDE_CONFIG_DIR
      || join(homedir(), '.claude');
    setClaudeDir(this.claudeDir);
  }

  onActivityChange(listener: ActivityListener): void {
    this.listeners.push(listener);
  }

  getClaudeDir(): string {
    return this.claudeDir;
  }

  /**
   * Starts watching ~/.claude/projects for session activity.
   * Emits initial snapshot immediately.
   */
  async start(): Promise<void> {
    await this.refresh();

    const projectsDir = join(this.claudeDir, 'projects');
    this.watcher = chokidar.watch(
      [
        join(projectsDir, '*', 'sessions-index.json'),
        join(projectsDir, '*', '*.jsonl'),
        join(projectsDir, '*', '*', 'subagents', 'agent-*.jsonl'),
      ],
      {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
      }
    );

    const trigger = () => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.refresh().catch(() => {
          /* ignore - emitted via heartbeat next cycle */
        });
      }, DEBOUNCE_MS);
    };
    this.watcher.on('change', trigger);
    this.watcher.on('add', trigger);

    this.rescanInterval = setInterval(() => {
      this.refresh().catch(() => {
        /* ignore */
      });
    }, RESCAN_INTERVAL_MS);
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.rescanInterval) {
      clearInterval(this.rescanInterval);
      this.rescanInterval = null;
    }
  }

  /**
   * Returns the most recent snapshot — or an idle one if no sessions exist.
   */
  getSnapshot(): ActivitySnapshot {
    return this.lastSnapshot ?? { type: 'idle', contextPercentage: 0 };
  }

  private async refresh(): Promise<void> {
    if (this.isRefreshing) {
      this.refreshPending = true;
      return;
    }
    this.isRefreshing = true;

    try {
      const snapshot = await this.computeSnapshot();
      const changed =
        !this.lastSnapshot ||
        this.lastSnapshot.type !== snapshot.type ||
        this.lastSnapshot.contextPercentage !== snapshot.contextPercentage;

      this.lastSnapshot = snapshot;

      if (changed) {
        for (const listener of this.listeners) {
          try {
            listener(snapshot);
          } catch {
            // Listener errors are not the watcher's problem
          }
        }
      }
    } finally {
      this.isRefreshing = false;
      if (this.refreshPending) {
        this.refreshPending = false;
        await this.refresh();
      }
    }
  }

  private async computeSnapshot(): Promise<ActivitySnapshot> {
    let allSessions;
    try {
      allSessions = await getAllSessions();
    } catch {
      return { type: 'idle', contextPercentage: 0 };
    }

    const now = Date.now();
    type Candidate = { activity: ActivityType; contextPercentage: number; lastModified: number };
    const candidates: Candidate[] = [];

    for (const [, info] of allSessions) {
      try {
        const lastModified = info.lastModified ?? (await stat(info.filePath)).mtimeMs;
        if (now - lastModified > ACTIVE_WINDOW_MS) continue;

        const messages = await readConversationTail(info.filePath, 60);
        const activity = getLatestActivity(messages, lastModified, false);
        candidates.push({
          activity: activity.type,
          contextPercentage: 0,
          lastModified,
        });
      } catch {
        continue;
      }
    }

    if (candidates.length === 0) return { type: 'idle', contextPercentage: 0 };

    candidates.sort((a, b) => b.lastModified - a.lastModified);
    const best = candidates[0];
    return { type: best.activity, contextPercentage: best.contextPercentage };
  }
}
