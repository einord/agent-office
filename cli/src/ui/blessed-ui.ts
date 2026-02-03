import blessed from 'blessed';
import type { TrackedSession } from '../types.js';
import { ACTIVITY_DISPLAY } from '../types.js';
import { generateName } from './name-generator.js';
import { formatTokens } from './progress-bar.js';

/**
 * Formats time since a date as human-readable string
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
 * Gets color based on percentage
 */
function getBarColor(percentage: number): string {
  if (percentage >= 90) return 'red';
  if (percentage >= 70) return 'yellow';
  return 'green';
}

/**
 * Blessed-based UI for the monitor
 */
export class BlessedUI {
  private screen: blessed.Widgets.Screen;
  private header: blessed.Widgets.BoxElement;
  private headerLine: blessed.Widgets.BoxElement;
  private sessionContainer: blessed.Widgets.BoxElement;
  private footerLine: blessed.Widgets.BoxElement;
  private footer: blessed.Widgets.BoxElement;
  private sessionBoxes: Map<string, blessed.Widgets.BoxElement> = new Map();

  constructor() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Agent Office Monitor',
      fullUnicode: true,
    });

    // Header
    this.header = blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 1,
      tags: true,
      content: '{bold}Agent Office Monitor{/bold}',
    });

    // Add exit hint to header (right-aligned)
    blessed.box({
      parent: this.header,
      top: 0,
      right: 0,
      width: 'shrink',
      height: 1,
      tags: true,
      content: '{245-fg}[q to exit]{/245-fg}',
    });

    // Header line
    this.headerLine = blessed.box({
      parent: this.screen,
      top: 1,
      left: 0,
      width: '100%',
      height: 1,
      style: { fg: 245 },
    });
    this.updateHeaderLine();

    // Session container
    this.sessionContainer = blessed.box({
      parent: this.screen,
      top: 3,
      left: 0,
      width: '100%',
      height: '100%-6',
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        style: { bg: 245 },
      },
    });

    // Footer line
    this.footerLine = blessed.box({
      parent: this.screen,
      bottom: 1,
      left: 0,
      width: '100%',
      height: 1,
      style: { fg: 245 },
    });
    this.updateFooterLine();

    // Footer
    this.footer = blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      tags: true,
      style: { fg: 245 },
    });

    // Enable input handling explicitly
    this.screen.enableKeys();
    this.screen.enableInput();

    // Key bindings
    this.screen.key(['q', 'C-c', 'escape'], () => {
      this.destroy();
      process.exit(0);
    });

    // Handle resize
    this.screen.on('resize', () => {
      this.updateHeaderLine();
      this.updateFooterLine();
      this.screen.render();
    });
  }

  private updateHeaderLine(): void {
    this.headerLine.setContent('─'.repeat(this.screen.width as number));
  }

  private updateFooterLine(): void {
    this.footerLine.setContent('─'.repeat(this.screen.width as number));
  }

  /**
   * Updates the display with new session data
   */
  update(sessions: TrackedSession[]): void {
    // Clear existing session boxes
    for (const box of this.sessionBoxes.values()) {
      box.destroy();
    }
    this.sessionBoxes.clear();

    // Render sessions
    const topLevelSessions = sessions.filter(s => !s.isSidechain);

    if (topLevelSessions.length === 0) {
      const emptyBox = blessed.box({
        parent: this.sessionContainer,
        top: 1,
        left: 2,
        width: '100%-4',
        height: 3,
        tags: true,
        content: '{245-fg}No active Claude sessions found.\nStart a Claude session to see it here.{/245-fg}',
      });
      this.sessionBoxes.set('empty', emptyBox);
    } else {
      let yOffset = 0;
      for (const session of topLevelSessions) {
        const height = this.renderSession(session, yOffset);
        yOffset += height + 1;
      }
    }

    // Update footer
    const now = new Date().toLocaleTimeString();
    this.footer.setContent(
      `{245-fg}Active: ${topLevelSessions.length} sessions | Updated: ${now}{/245-fg}`
    );

    this.screen.render();
  }

  private renderSession(session: TrackedSession, top: number): number {
    const name = generateName(session.sessionId);
    const timeAgo = formatTimeAgo(session.lastUpdate);
    const statusIcon = session.activity.type === 'waiting_input' ? '{yellow-fg}●{/yellow-fg}' : '{green-fg}●{/green-fg}';
    const branchInfo = session.gitBranch ? ` {245-fg}(${session.gitBranch}){/245-fg}` : '';
    const activityDisplay = ACTIVITY_DISPLAY[session.activity.type];

    // Shorten path
    const home = process.env.HOME || '';
    const path = session.projectPath.startsWith(home)
      ? '~' + session.projectPath.slice(home.length)
      : session.projectPath;

    // Create session box
    const sessionBox = blessed.box({
      parent: this.sessionContainer,
      top,
      left: 0,
      width: '100%',
      height: 5,
      tags: true,
    });

    // Line 1: Name and status
    blessed.box({
      parent: sessionBox,
      top: 0,
      left: 0,
      width: '100%',
      height: 1,
      tags: true,
      content: `${statusIcon} {bold}{cyan-fg}${name}{/cyan-fg}{/bold}${branchInfo} {245-fg}(${timeAgo}){/245-fg}`,
    });

    // Line 2: Path
    blessed.box({
      parent: sessionBox,
      top: 1,
      left: 3,
      width: '100%',
      height: 1,
      tags: true,
      content: `{245-fg}${path}{/245-fg}`,
    });

    // Line 3: Progress bar
    const percentage = session.tokens.percentage;
    const usedStr = formatTokens(session.tokens.used);
    const maxStr = formatTokens(session.tokens.max);
    const barWidth = Math.max(10, (this.screen.width as number) - 35);
    const filledWidth = Math.round((percentage / 100) * barWidth);
    const emptyWidth = barWidth - filledWidth;
    const barColor = getBarColor(percentage);

    const barContent = `Context: {${barColor}-fg}${'█'.repeat(filledWidth)}{/${barColor}-fg}{245-fg}${'░'.repeat(emptyWidth)}{/245-fg} ${percentage}% (${usedStr}/${maxStr})`;

    blessed.box({
      parent: sessionBox,
      top: 2,
      left: 3,
      width: '100%-3',
      height: 1,
      tags: true,
      content: barContent,
    });

    // Line 4: Activity
    let activityContent = `${activityDisplay.icon} ${activityDisplay.label}`;
    if (session.activity.detail) {
      const detail = session.activity.detail.startsWith(home)
        ? '~' + session.activity.detail.slice(home.length)
        : session.activity.detail;
      activityContent += ` {245-fg}(${detail}){/245-fg}`;
    }

    blessed.box({
      parent: sessionBox,
      top: 3,
      left: 3,
      width: '100%-3',
      height: 1,
      tags: true,
      content: activityContent,
    });

    this.sessionBoxes.set(session.sessionId, sessionBox);
    return 5;
  }

  /**
   * Destroys the UI
   */
  destroy(): void {
    this.screen.destroy();
  }

  /**
   * Renders the screen
   */
  render(): void {
    this.screen.render();
  }
}
