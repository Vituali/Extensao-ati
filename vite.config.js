import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  publicDir: 'public',
  build: {
    outDir: resolve(__dirname, 'dist'),
    // Corrigido: A opção 'emptyOutDir' foi movida para o build principal para limpar a pasta 'dist' apenas uma vez.
    emptyOutDir: true,
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

