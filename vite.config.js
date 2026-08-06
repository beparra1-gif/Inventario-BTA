import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // El maestro de productos (con fotos) se cachea aparte, bajo demanda,
        // vía IndexedDB — no como precache de build (podría pesar demasiado).
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
      manifest: {
        name: 'Inventario BTA',
        short_name: 'Inventario BTA',
        description: 'Captura de inventario por tienda con validación contra maestro de productos.',
        theme_color: '#E20613',
        background_color: '#F3F4F6',
        display: 'standalone',
        start_url: '/',
        scope: '/',
      },
    }),
  ],
  server: {
    port: 5173,
  },
  test: {
    environment: 'node',
    globals: true,
    // Sin esto, "npm run test" en la raíz también corre los tests de
    // backend/ (que tiene su propio vitest.config.js) — mismo ajuste que
    // usa app-centro-de-cultura por la misma razón.
    exclude: [
      '**/node_modules/**', '**/dist/**', '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      '**/backend/**',
    ],
  },
});
