import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  publicDir: 'public',
  build: {
    outDir: resolve(__dirname, 'dist'),
    // Alterado para 'false' para impedir que este build apague os arquivos dos outros.
    emptyOutDir: false,
    watch: {
      include: ['src/**', 'public/**'],
      exclude: 'node_modules/**',
    },
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background.js'),
        'bridge-listener': resolve(__dirname, 'src/bridge-listener.js'),
        'bridge-injected': resolve(__dirname, 'src/bridge-injected.js'),
      },
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        assetFileNames: 'assets/[name][extname]'
      }
    }
  }
});

