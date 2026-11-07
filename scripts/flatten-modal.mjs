// Astro emits the editor as a directory. The existing link is /z3-webgpu.html.
import { cp, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const dir = path.resolve('dist/z3-webgpu');
const index = path.join(dir, 'index.html');
const target = path.resolve('dist/z3-webgpu.html');
try {
  await stat(index);
} catch {
  console.error('dist/z3-webgpu/index.html is missing');
  process.exit(1);
}
await cp(index, target);
await rm(dir, { recursive: true, force: true });
console.log('Wrote dist/z3-webgpu.html');
