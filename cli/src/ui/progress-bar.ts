import chalk from 'chalk';

/**
 * Renders a progress bar for context window usage
 * @param percentage Percentage filled (0-100)
 * @param width Width of the bar in characters
 * @returns Colored progress bar string
 */
export function renderProgressBar(percentage: number, width: number = 20): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;

  // Color based on percentage
  let colorFn: (s: string) => string;
  if (percentage >= 90) {
    colorFn = chalk.red;
  } else if (percentage >= 70) {
    colorFn = chalk.yellow;
  } else {
    colorFn = chalk.green;
  }

  const filledBar = colorFn('█'.repeat(filled));
  const emptyBar = chalk.gray('░'.repeat(empty));

  return filledBar + emptyBar;
}

/**
 * Formats token count for display
 * @param tokens Number of tokens
 * @returns Formatted string (e.g., "124K", "1.2M")
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${Math.round(tokens / 1_000)}K`;
  }
  return tokens.toString();
}

/**
 * Renders a full context usage line
 * @param used Tokens used
 * @param max Maximum tokens
 * @returns Formatted context line
 */
export function renderContextLine(used: number, max: number): string {
  const percentage = Math.min(100, Math.round((used / max) * 100));
  const bar = renderProgressBar(percentage);
  const usedStr = formatTokens(used);
  const maxStr = formatTokens(max);

  let statusIcon = '';
  if (percentage >= 100) {
    statusIcon = chalk.red(' ⚠️');
  }

  return `📊 Context: ${bar} ${percentage}% (${usedStr}/${maxStr} tokens)${statusIcon}`;
}
