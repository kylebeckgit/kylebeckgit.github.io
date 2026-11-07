// Astro emits these tools as directories. The public URLs are single HTML files.
import { cp, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const pages = ['z3-webgpu', 'z3-describe-preview'];

for (const name of pages) {
  const dir = path.resolve(`dist/${name}`);
  const index = path.join(dir, 'index.html');
  const target = path.resolve(`dist/${name}.html`);
  try {
    await stat(index);
  } catch {
    console.error(`dist/${name}/index.html is missing`);
    process.exit(1);
  }
  await cp(index, target);
  await rm(dir, { recursive: true, force: true });
  console.log(`Wrote dist/${name}.html`);
}
