import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';


const ALLOWED_TARGETS = new Set([
  'src/core/brain.js',
  'src/providers/local-provider.js',
  'src/providers/provider-manager.js',
  'src/learning/learning-engine.js',
  'src/learning/personal-memory.js',
  'src/learning/learning-validator.js',
  'src/autonomy/self-improvement.js'
]);

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function runNode(args, options) {
  const result = spawnSync(
    process.execPath,
    args,
    {
      ...options,
      encoding: 'utf8'
    }
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const details = [
      result.stderr,
      result.stdout
    ].filter(Boolean).join('\n').trim();

    throw new Error(
      'Node validation failed (exit ' +
      String(result.status) +
      '): ' +
      details
    );
  }

  return result.stdout;
}

export class CodeImprovementManager {
  constructor({
    projectRoot = process.cwd(),
    storageDir = path.resolve('storage/code-improvements')
  } = {}) {
    this.projectRoot = path.resolve(projectRoot);
    this.storageDir = path.resolve(storageDir);
  }

  async initialize() {
    await fs.mkdir(
      path.join(this.storageDir, 'proposals'),
      { recursive: true }
    );

    await fs.mkdir(
      path.join(this.storageDir, 'backups'),
      { recursive: true }
    );

    return { initialized: true };
  }

  validateTarget(target) {
    if (!ALLOWED_TARGETS.has(target)) {
      throw new Error('This code file is not allowed to be modified');
    }

    const absolute = path.resolve(this.projectRoot, target);

    if (!absolute.startsWith(this.projectRoot + path.sep)) {
      throw new Error('Invalid target path');
    }

    return absolute;
  }

  async createProposal({ target, content, reason }) {
    const absolute = this.validateTarget(target);

    if (typeof content !== 'string' || !content.trim()) {
      throw new TypeError('New code content is required');
    }

    if (content.length > 100_000) {
      throw new Error('Proposal exceeds the 100 KB limit');
    }

    if (typeof reason !== 'string' || !reason.trim()) {
      throw new TypeError('A reason is required');
    }

    const info = await fs.lstat(absolute);

    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error('Target must be a regular file');
    }

    const original = await fs.readFile(absolute, 'utf8');
    const id = randomUUID();

    const proposal = {
      id,
      target,
      reason: reason.trim().slice(0, 1000),
      content,
      baseHash: hash(original),
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    await this.saveProposal(proposal);

    return {
      id,
      target,
      status: proposal.status,
      createdAt: proposal.createdAt
    };
  }

  async saveProposal(proposal) {
    const file = path.join(
      this.storageDir,
      'proposals',
      `${proposal.id}.json`
    );

    const temporary = `${file}.${randomUUID()}.tmp`;

    await fs.writeFile(
      temporary,
      JSON.stringify(proposal, null, 2),
      { encoding: 'utf8', mode: 0o600 }
    );

    await fs.rename(temporary, file);
  }

  async getProposal(id) {
    if (
      typeof id !== 'string' ||
      !/^[a-f0-9-]{36}$/i.test(id)
    ) {
      throw new Error('Invalid proposal ID');
    }

    const file = path.join(
      this.storageDir,
      'proposals',
      `${id}.json`
    );

    try {
      return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error('Proposal not found');
      }

      throw error;
    }
  }

  async listProposals() {
    const directory = path.join(
      this.storageDir,
      'proposals'
    );

    const names = await fs.readdir(directory);
    const proposals = [];

    for (const name of names) {
      if (!name.endsWith('.json')) continue;

      try {
        const item = JSON.parse(
          await fs.readFile(
            path.join(directory, name),
            'utf8'
          )
        );

        proposals.push({
          id: item.id,
          target: item.target,
          reason: item.reason,
          status: item.status,
          createdAt: item.createdAt
        });
      } catch {
        // Ignore an invalid proposal file.
      }
    }

    return proposals;
  }

  async applyApproved(id, {
    approvedBy,
    confirmation
  } = {}) {
    if (
      typeof approvedBy !== 'string' ||
      !approvedBy.trim()
    ) {
      throw new Error('A reviewer identity is required');
    }

    const proposal = await this.getProposal(id);

    const expectedConfirmation = `APPLY HINATA CODE ${id}`;

    if (confirmation !== expectedConfirmation) {
      throw new Error('Explicit confirmation is required');
    }

    if (proposal.status !== 'pending') {
      throw new Error('Proposal is not pending');
    }

    const target = this.validateTarget(proposal.target);
    const current = await fs.readFile(target, 'utf8');

    if (hash(current) !== proposal.baseHash) {
      throw new Error(
        'Target changed after proposal creation. Create a new proposal.'
      );
    }

    const backup = path.join(
      this.storageDir,
      'backups',
      `${id}.bak`
    );

    await fs.writeFile(
      backup,
      current,
      { encoding: 'utf8', mode: 0o600 }
    );

    const temporary = `${target}.${randomUUID()}.tmp`;

    try {
      await fs.writeFile(
        temporary,
        proposal.content,
        { encoding: 'utf8', mode: 0o600 }
      );

      await fs.rename(temporary, target);

      runNode(
        ['--check', target],
        {
          cwd: this.projectRoot,
          timeout: 15000
        }
      );

      const testDirectory = path.join(
        this.projectRoot,
        'tests'
      );

      const testFiles = (await fs.readdir(testDirectory))
        .filter(name => name.endsWith('.test.js'))
        .sort()
        .map(name => path.join(testDirectory, name));

      if (testFiles.length > 0) {
        runNode(
          ['--test', ...testFiles],
          {
            cwd: this.projectRoot,
            timeout: 60000,
            maxBuffer: 2 * 1024 * 1024
          }
        );
      }

      proposal.status = 'applied';
      proposal.approvedBy = approvedBy.trim();
      proposal.appliedAt = new Date().toISOString();

      await this.saveProposal(proposal);

      return {
        success: true,
        id,
        target: proposal.target,
        backup,
        status: 'applied'
      };
    } catch (error) {
      await fs.copyFile(backup, target);

      try {
        await fs.unlink(temporary);
      } catch {}

      proposal.status = 'rejected_after_validation';
      proposal.failure = String(error.message).slice(0, 1000);

      await this.saveProposal(proposal);

      throw new Error(
        `Update rejected and original code restored: ${error.message}`
      );
    }
  }
}
