import chalk from 'chalk';
import type { TrackedSession, ActivityDisplay, SessionColor } from '../types.js';
import { ACTIVITY_DISPLAY, SESSION_COLORS } from '../types.js';
import { renderProgressBar, formatTokens } from './progress-bar.js';
import { generateName } from './name-generator.js';

/**
 * Gets terminal width with fallback
 * @returns Terminal width in columns
 */
function getTerminalWidth(): number {
  return process.stdout.columns || 80;
}

/**
 * Strips ANSI escape codes from a string
 * @param str String with potential ANSI codes
 * @returns Clean string without ANSI codes
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Calculates visible length of a string (excluding ANSI codes, accounting for emojis)
 * @param str String to measure
 * @returns Visible column width
 */
function visibleLength(str: string): number {
  const clean = stripAnsi(str);
  // Simple emoji detection - emojis typically take 2 columns
  // This regex matches common emoji patterns
  let length = 0;
  for (const char of clean) {
    const code = char.codePointAt(0) || 0;
    // Most emojis are in these ranges
    if (code > 0x1F000 || (code >= 0x2600 && code <= 0x27BF)) {
      length += 2;
    } else {
      length += 1;
    }
  }
  return length;
}

/**
 * Formats time since a date as human-readable string
 * @param date The date to format
 * @returns Formatted string like "2m ago", "30s ago"
 */
function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

/**
 * Gets a consistent color for a session based on its ID
 * @param sessionId Session identifier
 * @returns Chalk color name
 */
export function getSessionColor(sessionId: string): SessionColor {
  const hash = sessionId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return SESSION_COLORS[hash % SESSION_COLORS.length];
}

/**
 * Gets chalk color function for a session color
 * @param color Session color name
 * @returns Chalk color function
 */
function getColorFn(color: SessionColor): (s: string) => string {
  const colorMap: Record<SessionColor, (s: string) => string> = {
    cyan: chalk.cyan,
    magenta: chalk.magenta,
    yellow: chalk.yellow,
    blue: chalk.blue,
    green: chalk.green,
    red: chalk.red,
    white: chalk.white,
    gray: chalk.gray,
  };
  return colorMap[color] || chalk.white;
}

/**
 * Renders the header of the monitor
 * @returns Header string
 */
export function renderHeader(): string {
  const width = getTerminalWidth();
  const title = chalk.bold('Agent Office Monitor');
  const hint = chalk.gray('[Ctrl+C to exit]');
  const titleLen = visibleLength(title);
  const hintLen = visibleLength(hint);
  const padding = ' '.repeat(Math.max(0, width - titleLen - hintLen));

  return `${title}${padding}${hint}\n` + chalk.gray('─'.repeat(width)) + '\n';
}

/**
 * Renders the footer with summary stats
 * @param sessions All tracked sessions
 * @returns Footer string
 */
export function renderFooter(sessions: TrackedSession[]): string {
  const activeSessions = sessions.filter(s => !s.isSidechain).length;
  const totalAgents = sessions.length;
  const now = new Date().toLocaleTimeString();

  const width = getTerminalWidth();
  const line = chalk.gray('─'.repeat(width));
  const stats = chalk.gray(`Active: ${activeSessions} sessions (${totalAgents} agents) | Updated: ${now}`);

  return `\n${line}\n${stats}`;
}

/**
 * Renders a context line with dynamic progress bar width
 * @param used Tokens used
 * @param max Maximum tokens
 * @param availableWidth Available width for the entire line
 * @returns Formatted context line
 */
function renderDynamicContextLine(used: number, max: number, availableWidth: number): string {
  const percentage = Math.min(100, Math.round((used / max) * 100));
  const usedStr = formatTokens(used);
  const maxStr = formatTokens(max);

  // Calculate fixed parts: "Context: " + " XX% (XXX/XXX tokens)"
  const prefix = 'Context: ';
  const suffix = ` ${percentage}% (${usedStr}/${maxStr} tokens)`;

  // Calculate bar width: available - prefix - suffix - some padding
  const barWidth = Math.max(10, availableWidth - prefix.length - suffix.length - 2);

  const bar = renderProgressBar(percentage, barWidth);

  let statusIcon = '';
  if (percentage >= 100) {
    statusIcon = chalk.red(' ⚠️');
  }

  return `${prefix}${bar}${suffix}${statusIcon}`;
}

/**
 * Renders a single session
 * @param session Session to render
 * @param indent Indentation level
 * @returns Rendered session string
 */
export function renderSession(session: TrackedSession, indent: number = 0): string {
  const prefix = '   '.repeat(indent);
  const colorFn = getColorFn(session.color as SessionColor);
  const lines: string[] = [];
  const termWidth = getTerminalWidth();
  // Account for: indent prefix + "   " before context line
  const availableWidth = termWidth - (indent * 3) - 3 - 2; // Extra buffer for safety

  // Generate readable name from session ID
  const displayName = generateName(session.sessionId);

  // Time since last update
  const timeAgo = chalk.gray(`(${formatTimeAgo(session.lastUpdate)})`);

  // Session header
  const statusIcon = session.activity.type === 'waiting_input' ? '🟡' : '🟢';
  const branchInfo = session.gitBranch ? chalk.gray(` (${session.gitBranch})`) : '';

  if (session.isSidechain) {
    lines.push(`${prefix}└─ 🤖 ${chalk.bold('Agent')}: ${colorFn(displayName)} ${timeAgo}`);
  } else {
    lines.push(`${prefix}${statusIcon} ${colorFn(chalk.bold(displayName))}${branchInfo} ${timeAgo}`);
    lines.push(`${prefix}   ${chalk.gray(shortenPath(session.projectPath))}`);
  }

  // Context usage with dynamic width
  const contextLine = renderDynamicContextLine(session.tokens.used, session.tokens.max, availableWidth);
  lines.push(`${prefix}   ${contextLine}`);

  // Current activity
  const activityDisplay = ACTIVITY_DISPLAY[session.activity.type];
  let activityLine = `${prefix}   ${activityDisplay.icon} ${activityDisplay.label}`;
  if (session.activity.detail) {
    activityLine += chalk.gray(` (${shortenPath(session.activity.detail)})`);
  }
  lines.push(activityLine);

  // Context full warning
  if (session.tokens.percentage >= 100) {
    lines.push(`${prefix}   ${chalk.red('⚠️  Context full - may auto-compact')}`);
  }

  // Render sub-agents
  for (const subAgent of session.subAgents) {
    lines.push('');
    lines.push(renderSession(subAgent, indent + 1));
  }

  return lines.join('\n');
}

/**
 * Shortens a file path for display
 * @param path Full path
 * @returns Shortened path with ~ for home
 */
function shortenPath(path: string): string {
  const home = process.env.HOME || '';
  if (path.startsWith(home)) {
    return '~' + path.slice(home.length);
  }
  return path;
}

/**
 * Renders the full monitor display
 * @param sessions All sessions to display
 * @returns Complete rendered output
 */
export function renderMonitor(sessions: TrackedSession[]): string {
  const parts: string[] = [];

  // Clear screen and move cursor to top
  parts.push('\x1B[2J\x1B[H');

  // Header
  parts.push(renderHeader());

  // Sessions (only top-level, sub-agents are rendered within)
  const topLevelSessions = sessions.filter(s => !s.isSidechain);

  if (topLevelSessions.length === 0) {
    parts.push(chalk.gray('\n  No active Claude sessions found.\n'));
    parts.push(chalk.gray('  Start a Claude session to see it here.\n'));
  } else {
    for (const session of topLevelSessions) {
      parts.push('\n' + renderSession(session));
    }
  }

  // Footer
  parts.push(renderFooter(sessions));

  return parts.join('');
}
