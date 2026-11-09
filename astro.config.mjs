import { defineConfig } from 'astro/config';
export default defineConfig({
  site: 'https://kyle-beck.com',
  trailingSlash: 'ignore',
  // "astro" rather than "_astro": GitHub Pages runs Jekyll, which skips "_" directories.
  build: { assets: 'astro' },
  vite: {
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Keep the public generator in the same chunk main already publishes.
            if (id.includes('/src/tools/modal/') && !id.includes('/src/tools/modal-preview/')) return 'ui';
          },
        },
      },
    },
  },
});
