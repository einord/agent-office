#!/usr/bin/env node

import { ClaudeMonitor } from './monitor.js';

/**
 * Main entry point for the Claude Agent Monitor CLI
 */
async function main(): Promise<void> {
  const monitor = new ClaudeMonitor();

  try {
    await monitor.start();
  } catch (error) {
    console.error('Failed to start monitor:', error);
    process.exit(1);
  }
}

main();
