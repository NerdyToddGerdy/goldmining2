/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  // itch.io serves the game from a subpath inside an iframe, so every asset path must be relative.
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
