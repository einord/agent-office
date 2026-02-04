#!/usr/bin/env node

import { ClaudeMonitor } from './monitor.js';

/**
 * Parsed command line arguments.
 */
interface ParsedArgs {
  serverUrl?: string;
  apiKey?: string;
  claudeDir?: string;
  help: boolean;
}

/**
 * Parses command line arguments.
 * @returns Parsed arguments object
 */
function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const result: ParsedArgs = { help: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--server-url' || arg === '-s') {
      result.serverUrl = args[++i];
    } else if (arg === '--api-key' || arg === '-k') {
      result.apiKey = args[++i];
    } else if (arg === '--claude-dir' || arg === '-c') {
      result.claudeDir = args[++i];
    } else if (arg.startsWith('--server-url=')) {
      result.serverUrl = arg.split('=')[1];
    } else if (arg.startsWith('--api-key=')) {
      result.apiKey = arg.split('=')[1];
    } else if (arg.startsWith('--claude-dir=')) {
      result.claudeDir = arg.split('=')[1];
    }
  }

  return result;
}

/**
 * Displays help information.
 */
function showHelp(): void {
  console.log(`
Claude Agent Monitor - Track Claude Code sessions

Usage: agent-office [options]

Options:
  -h, --help                Show this help message
  -s, --server-url <url>    Backend server URL for sync (e.g., http://localhost:3100)
  -k, --api-key <key>       API key for backend authentication
  -c, --claude-dir <path>   Custom claude directory path (default: ~/.claude)

Examples:
  agent-office
    Run without server sync

  agent-office --server-url http://localhost:3100 --api-key abc123
    Run with server sync enabled

  agent-office --claude-dir /custom/path/.claude
    Use a custom claude directory

Environment variables:
  AGENT_OFFICE_SERVER_URL   Alternative to --server-url
  AGENT_OFFICE_API_KEY      Alternative to --api-key
  CLAUDE_CONFIG_DIR         Alternative to --claude-dir

When server sync is enabled, agent status changes are automatically
synchronized to the backend server in real-time.
`);
}

/**
 * Main entry point for the Claude Agent Monitor CLI.
 */
async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  // Allow environment variables as fallback
  const serverUrl = args.serverUrl || process.env.AGENT_OFFICE_SERVER_URL;
  const apiKey = args.apiKey || process.env.AGENT_OFFICE_API_KEY;
  const claudeDir = args.claudeDir || process.env.CLAUDE_CONFIG_DIR;

  // Validate that if one is provided, both are provided
  if ((serverUrl && !apiKey) || (!serverUrl && apiKey)) {
    console.error('Error: Both --server-url and --api-key must be provided together.');
    console.error('Run with --help for usage information.');
    process.exit(1);
  }

  // Build monitor config
  const monitorConfig = serverUrl && apiKey
    ? { serverUrl, apiKey, claudeDir }
    : claudeDir
      ? { serverUrl: '', apiKey: '', claudeDir }
      : undefined;

  if (serverUrl) {
    console.log(`Server sync enabled: ${serverUrl}`);
  }

  if (claudeDir) {
    console.log(`Using claude directory: ${claudeDir}`);
  }

  const monitor = new ClaudeMonitor(monitorConfig);

  try {
    await monitor.start();
  } catch (error) {
    console.error('Failed to start monitor:', error);
    process.exit(1);
  }
}

main();
