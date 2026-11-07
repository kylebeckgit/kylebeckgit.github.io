// Fail if served HTML still contains bracket placeholder copy outside scripts and styles.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] || 'dist');

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.isFile() && entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const hits = [];
for (const file of await walk(root)) {
  const raw = await readFile(file, 'utf8');
  const text = raw
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  const index = text.indexOf('[');
  if (index !== -1) {
    hits.push(`${path.relative(root, file)}: ${text.slice(Math.max(0, index - 40), index + 60).replace(/\s+/g, ' ')}`);
  }
}

if (hits.length) {
  console.error('Bracket placeholder text is still in served HTML:');
  for (const hit of hits) console.error(hit);
  process.exit(1);
}
console.log(`No bracket placeholder text in ${root}.`);
