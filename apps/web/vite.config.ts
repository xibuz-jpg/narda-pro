import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Consume the game engine from TS source so Vite bundles it as ESM
      // (the package ships CommonJS for the NestJS backend). Types still resolve
      // via the package's .d.ts, so both stay in sync.
      '@narda/game-engine': fileURLToPath(
        new URL('../../packages/game-engine/src/index.ts', import.meta.url),
      ),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split big, rarely-changing vendors into their own chunks so app-code
        // edits don't bust the whole cache (and Pixi stays out of the entry).
        manualChunks: {
          pixi: ['pixi.js'],
          net: ['socket.io-client'],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: 5173,
  },
});
