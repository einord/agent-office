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
  getContextUsagePercentage,
  setClaudeDir,
} from '../data/session-reader.js';
import { getLatestActivity } from '../data/activity-tracker.js';
import { getIncrementalReader } from '../data/incremental-reader.js';
import type { ActivityType } from '../types.js';

/** A session is considered active if its file changed within this many ms */
const ACTIVE_WINDOW_MS = 5 * 60 * 1000;

/** Debounce interval for file change events */
const DEBOUNCE_MS = 400;

/** Periodic full rescan interval (covers cases where chokidar misses events) */
const RESCAN_INTERVAL_MS = 15_000;

/** State of a single Claude Code session or sub-agent. */
export type SessionActivity = {
  /** Unique agent ID — the sessionId for main sessions, the sub-agent's own id for sidechains. */
  agentId: string;
  /** Parent session's ID. For main sessions this equals agentId; for sidechains it's the parent. */
  sessionId: string;
  isSidechain: boolean;
  parentSessionId: string | null;
  activity: ActivityType;
  contextPercentage: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  sycophancyCount: number;
};

/** Snapshot of all currently active sessions. Empty array means no active work. */
export type WatcherSnapshot = {
  sessions: SessionActivity[];
};

export type ActivityListener = (snapshot: WatcherSnapshot) => void;

export class SessionWatcher {
  private claudeDir: string;
  private watcher: chokidar.FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private rescanInterval: NodeJS.Timeout | null = null;
  private lastSnapshot: WatcherSnapshot | null = null;
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
   * Returns the most recent snapshot — or an empty one if nothing has been observed yet.
   */
  getSnapshot(): WatcherSnapshot {
    return this.lastSnapshot ?? { sessions: [] };
  }

  private async refresh(): Promise<void> {
    if (this.isRefreshing) {
      this.refreshPending = true;
      return;
    }
    this.isRefreshing = true;

    try {
      const snapshot = await this.computeSnapshot();
      const changed = !this.lastSnapshot || snapshotsDiffer(this.lastSnapshot, snapshot);

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

  private async computeSnapshot(): Promise<WatcherSnapshot> {
    let allSessions;
    try {
      allSessions = await getAllSessions();
    } catch {
      return { sessions: [] };
    }

    const now = Date.now();
    const sessions: SessionActivity[] = [];
    const reader = getIncrementalReader();

    for (const [, info] of allSessions) {
      try {
        const lastModified = info.lastModified ?? (await stat(info.filePath)).mtimeMs;
        if (now - lastModified > ACTIVE_WINDOW_MS) continue;

        const isSidechain = info.isSidechain ?? false;
        const agentId = info.agentId ?? info.sessionId;
        const parentSessionId = isSidechain ? info.sessionId : null;

        // readConversationTail primes the IncrementalReader's token accumulator as a side effect
        const messages = await readConversationTail(info.filePath, 60);
        const activity = getLatestActivity(messages, lastModified, isSidechain);
        const contextPercentage = getContextUsagePercentage(messages);
        const accumulated = reader.getAccumulatedTokens(info.filePath);
        const sycophancy = reader.getAccumulatedSycophancy(info.filePath);

        sessions.push({
          agentId,
          sessionId: info.sessionId,
          isSidechain,
          parentSessionId,
          activity: activity.type,
          contextPercentage,
          totalInputTokens: accumulated.input_tokens,
          totalOutputTokens: accumulated.output_tokens,
          sycophancyCount: sycophancy,
        });
      } catch {
        continue;
      }
    }

    return { sessions };
  }
}

function snapshotsDiffer(a: WatcherSnapshot, b: WatcherSnapshot): boolean {
  if (a.sessions.length !== b.sessions.length) return true;
  const byId = new Map(a.sessions.map((s) => [s.agentId, s]));
  for (const curr of b.sessions) {
    const prev = byId.get(curr.agentId);
    if (
      !prev ||
      prev.activity !== curr.activity ||
      prev.contextPercentage !== curr.contextPercentage ||
      prev.totalInputTokens !== curr.totalInputTokens ||
      prev.totalOutputTokens !== curr.totalOutputTokens ||
      prev.sycophancyCount !== curr.sycophancyCount ||
      prev.isSidechain !== curr.isSidechain ||
      prev.parentSessionId !== curr.parentSessionId
    ) {
      return true;
    }
  }
  return false;
}
