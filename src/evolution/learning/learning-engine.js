import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { ConsentManager } from './consent-manager.js';
import { PersonalMemory } from './personal-memory.js';
import { SharedKnowledge } from './shared-knowledge.js';
import { AutomaticLearning } from './automatic-learning.js';

const FILES = {
  consents: 'learning/consents.json',
  'automatic-settings': 'learning/automatic-settings.json',
  'shared-pending': 'shared/pending.json',
  'shared-approved': 'shared/approved.json'
};

export class LearningEngine {
  constructor({
    storageDir = path.resolve('storage')
  } = {}) {
    this.storageDir = storageDir;
    this.queue = Promise.resolve();

    this.consent = new ConsentManager(this);
    this.personal = new PersonalMemory(this);
    this.shared = new SharedKnowledge(this);
    this.automatic = new AutomaticLearning(this);
  }

  exclusive(task) {
    const operation = this.queue.then(task, task);

    this.queue = operation.then(
      () => undefined,
      () => undefined
    );

    return operation;
  }

  resolveFile(name) {
    if (name.startsWith('person:')) {
      return path.join(
        this.storageDir,
        'people',
        `${name.slice(7)}.json`
      );
    }

    if (name.startsWith('auto-person:')) {
      return path.join(
        this.storageDir,
        'people',
        `auto-${name.slice(12)}.json`
      );
    }

    const relative = FILES[name];

    if (!relative) {
      throw new Error('Unknown learning storage file');
    }

    return path.join(this.storageDir, relative);
  }

  async readFile(name, fallback) {
    const file = this.resolveFile(name);

    try {
      const raw = await fs.readFile(file, 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      if (error.code === 'ENOENT') return fallback;
      throw error;
    }
  }

  async writeFile(name, value) {
    const file = this.resolveFile(name);

    await fs.mkdir(path.dirname(file), {
      recursive: true
    });

    const temporary = `${file}.${randomUUID()}.tmp`;

    try {
      await fs.writeFile(
        temporary,
        JSON.stringify(value, null, 2),
        { encoding: 'utf8', mode: 0o600 }
      );

      await fs.rename(temporary, file);
    } catch (error) {
      try {
        await fs.unlink(temporary);
      } catch {
        // لا يوجد ملف مؤقت يحتاج إلى تنظيف
      }

      throw error;
    }
  }

  async removeFile(name) {
    const file = this.resolveFile(name);

    try {
      await fs.unlink(file);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  async initialize() {
    await fs.mkdir(
      path.join(this.storageDir, 'people'),
      { recursive: true }
    );

    await fs.mkdir(
      path.join(this.storageDir, 'shared'),
      { recursive: true }
    );

    await fs.mkdir(
      path.join(this.storageDir, 'learning'),
      { recursive: true }
    );

    for (const [name, fallback] of [
      ['consents', {}],
      ['automatic-settings', {}],
      ['shared-pending', []],
      ['shared-approved', []]
    ]) {
      await this.readFile(name, fallback);
    }

    return {
      initialized: true,
      individualMemory: true,
      automaticLearning: true,
      sharedKnowledge: true,
      persistentStorage: true
    };
  }

  async getStatus() {
    const consents = await this.readFile('consents', {});
    const pending = await this.readFile('shared-pending', []);
    const approved = await this.readFile('shared-approved', []);

    return {
      peopleWithConsent: Object.keys(consents).length,
      pendingKnowledge: pending.length,
      approvedKnowledge: approved.length,
      automaticLearning: true
    };
  }
}
