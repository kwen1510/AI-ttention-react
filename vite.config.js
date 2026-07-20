import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { execFileSync } from 'child_process';

function resolveBuildCommit() {
  const environmentCommit = process.env.SOURCE_COMMIT || process.env.GITHUB_SHA;
  if (/^[0-9a-f]{40}$/i.test(environmentCommit || '')) return environmentCommit;

  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: __dirname,
    encoding: 'utf8'
  }).trim();
}

const buildCommit = resolveBuildCommit();
const buildInfo = {
  commit: buildCommit,
  shortCommit: buildCommit.slice(0, 7),
  builtAt: new Date().toISOString()
};

const buildVersionPlugin = {
  name: 'ai-ttention-build-version',
  transformIndexHtml() {
    return [
      {
        tag: 'meta',
        attrs: { name: 'app-version', content: buildInfo.shortCommit },
        injectTo: 'head'
      },
      {
        tag: 'span',
        attrs: { id: 'app-version', 'data-version': buildInfo.shortCommit, hidden: true },
        children: buildInfo.shortCommit,
        injectTo: 'body-prepend'
      }
    ];
  },
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: `${JSON.stringify(buildInfo, null, 2)}\n`
    });
  }
};

export default defineConfig({
  root: 'client',
  plugins: [react(), buildVersionPlugin],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client/src'),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  define: {
    global: 'globalThis',
  },
});
