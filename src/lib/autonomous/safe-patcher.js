import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();

const BACKUPS = path.join(
  ROOT,
  'storage/hinata-autonomous/backups'
);

const FIXES = [
  {
    id: 'learning-gratitude-priority-v1',
    file: 'src/lib/local-ai/learning-engine.js',
    find: 'happiness: /سعيد|سعيدة|فرح|فرحان|مبسوط|مبسوطة|رائع|جميل|أحب هذا|شكرا/iu,',
    replace: 'happiness: /سعيد|سعيدة|فرح|فرحان|مبسوط|مبسوطة|رائع|جميل|أحب هذا/iu,'
  }
];

export async function applyRegisteredSafeFixes(logger = console) {
  const results = [];

  for (const fix of FIXES) {
    const fullPath = path.resolve(ROOT, fix.file);

    if (!fullPath.startsWith(ROOT + path.sep)) continue;

    let backupPath = null;
    let tempPath = null;

    try {
      const source = await fs.readFile(fullPath, 'utf8');

      if (source.includes(fix.replace)) {
        results.push({ id: fix.id, status: 'already-applied' });
        continue;
      }

      if (source.split(fix.find).length !== 2) {
        results.push({ id: fix.id, status: 'anchor-mismatch' });
        continue;
      }

      const updated = source.replace(fix.find, fix.replace);
      const stat = await fs.stat(fullPath);

      await fs.mkdir(BACKUPS, { recursive: true });

      backupPath = path.join(
        BACKUPS,
        `${Date.now()}-${fix.id}.bak`
      );

      await fs.copyFile(fullPath, backupPath);

      tempPath = `${fullPath}.autofix.tmp.js`;

      await fs.writeFile(tempPath, updated, {
        encoding: 'utf8',
        mode: stat.mode & 0o777
      });

      await execFileAsync(
        process.execPath,
        ['--check', tempPath],
        { timeout: 10000 }
      );

      await fs.rename(tempPath, fullPath);

      results.push({
        id: fix.id,
        status: 'applied',
        backup: backupPath
      });

      logger.info?.(
        { fix: fix.id },
        '[HINATA SELF-DEVELOPER] Safe fix applied'
      );
    } catch (error) {
      if (backupPath) {
        try {
          await fs.copyFile(backupPath, fullPath);
        } catch {}
      }

      if (tempPath) {
        await fs.rm(tempPath, { force: true }).catch(() => {});
      }

      results.push({
        id: fix.id,
        status: 'failed',
        error: String(error.message || error)
      });

      logger.warn?.(
        { err: error, fix: fix.id },
        '[HINATA SELF-DEVELOPER] Fix failed'
      );
    }
  }

  return results;
}
