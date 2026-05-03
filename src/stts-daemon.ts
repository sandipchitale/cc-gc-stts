import http from 'node:http';
import fs, { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import * as ChromeLauncher from 'chrome-launcher';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FIXED_PORT = 15986;

type RequestConfig = {
  mode: 'stt' | 'tts';
  title: string;
  action: string;
  initialText?: string;
  startRecording?: boolean;
  text?: string;
  oneshot?: boolean;
};

type Pending = {
  config: RequestConfig;
  respond: (text: string) => void;
};

let pending: Pending | null = null;
let pageWaiter: ((cfg: RequestConfig) => void) | null = null;
let chrome: ChromeLauncher.LaunchedChrome | null = null;
let chromeLaunching: Promise<void> | null = null;

function loadHtml(): string {
  return fs.readFileSync(path.resolve(__dirname, 'stts_ui.html'), 'utf-8');
}

function loadStaticAsset(name: string): Buffer | null {
  const safe = path.basename(name);
  const full = path.resolve(__dirname, safe);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full);
}

function getChromeUserDataDir(): string {
  const dir = path.join(tmpdir(), 'cc-gc-stts-user-data-dir');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function shutdown() {
  try { if (chrome) chrome.kill(); } catch {}
  process.exit(0);
}

async function ensureChrome() {
  if (chrome) return;
  if (chromeLaunching) return chromeLaunching;
  chromeLaunching = (async () => {
    try {
      chrome = await ChromeLauncher.launch({
        startingUrl: 'about:blank',
        userDataDir: getChromeUserDataDir(),
        ignoreDefaultFlags: true,
        chromeFlags: [
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-infobars',
          `--app=http://127.0.0.1:${FIXED_PORT}/`,
          '--window-size=1600,600',
          '--autoplay-policy=no-user-gesture-required',
          '--auto-accept-camera-and-microphone-capture',
        ],
      });
      chrome.process.on('exit', () => {
        chrome = null;
        if (pending) {
          const p = pending;
          pending = null;
          p.respond('');
        }
      });
    } finally {
      chromeLaunching = null;
    }
  })();
  return chromeLaunching;
}

function deliverToPage() {
  if (!pending || !pageWaiter) return;
  const w = pageWaiter;
  pageWaiter = null;
  w(pending.config);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(loadHtml());
    return;
  }

  if (req.method === 'GET' && url.pathname === '/sanscript.js') {
    const data = loadStaticAsset('sanscript.js');
    if (!data) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    res.end(data);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/ping') {
    res.writeHead(200);
    res.end('ok');
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/shutdown') {
    res.writeHead(200);
    res.end('ok');
    setTimeout(shutdown, 50);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/request') {
    if (pending) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'busy' }));
      return;
    }
    let config: RequestConfig;
    try {
      config = JSON.parse(await readBody(req));
    } catch {
      res.writeHead(400);
      res.end('bad json');
      return;
    }

    let responded = false;
    const entry: Pending = {
      config,
      respond: (text: string) => {
        if (responded) return;
        responded = true;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ text }));
      },
    };
    pending = entry;

    req.on('close', () => {
      if (!responded && pending === entry) {
        pending = null;
      }
    });

    await ensureChrome();
    deliverToPage();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/wait') {
    if (pending) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(pending.config));
      return;
    }
    const waiter = (cfg: RequestConfig) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(cfg));
    };
    pageWaiter = waiter;
    req.on('close', () => {
      if (pageWaiter === waiter) pageWaiter = null;
    });
    return;
  }

  if (
    req.method === 'POST' &&
    (url.pathname === '/api/complete' ||
      url.pathname === '/api/cancel' ||
      url.pathname === '/api/close')
  ) {
    const text = url.pathname === '/api/complete' ? await readBody(req) : '';
    res.writeHead(200);
    res.end('ok');
    if (pending) {
      const p = pending;
      pending = null;
      p.respond(text);
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.requestTimeout = 0;
server.headersTimeout = 0;
server.timeout = 0;
server.keepAliveTimeout = 0;

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    process.exit(0);
  } else {
    console.error('server error', err);
    process.exit(1);
  }
});

server.listen(FIXED_PORT, '127.0.0.1');

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
