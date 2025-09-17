// vite.config.js

import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true, 
    
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background.js'),
        popup: resolve(__dirname, 'src/popup.js'),
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