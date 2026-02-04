import chalk from 'chalk';
import type { TrackedSession } from '../types.js';
import { ACTIVITY_DISPLAY } from '../types.js';
import { generateName } from './name-generator.js';
import { formatTokens } from './progress-bar.js';

/**
 * Log-based renderer for session monitoring.
 * Outputs colored log messages when session state changes.
 */
export class LogRenderer {
  private previousSessions: Map<string, TrackedSession> = new Map();
  private lastStatusUpdate: number = 0;
  private readonly STATUS_INTERVAL_MS = 60_000; // Log status every 60 seconds

  /**
   * Updates the display with new session data.
   * Compares with previous state and logs changes.
   * @param sessions - Array of currently tracked sessions
   */
  update(sessions: TrackedSession[]): void {
    const currentSessions = new Map<string, TrackedSession>();
    const topLevelSessions = sessions.filter(s => !s.isSidechain);

    for (const session of topLevelSessions) {
      currentSessions.set(session.sessionId, session);
    }

    // Check for new sessions
    for (const [id, session] of currentSessions) {
      if (!this.previousSessions.has(id)) {
        this.logNewSession(session);
      }
    }

    // Check for activity changes
    for (const [id, session] of currentSessions) {
      const previous = this.previousSessions.get(id);
      if (previous) {
        if (this.hasActivityChanged(previous, session)) {
          this.logActivityChange(session);
        }
      }
    }

    // Check for ended sessions
    for (const [id, session] of this.previousSessions) {
      if (!currentSessions.has(id)) {
        this.logSessionEnded(session);
      }
    }

    // Periodic status update
    const now = Date.now();
    if (now - this.lastStatusUpdate >= this.STATUS_INTERVAL_MS && topLevelSessions.length > 0) {
      this.logStatusUpdate(topLevelSessions);
      this.lastStatusUpdate = now;
    }

    // Store current state for next comparison
    this.previousSessions = currentSessions;
  }

  /**
   * Checks if activity has changed between two session states.
   */
  private hasActivityChanged(previous: TrackedSession, current: TrackedSession): boolean {
    if (previous.activity.type !== current.activity.type) {
      return true;
    }
    if (previous.activity.detail !== current.activity.detail) {
      return true;
    }
    return false;
  }

  /**
   * Logs when a new session is created.
   */
  private logNewSession(session: TrackedSession): void {
    const name = generateName(session.sessionId);
    const projectName = this.getProjectName(session.projectPath);
    const timestamp = this.getTimestamp();

    console.log(
      chalk.gray(timestamp) + ' ' +
      chalk.green('✓') + ' ' +
      chalk.green('Ny session:') + ' ' +
      chalk.cyan.bold(name) + ' ' +
      chalk.gray('-') + ' ' +
      chalk.white(projectName)
    );
  }

  /**
   * Logs when session activity changes.
   */
  private logActivityChange(session: TrackedSession): void {
    const name = generateName(session.sessionId);
    const activityDisplay = ACTIVITY_DISPLAY[session.activity.type] || ACTIVITY_DISPLAY['idle'];
    const timestamp = this.getTimestamp();

    let message = chalk.gray(timestamp) + ' ' +
      chalk.yellow('→') + ' ' +
      chalk.cyan(name) + ': ' +
      chalk.yellow(activityDisplay.label);

    if (session.activity.detail) {
      const detail = this.shortenPath(session.activity.detail);
      message += ' ' + chalk.gray(`(${detail})`);
    }

    console.log(message);
  }

  /**
   * Logs when a session ends.
   */
  private logSessionEnded(session: TrackedSession): void {
    const name = generateName(session.sessionId);
    const timestamp = this.getTimestamp();

    console.log(
      chalk.gray(timestamp) + ' ' +
      chalk.red('✗') + ' ' +
      chalk.red('Session avslutad:') + ' ' +
      chalk.cyan(name)
    );
  }

  /**
   * Logs periodic status update with all active sessions.
   */
  private logStatusUpdate(sessions: TrackedSession[]): void {
    const timestamp = this.getTimestamp();

    console.log('');
    console.log(
      chalk.gray(timestamp) + ' ' +
      chalk.cyan('═══ Statusuppdatering ═══')
    );
    console.log(
      chalk.cyan(`Aktiva sessioner: ${sessions.length}`)
    );

    for (const session of sessions) {
      const name = generateName(session.sessionId);
      const activityDisplay = ACTIVITY_DISPLAY[session.activity.type] || ACTIVITY_DISPLAY['idle'];
      const projectName = this.getProjectName(session.projectPath);
      const tokenStr = formatTokens(session.tokens.used);
      const percentage = session.tokens.percentage;

      let tokenColor = chalk.green;
      if (percentage >= 90) {
        tokenColor = chalk.red;
      } else if (percentage >= 70) {
        tokenColor = chalk.yellow;
      }

      console.log(
        '  ' +
        chalk.cyan.bold(name) + ' ' +
        chalk.gray('|') + ' ' +
        chalk.white(projectName) + ' ' +
        chalk.gray('|') + ' ' +
        chalk.yellow(activityDisplay.label) + ' ' +
        chalk.gray('|') + ' ' +
        tokenColor(`${tokenStr} (${percentage}%)`)
      );
    }

    console.log(chalk.cyan('═'.repeat(26)));
    console.log('');
  }

  /**
   * Gets a short timestamp string.
   */
  private getTimestamp(): string {
    return new Date().toLocaleTimeString('sv-SE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  /**
   * Extracts project name from path.
   */
  private getProjectName(projectPath: string): string {
    const parts = projectPath.split('/');
    return parts[parts.length - 1] || projectPath;
  }

  /**
   * Shortens path by replacing home directory with ~.
   */
  private shortenPath(path: string): string {
    const home = process.env.HOME || '';
    if (path.startsWith(home)) {
      return '~' + path.slice(home.length);
    }
    return path;
  }

  /**
   * Empty method for compatibility with BlessedUI interface.
   */
  destroy(): void {
    // No cleanup needed for log-based output
  }

  /**
   * Empty method for compatibility with BlessedUI interface.
   */
  render(): void {
    // No-op for log-based output
  }
}
