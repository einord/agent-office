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
import { existsSync, mkdirSync, statSync, unlinkSync, chmodSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform as osPlatform, arch as osArch } from 'node:os';
import { wrapMacosApp } from './wrap-macos-app.mjs';

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

/**
 * Output filenames must match BINARY_FILENAMES in backend/src/event/download.ts.
 * macOS targets build to a raw binary first, then get wrapped in a .app bundle
 * (so double-clicking in Finder opens Terminal instead of a text editor). The
 * distributed `filename` is therefore a zipped .app, while `rawName` is the
 * intermediate Bun output.
 */
const TARGETS = [
  { name: 'macos-arm64', bunTarget: 'bun-darwin-arm64', arch: 'arm64', filename: 'Agent Office Event (Apple Silicon).app.zip', rawName: '.raw-macos-arm64' },
  { name: 'macos-x64',   bunTarget: 'bun-darwin-x64',   arch: 'x64',   filename: 'Agent Office Event (Intel).app.zip',         rawName: '.raw-macos-x64'   },
  { name: 'windows',     bunTarget: 'bun-windows-x64',  filename: 'agent-office-event.exe' },
  { name: 'linux',       bunTarget: 'bun-linux-x64',    filename: 'agent-office-event-linux' },
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

function codesignPath(targetPath, identity, bundleId) {
  const result = spawnSync(
    'codesign',
    [
      '--force',
      '--sign', identity,
      '--options', 'runtime',
      '--entitlements', ENTITLEMENTS,
      '--timestamp',
      '--identifier', bundleId,
      targetPath,
    ],
    { stdio: 'inherit' }
  );
  return result.status === 0;
}

/**
 * Signs, optionally notarizes + staples, and zips a macOS .app bundle for
 * distribution. Replaces the raw Bun binary with a proper double-clickable
 * .app that opens Terminal and runs the client.
 */
function buildMacosAppBundle(target, rawBinary, args, identity) {
  if (!identity) {
    console.warn(`  ⚠️  Ingen Developer ID — skapar .app utan signering (kommer ge Gatekeeper-varning).`);
  }

  console.log(`  📦 Wrappar i .app-bundle…`);
  const appPath = wrapMacosApp({ binary: rawBinary, outDir: OUTPUT_DIR, arch: target.arch });

  if (identity) {
    console.log(`  🔏 Signerar inre binär + bundle…`);
    const innerBinary = join(appPath, 'Contents', 'Resources', 'agent-office-event');
    if (!codesignPath(innerBinary, identity, `se.plik.agent-office-event.${target.name}.inner`)) return false;
    if (!codesignPath(appPath, identity, `se.plik.agent-office-event.${target.name}`)) return false;
    console.log(`  ✓ Signerad`);
  }

  const zipFile = resolve(OUTPUT_DIR, target.filename);
  const makeZip = () => {
    try { unlinkSync(zipFile); } catch { /* ignore */ }
    const zip = spawnSync('ditto', ['-c', '-k', '--keepParent', appPath, zipFile], { stdio: 'inherit' });
    return zip.status === 0;
  };

  if (args.notarize && identity) {
    console.log(`  📮 Packar .app för notarization…`);
    if (!makeZip()) return false;

    console.log(`  🍎 Skickar till Apple (kan ta några minuter)…`);
    const submit = spawnSync(
      'xcrun',
      ['notarytool', 'submit', zipFile, '--keychain-profile', NOTARY_PROFILE, '--wait'],
      { stdio: 'inherit' }
    );
    if (submit.status !== 0) {
      console.error(`  ❌ Notarization misslyckades.`);
      return false;
    }

    console.log(`  📎 Staplar notarization-ticket på .app…`);
    const staple = spawnSync('xcrun', ['stapler', 'staple', appPath], { stdio: 'inherit' });
    if (staple.status !== 0) {
      console.error(`  ❌ Stapling misslyckades.`);
      return false;
    }

    console.log(`  📦 Packar om .app (nu med stapled ticket)…`);
    if (!makeZip()) return false;
    console.log(`  ✓ Notariserad och staplad`);
  } else {
    if (!makeZip()) return false;
  }

  // Clean up: keep only the distributed .zip, drop raw binary and .app dir
  try { rmSync(appPath, { recursive: true, force: true }); } catch { /* ignore */ }
  try { unlinkSync(rawBinary); } catch { /* ignore */ }

  const sizeMB = (statSync(zipFile).size / (1024 * 1024)).toFixed(1);
  console.log(`  ✓ ${target.filename}: ${sizeMB} MB`);
  return true;
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
  // macOS targets build to a raw intermediate, others write directly to final.
  const outName = target.rawName ?? target.filename;
  const outFile = resolve(OUTPUT_DIR, outName);
  console.log(`\n📦 Bygger ${target.name}…`);

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
  console.log(`  ✓ Kompilerad: ${sizeMB} MB`);
  return true;
}

/** Runs macOS-specific post-build: wrap in .app, sign, zip, notarize + staple. */
function postBuildMacos(target, args, identity) {
  if (!isMacosTarget(target)) {
    // For non-macOS targets, the bun output is already the final file.
    return true;
  }
  const rawBinary = resolve(OUTPUT_DIR, target.rawName);
  // Even with --skip-sign we still need to wrap so Finder doesn't open the
  // binary in a text editor. We just skip the codesign step.
  return buildMacosAppBundle(target, rawBinary, args, args.sign ? identity : null);
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
    if (!postBuildMacos(target, args, identity)) failures++;
  }

  console.log('');
  if (failures > 0) {
    console.error(`❌ ${failures} av ${selected.length} target(s) misslyckades.`);
    process.exit(1);
  }
  console.log(`✅ Klart! ${selected.length} binär(er) byggda i ${OUTPUT_DIR}`);
}

main();
