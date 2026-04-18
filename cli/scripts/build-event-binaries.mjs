#!/usr/bin/env node
/**
 * Builds standalone event-client binaries for macOS, Windows, and Linux
 * using `bun build --compile`. Output is placed in backend/downloads/
 * so the server can serve them via /download.
 *
 * Usage:
 *   node scripts/build-event-binaries.mjs            # build all targets
 *   node scripts/build-event-binaries.mjs macos      # build a single target
 *   node scripts/build-event-binaries.mjs --skip macos-x64
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI_DIR = resolve(__dirname, '..');
const ROOT_DIR = resolve(CLI_DIR, '..');
const OUTPUT_DIR = resolve(ROOT_DIR, 'backend', 'downloads');
const ENTRY = resolve(CLI_DIR, 'src', 'event-main.ts');

/** Output filenames must match BINARY_FILENAMES in backend/src/event/download.ts */
const TARGETS = [
  { name: 'macos-arm64', bunTarget: 'bun-darwin-arm64', filename: 'agent-office-event-macos-arm64' },
  { name: 'macos-x64', bunTarget: 'bun-darwin-x64', filename: 'agent-office-event-macos-x64' },
  { name: 'windows', bunTarget: 'bun-windows-x64', filename: 'agent-office-event.exe' },
  { name: 'linux', bunTarget: 'bun-linux-x64', filename: 'agent-office-event-linux' },
];

function parseArgs(argv) {
  const args = { only: null, skip: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--skip') args.skip.add(argv[++i]);
    else if (!a.startsWith('--')) args.only = a;
  }
  return args;
}

function ensureBunInstalled() {
  const result = spawnSync('bun', ['--version'], { encoding: 'utf-8' });
  if (result.status !== 0) {
    console.error('❌ Bun saknas. Installera med:  brew install oven-sh/bun/bun');
    process.exit(1);
  }
  console.log(`✓ Bun ${result.stdout.trim()} hittades`);
}

function buildTarget(target) {
  const outFile = resolve(OUTPUT_DIR, target.filename);
  console.log(`\n📦 Bygger ${target.name} → ${target.filename}…`);

  const result = spawnSync(
    'bun',
    [
      'build',
      '--compile',
      `--target=${target.bunTarget}`,
      '--minify',
      '--sourcemap=none',
      ENTRY,
      '--outfile',
      outFile,
    ],
    { cwd: CLI_DIR, stdio: 'inherit', env: process.env }
  );

  if (result.status !== 0) {
    console.error(`❌ Build misslyckades för ${target.name}`);
    return false;
  }

  if (!existsSync(outFile)) {
    console.error(`❌ Förväntad fil saknas: ${outFile}`);
    return false;
  }

  const sizeMB = (statSync(outFile).size / (1024 * 1024)).toFixed(1);
  console.log(`✓ ${target.name}: ${sizeMB} MB → ${outFile}`);
  return true;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!existsSync(ENTRY)) {
    console.error(`❌ Hittar inte entry: ${ENTRY}`);
    process.exit(1);
  }

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  ensureBunInstalled();

  const selected = args.only
    ? TARGETS.filter((t) => t.name === args.only)
    : TARGETS.filter((t) => !args.skip.has(t.name));

  if (selected.length === 0) {
    console.error(`❌ Inga targets att bygga (only=${args.only}, skip=${[...args.skip].join(',')})`);
    process.exit(1);
  }

  console.log(`\nBygger ${selected.length} target(s) → ${OUTPUT_DIR}`);

  let failures = 0;
  for (const target of selected) {
    if (!buildTarget(target)) failures++;
  }

  console.log('');
  if (failures > 0) {
    console.error(`❌ ${failures} av ${selected.length} target(s) misslyckades.`);
    process.exit(1);
  }
  console.log(`✅ Klart! ${selected.length} binär(er) byggda i ${OUTPUT_DIR}`);
}

main();
