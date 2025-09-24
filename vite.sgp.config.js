import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  publicDir: false,
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: false,
    // Adiciona o monitoramento de arquivos para este build também.
    watch: {
      include: ['src/scripts/sgp.js', 'src/scripts/utils.js', 'src/scripts/logic.js'],
    },
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
