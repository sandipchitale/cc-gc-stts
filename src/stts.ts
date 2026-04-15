import { rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Browser } from 'puppeteer-core';
import * as ChromeLauncher from 'chrome-launcher';
import { program } from 'commander';
import { launchChrome, connectToChrome } from './chrome-sidekick.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function runStt(argv: string[]) {
  const sub = program
    .name('stts stt')
    .description('Speech to Text GUI')
    .version('1.0.0')
    .option('--title <title>', 'Title of the page', 'Type or dictate')
    .option('--action <label>', 'Label for the complete button', 'Send')
    .option('--start-recording', 'Start in recording mode')
    .argument('[text...]', 'Initial text')
    .helpOption('-h, --help', 'Display help for command')
    .parse(argv, { from: 'user' });

  const options = sub.opts();
  let initialText = (sub.args || []).join(' ');

  const stdinText = await readStdin();
  if (stdinText) {
    initialText = initialText ? `${initialText}\n${stdinText}` : stdinText;
  }

  const uiPath = path.resolve(__dirname, 'stt_ui.html');
  const url = `file://${uiPath}`;
  const tempDir = path.join(tmpdir(), `ai-sidekick-prompt-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });

  let chrome: ChromeLauncher.LaunchedChrome | undefined;
  let browser: Browser | undefined;

  try {
    const userDataDir = path.join(tempDir, 'profile');
    mkdirSync(userDataDir, { recursive: true });

    chrome = await launchChrome({
      startingUrl: 'about:blank',
      userDataDir,
      chromeFlags: [
        `--app=${url}`,
        '--window-size=800,600',
        '--allow-file-access-from-files'
      ],
    });

    browser = await connectToChrome(chrome.port);

    const [page] = await browser.pages();

    page.on('console', _msg => {});

    const context = browser.defaultBrowserContext();
    await context.setPermission(url, {
      permission: { name: 'microphone' },
      state: 'granted'
    } as any);

    async function cleanup() {
      if (browser) await browser.disconnect();
      if (chrome) chrome.kill();
      try { rmSync(tempDir!, { recursive: true, force: true }); } catch (e) {}
      process.exit(0);
    }

    await page.evaluateOnNewDocument((text, title, action, startRecording) => {
      (window as any).getInitialText = async () => text;
      (window as any).getInitialTitle = async () => title;
      (window as any).getInitialActionLabel = async () => action;
      (window as any).isStartRecording = async () => startRecording;
    }, initialText, options.title, options.action, options.startRecording);

    await page.exposeFunction('onComplete', (text: string) => {
      process.stdout.write(text + '\n');
      cleanup();
    });

    await page.exposeFunction('onCancel', () => { cleanup(); });

    page.on('close', () => { cleanup(); });

    await page.goto(url);
    await page.bringToFront();

    await new Promise(() => {});
  } catch (err) {
    console.error('Failed to launch prompt:', err);
    if (chrome) chrome.kill();
    process.exit(1);
  }
}

async function runTts(argv: string[]) {
  const sub = program
    .name('stts tts')
    .description('Text to Speech GUI')
    .version('1.0.0')
    .option('--title <title>', 'Title of the page', 'Speak')
    .option('--action <label>', 'Label for the action button', 'Stop & Exit')
    .option('--oneshot', 'Just speak the passed in text and exit')
    .argument('[text...]', 'Text to speak')
    .helpOption('-h, --help', 'Display help for command')
    .parse(argv, { from: 'user' });

  const options = sub.opts();
  let textToSpeak = (sub.args || []).join(' ');

  const stdinText = await readStdin();
  if (stdinText) {
    textToSpeak = textToSpeak ? `${textToSpeak}\n${stdinText}` : stdinText;
  }

  const uiPath = path.resolve(__dirname, 'tts_ui.html');
  const url = `file://${uiPath}`;
  const tempDir = path.join(tmpdir(), `ai-sidekick-speak-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });

  let chrome: ChromeLauncher.LaunchedChrome | undefined;
  let browser: Browser | undefined;

  try {
    const userDataDir = path.join(tempDir, 'profile');
    mkdirSync(userDataDir, { recursive: true });

    chrome = await launchChrome({
      startingUrl: 'about:blank',
      userDataDir,
      chromeFlags: [
        `--app=${url}`,
        '--window-size=800,600',
        '--autoplay-policy=no-user-gesture-required',
        '--force-device-scale-factor=1',
        '--disable-session-crashed-bubble',
        '--allow-file-access-from-files'
      ],
    });

    browser = await connectToChrome(chrome.port);

    const [page] = await browser.pages();

    page.on('console', _ => {});

    async function cleanup() {
      if (browser) await browser.close();
      if (chrome) chrome.kill();
      try { rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
      process.exit(0);
    }

    await page.exposeFunction('onClose', () => { cleanup(); });

    await page.evaluateOnNewDocument((initialText, initialTitle, initialAction, oneshot) => {
      (window as any).getInitialText = async () => initialText;
      (window as any).getInitialTitle = async () => initialTitle;
      (window as any).getInitialActionLabel = async () => initialAction;
      (window as any).isOneshot = async () => oneshot;
    }, textToSpeak, options.title, options.action, options.oneshot);

    page.on('close', () => { cleanup(); });

    await page.goto(url);
    await page.bringToFront();

    await new Promise(() => {});
  } catch (err) {
    console.error('Failed to launch speaker:', err);
    if (chrome) chrome.kill();
    try { rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
    process.exit(1);
  }
}

const [mode, ...rest] = process.argv.slice(2);

if (mode === 'stt') {
  await runStt(rest);
} else if (mode === 'tts') {
  await runTts(rest);
} else {
  console.error('Usage: stts <stt|tts> [options] [text...]');
  process.exit(1);
}
