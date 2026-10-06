import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'pages' ? './' : '/',
  build: mode === 'pages' ? { outDir: 'artifacts/pages-editor', rolldownOptions: { input: { index: 'index.html', 'editor-worker': 'src/browser/editor-worker.ts' }, output: { entryFileNames: chunk => chunk.name === 'editor-worker' ? 'editor-worker.js' : 'assets/[name]-[hash].js' } } } : {},
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
}));
