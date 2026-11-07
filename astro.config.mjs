import { defineConfig } from 'astro/config';
export default defineConfig({
  site: 'https://kyle-beck.com',
  trailingSlash: 'ignore',
  // "astro" rather than "_astro": GitHub Pages runs Jekyll, which skips "_" directories.
  build: { assets: 'astro' },
});
