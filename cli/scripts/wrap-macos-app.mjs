#!/usr/bin/env node
/**
 * Wraps a Bun-compiled macOS binary in a proper .app bundle so double-clicking
 * it in Finder opens Terminal and runs the client (instead of opening the
 * binary in a text editor because it lacks a file extension).
 *
 * Structure produced:
 *
 *   Agent Office Event.app/
 *     Contents/
 *       Info.plist              <- bundle metadata
 *       MacOS/
 *         AgentOfficeEvent      <- shell launcher that opens Terminal
 *       Resources/
 *         agent-office-event    <- the Bun binary
 *
 * Usage (invoked from build-event-binaries.mjs):
 *   wrapMacosApp({ binary: '/path/to/bun-binary', outDir: '/path/to/output', arch: 'arm64' })
 */

import { existsSync, mkdirSync, writeFileSync, copyFileSync, chmodSync, rmSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';

const BUNDLE_NAME = 'Agent Office Event';
const BUNDLE_ID = 'se.plik.agent-office-event';

/** Build the .app directory structure. Returns the absolute .app path. */
export function wrapMacosApp({ binary, outDir, arch }) {
  if (!existsSync(binary)) throw new Error(`Binary not found: ${binary}`);

  // Suffix the arch so macos-arm64 and macos-x64 can coexist in one folder
  const archLabel = arch === 'arm64' ? 'Apple Silicon' : 'Intel';
  const appName = `${BUNDLE_NAME} (${archLabel})`;
  const appPath = resolve(outDir, `${appName}.app`);

  // Clean any previous bundle
  if (existsSync(appPath)) rmSync(appPath, { recursive: true, force: true });

  const contentsDir = join(appPath, 'Contents');
  const macosDir = join(contentsDir, 'MacOS');
  const resourcesDir = join(contentsDir, 'Resources');
  mkdirSync(macosDir, { recursive: true });
  mkdirSync(resourcesDir, { recursive: true });

  // Copy the Bun binary into Resources/
  const innerBinaryName = 'agent-office-event';
  const innerBinaryPath = join(resourcesDir, innerBinaryName);
  copyFileSync(binary, innerBinaryPath);
  chmodSync(innerBinaryPath, 0o755);

  // Write the launcher shell script. This runs when the user double-clicks the
  // .app — it opens a Terminal window and execs the inner binary inside it.
  const launcherName = 'AgentOfficeEvent';
  const launcherPath = join(macosDir, launcherName);
  const launcher = `#!/bin/bash
# Auto-generated launcher — opens Terminal and runs the event client.
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$APP_DIR/Resources/${innerBinaryName}"

# AppleScript to open a fresh Terminal window and run the binary.
# The quoting dance protects paths with spaces.
/usr/bin/osascript <<OSA
tell application "Terminal"
  activate
  do script "clear && '$BIN'; echo; echo '[Fönstret kan stängas när du är klar.]'"
end tell
OSA
`;
  writeFileSync(launcherPath, launcher, { mode: 0o755 });

  // Write Info.plist — minimal but correct.
  const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDisplayName</key>
	<string>${BUNDLE_NAME}</string>
	<key>CFBundleName</key>
	<string>${BUNDLE_NAME}</string>
	<key>CFBundleIdentifier</key>
	<string>${BUNDLE_ID}.${arch}</string>
	<key>CFBundleVersion</key>
	<string>1.0</string>
	<key>CFBundleShortVersionString</key>
	<string>1.0</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleExecutable</key>
	<string>${launcherName}</string>
	<key>CFBundleSignature</key>
	<string>????</string>
	<key>LSMinimumSystemVersion</key>
	<string>11.0</string>
	<key>LSUIElement</key>
	<false/>
	<key>NSHighResolutionCapable</key>
	<true/>
</dict>
</plist>
`;
  writeFileSync(join(contentsDir, 'Info.plist'), infoPlist);

  return appPath;
}

// Allow invoking as a CLI too (mostly for debugging)
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , binary, outDir, arch] = process.argv;
  if (!binary || !outDir || !arch) {
    console.error('Usage: wrap-macos-app.mjs <binary> <outDir> <arm64|x64>');
    process.exit(1);
  }
  const app = wrapMacosApp({ binary, outDir, arch });
  console.log(app);
}
