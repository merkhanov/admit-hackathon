import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths, so the build works under any sub-path (GitHub Pages serves /<repo>/).
  base: './',
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
