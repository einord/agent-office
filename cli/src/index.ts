#!/usr/bin/env node

import { ClaudeMonitor } from './monitor.js';

/**
 * Parses command line arguments.
 * @returns Parsed arguments object
 */
function parseArgs(): { serverUrl?: string; apiKey?: string; help: boolean } {
  const args = process.argv.slice(2);
  const result: { serverUrl?: string; apiKey?: string; help: boolean } = { help: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--server-url' || arg === '-s') {
      result.serverUrl = args[++i];
    } else if (arg === '--api-key' || arg === '-k') {
      result.apiKey = args[++i];
    } else if (arg.startsWith('--server-url=')) {
      result.serverUrl = arg.split('=')[1];
    } else if (arg.startsWith('--api-key=')) {
      result.apiKey = arg.split('=')[1];
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

Examples:
  agent-office
    Run without server sync

  agent-office --server-url http://localhost:3100 --api-key abc123
    Run with server sync enabled

Environment variables:
  AGENT_OFFICE_SERVER_URL   Alternative to --server-url
  AGENT_OFFICE_API_KEY      Alternative to --api-key

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

  // Validate that if one is provided, both are provided
  if ((serverUrl && !apiKey) || (!serverUrl && apiKey)) {
    console.error('Error: Both --server-url and --api-key must be provided together.');
    console.error('Run with --help for usage information.');
    process.exit(1);
  }

  const syncConfig = serverUrl && apiKey ? { serverUrl, apiKey } : undefined;

  if (syncConfig) {
    console.log(`Server sync enabled: ${syncConfig.serverUrl}`);
  }

  const monitor = new ClaudeMonitor(syncConfig);

  try {
    await monitor.start();
  } catch (error) {
    console.error('Failed to start monitor:', error);
    process.exit(1);
  }
}

main();
