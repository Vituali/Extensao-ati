import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  publicDir: false,
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: false,
    // Adiciona o monitoramento de arquivos para este build também.
    watch: {
      include: ['src/scripts/chatmix.js', 'src/scripts/utils.js', 'src/scripts/logic.js', 'src/scripts/modal.js'],
    },
    rollupOptions: {
      input: {
        chatmix: resolve(__dirname, 'src/scripts/chatmix.js'),
      },
      output: {
        format: 'iife',
        entryFileNames: 'scripts/[name].js',
      },
    },
  },
});
