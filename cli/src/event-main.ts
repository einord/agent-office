#!/usr/bin/env node
/**
 * Standalone entry point for the event-mode client.
 *
 * Flow:
 *   1. Greet the user.
 *   2. Load (or create) persisted state at ~/.agent-office-event.json.
 *   3. Prompt for display name, falling back to the saved one.
 *   4. Discover the server (mDNS → UDP → manual prompt).
 *   5. Start the EventMonitor — auto-reconnect, presence agent, etc.
 */

import { EventClient } from './event/client.js';
import { SessionWatcher } from './event/session-watcher.js';
import { EventMonitor, type ConnectionStatus } from './event/event-monitor.js';
import { discoverServer } from './event/discovery.js';
import { promptDisplayName, promptServerUrl } from './event/prompt.js';
import { loadState, saveState, generateUserKey, type EventClientState } from './event/storage.js';

interface ParsedArgs {
  serverUrl?: string;
  name?: string;
  forceNew: boolean;
  help: boolean;
}

function parseArgs(): ParsedArgs {
  const argv = process.argv.slice(2);
  const out: ParsedArgs = { forceNew: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--server' || a === '-s') out.serverUrl = argv[++i];
    else if (a.startsWith('--server=')) out.serverUrl = a.split('=')[1];
    else if (a === '--name' || a === '-n') out.name = argv[++i];
    else if (a.startsWith('--name=')) out.name = a.split('=')[1];
    else if (a === '--reset') out.forceNew = true;
  }
  return out;
}

function showHelp(): void {
  console.log(`
Agent Office — Event Client

Användning: agent-office-event [flaggor]

Flaggor:
  -h, --help             Visa hjälp
  -n, --name <namn>      Använd ett specifikt namn (hoppar över prompt)
  -s, --server <url>     Hoppa över discovery och anslut direkt
      --reset            Glöm sparat namn och börja om

Filen ~/.agent-office-event.json sparar ditt namn så du slipper skriva det varje gång.
`);
}

function printBanner(): void {
  process.stdout.write(`\n  Agent Office — Event Client\n`);
  process.stdout.write(`  ────────────────────────────\n\n`);
}

function printStatus(status: ConnectionStatus, name: string): void {
  const dot = status.connected ? '🟢' : '🟡';
  process.stdout.write(`  ${dot} ${name} – ${status.message}\n`);
}

async function getOrCreateState(args: ParsedArgs): Promise<EventClientState> {
  const existing = args.forceNew ? null : await loadState();

  let displayName = args.name ?? existing?.displayName;
  if (!displayName) {
    displayName = await promptDisplayName();
  } else if (!args.name) {
    // Confirm the saved name (default = keep)
    const confirmed = await promptDisplayName(displayName);
    displayName = confirmed;
  }

  const userKey = existing?.userKey ?? generateUserKey();
  const lastServerUrl = args.serverUrl ?? existing?.lastServerUrl;
  return { userKey, displayName, lastServerUrl };
}

async function findServer(args: ParsedArgs, hint?: string): Promise<string> {
  if (args.serverUrl) return args.serverUrl;

  process.stdout.write('  🔎 Letar efter servern på nätverket…\n');
  const discovered = await discoverServer(4_000);
  if (discovered) {
    process.stdout.write(`  ✅ Hittade "${discovered.name}" på ${discovered.serverUrl}\n`);
    return discovered.serverUrl;
  }

  if (hint) {
    process.stdout.write(`  ⚠️  Hittade inte servern automatiskt. Försöker senast använda: ${hint}\n`);
    return hint;
  }

  process.stdout.write('  ⚠️  Hittade ingen server automatiskt. Skriv in adressen manuellt.\n');
  const manual = await promptServerUrl();
  if (!manual) {
    process.stdout.write('\n  Ingen adress angiven. Avslutar.\n');
    process.exit(1);
  }
  return manual;
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args.help) {
    showHelp();
    process.exit(0);
  }

  printBanner();

  const state = await getOrCreateState(args);
  const serverUrl = await findServer(args, state.lastServerUrl);

  await saveState({ ...state, lastServerUrl: serverUrl });

  const client = new EventClient({
    serverUrl,
    userKey: state.userKey,
    displayName: state.displayName,
  });
  const watcher = new SessionWatcher();

  const monitor = new EventMonitor({
    client,
    watcher,
    onStatusChange: (status) => printStatus(status, state.displayName),
  });

  const shutdown = async (signal: string) => {
    process.stdout.write(`\n  ${signal} – kopplar ner snyggt…\n`);
    try {
      await monitor.stop();
    } catch {
      // ignore
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('Ctrl+C'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  process.stdout.write(`  👤 Du är ${state.displayName}.\n`);
  process.stdout.write(`  📡 Server: ${serverUrl}\n\n`);

  await monitor.start();

  process.stdout.write('\n  Klart! Lämna fönstret öppet under eventet — starta gärna Claude Code så syns du på storbilden.\n');
  process.stdout.write('  (Stäng med Ctrl+C när du är klar.)\n\n');
}

main().catch((err) => {
  console.error('  Något gick fel vid uppstart:', err instanceof Error ? err.message : err);
  process.exit(1);
});
