import type { Request, Response } from 'express';
import { existsSync, statSync, createReadStream, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { networkInterfaces } from 'os';
import { getConfig } from '../config/config-loader.js';

/** Directory (relative to cwd) where event client binaries live */
const DOWNLOADS_DIR = resolve(process.cwd(), 'downloads');

/** Mapping of platform slug → expected binary filename */
const BINARY_FILENAMES: Record<string, string> = {
  'macos-arm64': 'Agent Office Event (Apple Silicon).app.zip',
  'macos-x64':   'Agent Office Event (Intel).app.zip',
  windows:       'agent-office-event.exe',
  linux:         'agent-office-event-linux',
};

function getLanAddress(): string {
  const ifaces = networkInterfaces();
  for (const entries of Object.values(ifaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return 'localhost';
}

function availableBinaries(): Array<{ platform: string; filename: string; sizeMB: string }> {
  if (!existsSync(DOWNLOADS_DIR)) return [];

  const files = new Set<string>();
  try {
    for (const entry of readdirSync(DOWNLOADS_DIR)) files.add(entry);
  } catch {
    return [];
  }

  const out: Array<{ platform: string; filename: string; sizeMB: string }> = [];
  for (const [platform, filename] of Object.entries(BINARY_FILENAMES)) {
    if (!files.has(filename)) continue;
    try {
      const size = statSync(join(DOWNLOADS_DIR, filename)).size;
      out.push({ platform, filename, sizeMB: (size / (1024 * 1024)).toFixed(1) });
    } catch {
      // ignore
    }
  }
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderPage(): string {
  const config = getConfig();
  const eventName = config.eventMode?.serverName ?? 'Agent Office';
  const host = getLanAddress();
  const port = config.server.httpPort;
  const binaries = availableBinaries();

  const labels: Record<string, string> = {
    'macos-arm64': 'macOS (Apple Silicon)',
    'macos-x64':   'macOS (Intel)',
    windows:       'Windows',
    linux:         'Linux',
  };

  const downloadsHtml = binaries.length
    ? binaries
        .map(
          (b) =>
            `<a class="btn" href="/download/${b.platform}" download>
               <span class="os">${escapeHtml(labels[b.platform] ?? b.platform)}</span>
               <span class="size">${b.sizeMB} MB</span>
             </a>`
        )
        .join('\n')
    : `<p class="warn">Inga klientbinärer hittades i <code>./downloads/</code>. Kör build-scriptet först.</p>`;

  return `<!doctype html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(eventName)} — Ladda ner klient</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      background: radial-gradient(1200px 600px at 50% -200px, #3a2c6a 0%, #1b1232 45%, #0d0820 100%);
      color: #eee; min-height: 100vh; display: grid; place-items: center; padding: 2rem;
    }
    .card {
      width: 100%; max-width: 640px; background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 2.5rem;
      backdrop-filter: blur(8px);
    }
    h1 { margin: 0 0 0.25rem; font-size: 2rem; letter-spacing: -0.01em; }
    .sub { color: #aaa; margin: 0 0 2rem; }
    .downloads { display: grid; gap: 0.75rem; margin-bottom: 1.5rem; }
    .btn {
      display: flex; justify-content: space-between; align-items: center;
      padding: 1rem 1.25rem; border-radius: 12px; text-decoration: none;
      background: linear-gradient(135deg, #6d5de8 0%, #a24ff0 100%); color: #fff;
      font-weight: 600; transition: transform 120ms ease, box-shadow 120ms ease;
      box-shadow: 0 4px 14px rgba(108,93,232,0.35);
    }
    .btn:hover { transform: translateY(-1px); box-shadow: 0 8px 22px rgba(108,93,232,0.5); }
    .os { font-size: 1.05rem; }
    .size { opacity: 0.8; font-weight: 500; font-size: 0.9rem; }
    .steps { color: #ccc; line-height: 1.65; }
    .steps ol { padding-left: 1.25rem; }
    .steps li { margin-bottom: 0.5rem; }
    code { background: rgba(255,255,255,0.08); padding: 0.1rem 0.4rem; border-radius: 6px; }
    .warn { padding: 1rem; background: rgba(255, 150, 50, 0.12); border-radius: 10px; color: #ffc492; }
    .server { margin-top: 1.5rem; font-size: 0.85rem; color: #888; text-align: center; }
  </style>
</head>
<body>
  <main class="card">
    <h1>${escapeHtml(eventName)}</h1>
    <p class="sub">Ladda ner klienten, starta den, skriv ditt namn — och kika upp på storbilden!</p>

    <div class="downloads">
      ${downloadsHtml}
    </div>

    <div class="steps">
      <strong>Så här gör du:</strong>
      <ol>
        <li>Välj rätt version för din dator och ladda ner filen.</li>
        <li><strong>macOS:</strong> Packa upp .zip-filen och dubbelklicka appen. Terminal öppnas automatiskt.</li>
        <li><strong>Windows:</strong> Dubbelklicka filen. Om Windows varnar: <em>Mer info</em> → <em>Kör ändå</em>.</li>
        <li>Skriv ditt namn när du blir tillfrågad.</li>
        <li>Starta Claude Code och börja koda — du syns direkt på storbilden! ✨</li>
      </ol>
    </div>

    <div class="server">
      Server: <code>${host}:${port}</code>
    </div>
  </main>
</body>
</html>`;
}

/**
 * GET /download - renders the download landing page.
 */
export function handleDownloadPage(_req: Request, res: Response): void {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(renderPage());
}

/**
 * GET /download/:platform - streams the binary for the given platform.
 */
export function handleDownloadBinary(req: Request, res: Response): void {
  const { platform } = req.params;
  const filename = BINARY_FILENAMES[platform];
  if (!filename) {
    res.status(404).json({ error: 'Unknown platform' });
    return;
  }

  const filePath = join(DOWNLOADS_DIR, filename);
  if (!existsSync(filePath)) {
    res.status(404).json({ error: 'Binary not available' });
    return;
  }

  const stats = statSync(filePath);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', String(stats.size));
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const stream = createReadStream(filePath);
  // Without these listeners an unexpected stream error (client disconnect
  // mid-download, disk I/O hiccup) would bubble up as an unhandled 'error'
  // event and crash the Node process — unacceptable during a live event.
  stream.on('error', (err) => {
    console.error(`[Download] Stream error serving ${filename}:`, err.message);
    if (!res.headersSent) {
      res.status(500).end();
    } else {
      res.destroy();
    }
  });
  res.on('close', () => {
    if (!stream.destroyed) stream.destroy();
  });
  stream.pipe(res);
}
