import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths, so the build works under any sub-path (GitHub Pages serves /<repo>/).
  base: './',
  // Three.js, MediaPipe and PeerJS make one ~1 MB chunk (~230 kB gzipped); the 17 MB model dominates loading anyway.
  build: { chunkSizeWarningLimit: 1100 },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
