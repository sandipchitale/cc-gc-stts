import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const outdir = 'dist';

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

await build({
  entryPoints: ['src/stts.ts', 'src/stts-mcp-server.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  outdir,
  outExtension: { '.js': '.mjs' },
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
  logLevel: 'info',
});

for (const html of ['stt_ui.html', 'tts_ui.html']) {
  copyFileSync(path.join('src', html), path.join(outdir, html));
}

console.log('Build complete: dist/stts.mjs, dist/stts-mcp-server.mjs');
