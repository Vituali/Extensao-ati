import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  publicDir: false,
  build: {
    outDir: resolve(__dirname, 'dist'),
    // Garante que este build não apague o que os outros fizeram.
    emptyOutDir: false,
    rollupOptions: {
      input: {
        sgp: resolve(__dirname, 'src/scripts/sgp.js'),
      },
      output: {
        format: 'iife',
        entryFileNames: 'scripts/[name].js',
      },
    },
  },
});

