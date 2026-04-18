#!/usr/bin/env node
/**
 * Builds standalone event-client binaries for macOS, Windows, and Linux
 * using `bun build --compile`. Output is placed in backend/downloads/
 * so the server can serve them via /download.
 *
 * macOS targets are automatically code-signed with your Developer ID
 * Application identity if one is found. Pass --notarize (or set
 * NOTARIZE=1) to also submit the signed binaries to Apple for
 * notarization — this takes a few minutes per binary and requires
 * internet access, but makes downloads open without Gatekeeper nagging.
 *
 * Usage:
 *   node scripts/build-event-binaries.mjs                     # all targets, sign, no notarize
 *   node scripts/build-event-binaries.mjs macos-arm64         # single target
 *   node scripts/build-event-binaries.mjs --notarize          # sign + notarize
 *   node scripts/build-event-binaries.mjs --skip-sign         # fast builds, no signing
 *
 * Environment variables:
 *   SIGN_IDENTITY     "Developer ID Application: Name (TEAMID)" (defaults to first found)
 *   NOTARY_PROFILE    notarytool keychain profile name (default: "agent-office-notary")
 *   NOTARIZE=1        shortcut for --notarize
 *   SIGN=0            shortcut for --skip-sign
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, unlinkSync, chmodSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform as osPlatform, arch as osArch } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI_DIR = resolve(__dirname, '..');
const ROOT_DIR = resolve(CLI_DIR, '..');
const OUTPUT_DIR = resolve(ROOT_DIR, 'backend', 'downloads');
const ENTRY = resolve(CLI_DIR, 'src', 'event-main.ts');
const ENTITLEMENTS = resolve(__dirname, 'event-binary.entitlements');
const NOTARY_PROFILE = process.env.NOTARY_PROFILE ?? 'agent-office-notary';

// Bun 1.2.17 is the last version that produces Mach-O binaries that macOS
// codesign accepts. Newer versions (1.3+) embed their payload in a format
// that triggers "invalid or unsupported format for signature" errors.
// Pin to this specific version regardless of what the user has installed.
// https://github.com/oven-sh/bun/issues (codesign compatibility)
const PINNED_BUN_VERSION = '1.2.17';
const BUN_CACHE_DIR = resolve(CLI_DIR, '.bun-pinned');

/** Output filenames must match BINARY_FILENAMES in backend/src/event/download.ts */
const TARGETS = [
  { name: 'macos-arm64', bunTarget: 'bun-darwin-arm64', filename: 'agent-office-event-macos-arm64' },
  { name: 'macos-x64', bunTarget: 'bun-darwin-x64', filename: 'agent-office-event-macos-x64' },
  { name: 'windows', bunTarget: 'bun-windows-x64', filename: 'agent-office-event.exe' },
  { name: 'linux', bunTarget: 'bun-linux-x64', filename: 'agent-office-event-linux' },
];

function parseArgs(argv) {
  const args = {
    only: null,
    skip: new Set(),
    sign: process.env.SIGN !== '0',
    notarize: process.env.NOTARIZE === '1',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--skip') args.skip.add(argv[++i]);
    else if (a === '--skip-sign') args.sign = false;
    else if (a === '--notarize') { args.notarize = true; args.sign = true; }
    else if (!a.startsWith('--')) args.only = a;
  }
  return args;
}

function findSignIdentity() {
  if (process.env.SIGN_IDENTITY) return process.env.SIGN_IDENTITY;
  const result = spawnSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf-8' });
  if (result.status !== 0) return null;
  const match = result.stdout.match(/"(Developer ID Application:[^"]+)"/);
  return match ? match[1] : null;
}

function isMacosTarget(target) {
  return target.bunTarget.startsWith('bun-darwin');
}

function signBinary(target, outFile, identity) {
  console.log(`  🔏 Signerar med "${identity}"…`);
  const result = spawnSync(
    'codesign',
    [
      '--force',
      '--sign', identity,
      '--options', 'runtime',       // hardened runtime (krav för notarization)
      '--entitlements', ENTITLEMENTS,
      '--timestamp',                 // Apple-stämpel (krav för notarization)
      '--identifier', `se.plik.agent-office-event.${target.name}`,
      outFile,
    ],
    { stdio: 'inherit' }
  );
  if (result.status !== 0) return false;

  // Notes on --strict: Bun-compiled binaries have an embedded payload
  // section that `codesign --verify --strict` flags as invalid, even
  // though notarization accepts them. Plain --verify is enough here.
  const verify = spawnSync('codesign', ['--verify', '--verbose=2', outFile], { encoding: 'utf-8' });
  if (verify.status !== 0) {
    console.error('  ❌ Verifieringen av signaturen misslyckades:');
    console.error(verify.stderr || verify.stdout);
    return false;
  }
  console.log(`  ✓ Signerad och verifierad`);
  return true;
}

function notarizeBinary(outFile) {
  const zipFile = `${outFile}.zip`;
  console.log(`  📮 Packar till zip för notarization…`);
  const zip = spawnSync('ditto', ['-c', '-k', '--keepParent', outFile, zipFile], { stdio: 'inherit' });
  if (zip.status !== 0) return false;

  try {
    console.log(`  🍎 Skickar till Apple för notarization (kan ta några minuter)…`);
    const submit = spawnSync(
      'xcrun',
      ['notarytool', 'submit', zipFile, '--keychain-profile', NOTARY_PROFILE, '--wait'],
      { stdio: 'inherit' }
    );
    if (submit.status !== 0) {
      console.error('  ❌ Notarization misslyckades. Kör `xcrun notarytool log <submission-id> --keychain-profile ' + NOTARY_PROFILE + '` för detaljer.');
      return false;
    }

    // Standalone-binärer stöder inte `stapler staple` — notarization-ticket
    // verifieras online vid första körningen istället. Zip:en kan slängas.
    console.log(`  ✓ Notariserad`);
    return true;
  } finally {
    try { unlinkSync(zipFile); } catch { /* ignore */ }
  }
}

/**
 * Maps node's `process.platform` + `process.arch` to Bun's release artifact name.
 * Bun ships one artifact per combo (e.g. bun-darwin-aarch64.zip).
 */
function bunReleaseArtifact() {
  const p = osPlatform();
  const a = osArch();
  if (p === 'darwin' && a === 'arm64') return 'bun-darwin-aarch64';
  if (p === 'darwin' && a === 'x64')   return 'bun-darwin-x64';
  if (p === 'linux'  && a === 'x64')   return 'bun-linux-x64';
  if (p === 'linux'  && a === 'arm64') return 'bun-linux-aarch64';
  if (p === 'win32'  && a === 'x64')   return 'bun-windows-x64';
  return null;
}

function ensurePinnedBun() {
  const pinnedBin = resolve(BUN_CACHE_DIR, 'bun' + (osPlatform() === 'win32' ? '.exe' : ''));
  if (existsSync(pinnedBin)) {
    const v = spawnSync(pinnedBin, ['--version'], { encoding: 'utf-8' });
    if (v.status === 0 && v.stdout.trim() === PINNED_BUN_VERSION) {
      console.log(`✓ Pinnad Bun ${PINNED_BUN_VERSION} hittades (${pinnedBin})`);
      return pinnedBin;
    }
  }

  const artifact = bunReleaseArtifact();
  if (!artifact) {
    console.error(`❌ Kan inte auto-ladda Bun för ${osPlatform()}/${osArch()}.`);
    console.error(`   Installera Bun ${PINNED_BUN_VERSION} manuellt och sätt BUN=/sökväg/bun`);
    process.exit(1);
  }

  const url = `https://github.com/oven-sh/bun/releases/download/bun-v${PINNED_BUN_VERSION}/${artifact}.zip`;
  console.log(`⤵  Laddar ner Bun ${PINNED_BUN_VERSION} (${artifact})…`);

  mkdirSync(BUN_CACHE_DIR, { recursive: true });
  const zipFile = resolve(BUN_CACHE_DIR, 'bun.zip');

  let dl = spawnSync('curl', ['-fsSL', url, '-o', zipFile], { stdio: 'inherit' });
  if (dl.status !== 0) {
    console.error(`❌ Nedladdning av Bun misslyckades: ${url}`);
    process.exit(1);
  }

  const unzip = spawnSync('unzip', ['-oq', zipFile, '-d', BUN_CACHE_DIR], { stdio: 'inherit' });
  if (unzip.status !== 0) {
    console.error('❌ Kunde inte packa upp Bun-arkivet');
    process.exit(1);
  }

  // Zip contains a bun-<os>-<arch>/bun sub-folder — flatten into cache dir
  const extracted = resolve(BUN_CACHE_DIR, artifact, 'bun' + (osPlatform() === 'win32' ? '.exe' : ''));
  if (existsSync(extracted) && !existsSync(pinnedBin)) {
    const mv = spawnSync('mv', [extracted, pinnedBin], { stdio: 'inherit' });
    if (mv.status !== 0) {
      console.error('❌ Kunde inte flytta Bun-binären på plats');
      process.exit(1);
    }
  }

  try {
    chmodSync(pinnedBin, 0o755);
  } catch {
    // ignore on windows
  }
  try { unlinkSync(zipFile); } catch { /* ignore */ }

  console.log(`✓ Pinnad Bun ${PINNED_BUN_VERSION} installerad i ${BUN_CACHE_DIR}`);
  return pinnedBin;
}

function buildTarget(target, bunBin) {
  const outFile = resolve(OUTPUT_DIR, target.filename);
  console.log(`\n📦 Bygger ${target.name} → ${target.filename}…`);

  const result = spawnSync(
    bunBin,
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

function signAndNotarizeIfMacos(target, outFile, args, identity) {
  if (!isMacosTarget(target)) return true;
  if (!args.sign) return true;

  if (!identity) {
    console.warn(`  ⚠️  Ingen Developer ID hittades — hoppar över signering för ${target.name}`);
    return true;
  }

  if (!signBinary(target, outFile, identity)) return false;
  if (!args.notarize) return true;
  return notarizeBinary(outFile);
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

  const bunBin = process.env.BUN ?? ensurePinnedBun();

  const selected = args.only
    ? TARGETS.filter((t) => t.name === args.only)
    : TARGETS.filter((t) => !args.skip.has(t.name));

  if (selected.length === 0) {
    console.error(`❌ Inga targets att bygga (only=${args.only}, skip=${[...args.skip].join(',')})`);
    process.exit(1);
  }

  const identity = args.sign && selected.some(isMacosTarget) ? findSignIdentity() : null;
  if (args.sign && selected.some(isMacosTarget)) {
    console.log(identity
      ? `\n🔐 Signerar macOS-targets med: ${identity}${args.notarize ? ' (notarization aktiverat)' : ''}`
      : '\n⚠️  Inget Developer ID Application-cert hittades — macOS-binärerna kommer visa Gatekeeper-varning.');
  }

  console.log(`\nBygger ${selected.length} target(s) → ${OUTPUT_DIR}`);

  let failures = 0;
  for (const target of selected) {
    if (!buildTarget(target, bunBin)) { failures++; continue; }
    if (!signAndNotarizeIfMacos(target, resolve(OUTPUT_DIR, target.filename), args, identity)) failures++;
  }

  console.log('');
  if (failures > 0) {
    console.error(`❌ ${failures} av ${selected.length} target(s) misslyckades.`);
    process.exit(1);
  }
  console.log(`✅ Klart! ${selected.length} binär(er) byggda i ${OUTPUT_DIR}`);
}

main();
