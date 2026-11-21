import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve('src');
const files = [];

async function walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(fullPath);
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(fullPath);
  }
}

await walk(root);
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed = true;
    process.stderr.write(`\n❌ ${file}\n${result.stderr || result.stdout}`);
  } else {
    process.stdout.write(`✅ ${path.relative(process.cwd(), file)}\n`);
  }
}
if (failed) process.exit(1);
console.log(`\n✅ Syntax check passed: ${files.length} JavaScript files.`);
