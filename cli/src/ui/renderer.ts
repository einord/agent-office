import chalk, { ChalkInstance } from 'chalk';
import type { TrackedSession, ActivityDisplay, SessionColor } from '../types.js';
import { ACTIVITY_DISPLAY, SESSION_COLORS } from '../types.js';
import { renderContextLine } from './progress-bar.js';

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
  const title = chalk.bold('Claude Agent Monitor');
  const hint = chalk.gray('[Ctrl+C to exit]');
  const width = 70;
  const padding = ' '.repeat(Math.max(0, width - title.length - hint.length - 10));

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

  const width = 70;
  const line = chalk.gray('─'.repeat(width));
  const stats = chalk.gray(`Active: ${activeSessions} sessions (${totalAgents} agents) | Updated: ${now}`);

  return `\n${line}\n${stats}`;
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

  // Session header
  const statusIcon = session.activity.type === 'waiting_input' ? '🟡' : '🟢';
  const branchInfo = session.gitBranch ? chalk.gray(` (${session.gitBranch})`) : '';

  if (session.isSidechain) {
    lines.push(`${prefix}└─ 🤖 ${chalk.bold('Agent')}: ${colorFn(session.slug)}`);
  } else {
    lines.push(`${prefix}${statusIcon} ${colorFn(chalk.bold(session.slug))}${branchInfo}`);
    lines.push(`${prefix}   📁 ${chalk.gray(shortenPath(session.projectPath))}`);
  }

  // Context usage
  const contextLine = renderContextLine(session.tokens.used, session.tokens.max);
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
