// GitHub Pages for this repo publishes the main branch root ("Deploy from a branch").
// Astro writes dist/. This copies that build onto the repository root, which is what
// kyle-beck.com serves, and checks the copy still matches after a rebuild.
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const manifestPath = path.join(root, 'scripts', 'pages-manifest.txt');
const check = process.argv.includes('--check');

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.isFile()) out.push(path.relative(dist, full).split(path.sep).join('/'));
  }
  return out;
}

function assertSafe(rel) {
  if (!rel || rel.startsWith('/') || rel.split('/').includes('..')) {
    throw new Error(`Refusing to publish unsafe path: ${rel}`);
  }
}

const files = (await walk(dist)).sort();
for (const rel of files) assertSafe(rel);

if (files.some((rel) => rel === 'plus3-doremidi-guide' || rel.startsWith('plus3-doremidi-guide/'))) {
  console.error('Build contains /plus3-doremidi-guide/, which is served by the plus3-doremidi-guide repo.');
  process.exit(1);
}

const cname = await readFile(path.join(dist, 'CNAME'), 'utf8');
if (cname.trim() !== 'kyle-beck.com') {
  console.error('dist/CNAME must contain kyle-beck.com');
  process.exit(1);
}
if (!(await exists(path.join(dist, '.nojekyll')))) {
  console.error('dist/.nojekyll is missing. Keep an empty public/.nojekyll so Jekyll does not swallow /_astro.');
  process.exit(1);
}

if (check) {
  const missing = [];
  const differ = [];
  for (const rel of files) {
    const published = path.join(root, rel);
    if (!(await exists(published))) {
      missing.push(rel);
      continue;
    }
    const [built, live] = await Promise.all([readFile(path.join(dist, rel)), readFile(published)]);
    if (!built.equals(live)) differ.push(rel);
  }
  if (missing.length || differ.length) {
    console.error('Repository root does not match dist/. Run npm run pages and commit the result.');
    for (const rel of missing) console.error(' missing', rel);
    for (const rel of differ) console.error(' differ', rel);
    process.exit(1);
  }
  console.log(`Published root matches dist/ (${files.length} files).`);
  process.exit(0);
}

if (await exists(manifestPath)) {
  const previous = (await readFile(manifestPath, 'utf8')).split('\n').map((line) => line.trim()).filter(Boolean);
  const next = new Set(files);
  for (const rel of previous) {
    assertSafe(rel);
    if (next.has(rel)) continue;
    const target = path.join(root, rel);
    if (await exists(target)) {
      await rm(target);
      console.log('removed', rel);
    }
  }
}

for (const rel of files) {
  const to = path.join(root, rel);
  await mkdir(path.dirname(to), { recursive: true });
  await cp(path.join(dist, rel), to);
}

await writeFile(manifestPath, `${files.join('\n')}\n`);
console.log(`Published ${files.length} files to the repository root.`);
