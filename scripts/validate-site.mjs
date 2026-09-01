import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, normalize, resolve } from 'node:path';

const siteRoot = resolve('site');
const htmlPath = join(siteRoot, 'index.html');
const html = await readFile(htmlPath, 'utf8');
const errors = [];

const ids = [...html.matchAll(/\sid=["']([^"']+)["']/g)].map((match) => match[1]);
for (const id of new Set(ids)) {
  if (ids.filter((candidate) => candidate === id).length > 1) errors.push(`duplicate id: ${id}`);
}

for (const requiredId of ['outputs', 'divisions', 'process', 'contact', 'report-preview', 'lightbox']) {
  if (!ids.includes(requiredId)) errors.push(`missing required id: ${requiredId}`);
}

for (const match of html.matchAll(/<img\b([^>]*)>/gi)) {
  if (!/\salt=["'][^"']*["']/i.test(match[1])) errors.push(`image missing alt: ${match[0]}`);
}

const localReferences = new Set();
for (const match of html.matchAll(/(?:src|href|data)=["']([^"'#?]+)["']/gi)) {
  const reference = match[1];
  if (/^(?:https?:|mailto:|tel:)/i.test(reference)) continue;
  localReferences.add(reference.replace(/^\//, ''));
}
for (const match of html.matchAll(/url\(["']?([^"')?#]+)["']?\)/gi)) {
  const reference = match[1];
  if (!/^https?:/i.test(reference)) localReferences.add(reference.replace(/^\//, ''));
}
for (const match of html.matchAll(/\bimage:\s*["']([^"'?]+)["']/gi)) {
  localReferences.add(match[1].replace(/^\//, ''));
}
for (const match of html.matchAll(/href=["']#([^"']+)["']/gi)) {
  if (!ids.includes(match[1])) errors.push(`broken internal anchor: #${match[1]}`);
}
for (const reference of localReferences) {
  const target = normalize(join(dirname(htmlPath), reference));
  if (!target.startsWith(siteRoot)) {
    errors.push(`reference escapes site root: ${reference}`);
    continue;
  }
  try {
    if (!(await stat(target)).isFile()) errors.push(`reference is not a file: ${reference}`);
  } catch {
    errors.push(`missing asset: ${reference}`);
  }
}

async function walk(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(path)));
    else result.push(path);
  }
  return result;
}

const files = await walk(siteRoot);
if (files.length < 8) errors.push('recovered site asset manifest is incomplete');

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Validated ${files.length} site files, ${ids.length} IDs, and ${localReferences.size} local references.`);
}
