import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths, so the build works under any sub-path (GitHub Pages serves /<repo>/).
  base: './',
  // Three.js and MediaPipe make one ~750 kB chunk (~200 kB gzipped); the 17 MB model dominates loading anyway.
  build: { chunkSizeWarningLimit: 900 },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
