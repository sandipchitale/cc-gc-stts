import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const outdir = 'dist';

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

await build({
  entryPoints: ['src/stts.ts', 'src/stts-mcp-server.ts', 'src/stts-daemon.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  outdir,
  minify: true,
  outExtension: { '.js': '.mjs' },
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
  logLevel: 'info',
});

await build({
  entryPoints: ['src/sanscript-browser.ts'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  outfile: path.join(outdir, 'sanscript.js'),
  minify: true,
  logLevel: 'info',
});

for (const html of ['stts_ui.html']) {
  copyFileSync(path.join('src', html), path.join(outdir, html));
}

console.log('Build complete: dist/stts.mjs, dist/stts-mcp-server.mjs, dist/stts-daemon.mjs, dist/sanscript.js');
