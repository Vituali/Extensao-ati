// vite.chatmix.config.js

import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  publicDir: false, // Adicione esta linha
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: false, // Não apaga a pasta 'dist' [cite: 409]
    rollupOptions: {
      // Apenas UMA entrada
      input: {
        chatmix: resolve(__dirname, 'src/scripts/chatmix.js'),
      },
      output: {
        format: 'iife',
        entryFileNames: 'scripts/[name].js', // Saída: dist/scripts/chatmix.js
      },
    },
  },
});