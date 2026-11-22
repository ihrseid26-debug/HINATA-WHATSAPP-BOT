import { promises as fs } from 'node:fs';
import path from 'node:path';

const ALLOWED_TYPES = new Set([
  'correction',
  'preference',
  'fact',
  'neutral'
]);

export class ExperienceEngine {
  constructor({
    storageDir = path.resolve('storage')
  } = {}) {
    this.file = path.join(
      path.resolve(storageDir),
      'autonomy',
      'experience-summary.json'
    );

    this.queue = Promise.resolve();
  }

  exclusive(task) {
    const operation = this.queue.then(task, task);

    this.queue = operation.then(
      () => undefined,
      () => undefined
    );

    return operation;
  }

  async read() {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      const data = JSON.parse(raw);

      if (
        !data ||
        typeof data.total !== 'number' ||
        !data.counts ||
        typeof data.counts !== 'object'
      ) {
        throw new Error('Invalid experience data');
      }

      return data;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {
          total: 0,
          counts: {
            correction: 0,
            preference: 0,
            fact: 0,
            neutral: 0
          },
          updatedAt: null
        };
      }

      throw error;
    }
  }

  async write(data) {
    await fs.mkdir(path.dirname(this.file), {
      recursive: true
    });

    const temporary = `${this.file}.${process.pid}.tmp`;

    try {
      await fs.writeFile(
        temporary,
        JSON.stringify(data, null, 2),
        {
          encoding: 'utf8',
          mode: 0o600
        }
      );

      await fs.rename(temporary, this.file);
    } catch (error) {
      try {
        await fs.unlink(temporary);
      } catch {}

      throw error;
    }
  }

  async initialize() {
    return this.exclusive(async () => {
      const data = await this.read();
      await this.write(data);

      return { initialized: true };
    });
  }

  async record(type) {
    if (!ALLOWED_TYPES.has(type)) {
      throw new Error('Unsupported experience type');
    }

    return this.exclusive(async () => {
      const data = await this.read();

      data.total += 1;
      data.counts[type] += 1;
      data.updatedAt = new Date().toISOString();

      await this.write(data);

      return {
        recorded: true,
        type,
        total: data.total
      };
    });
  }

  async getSummary() {
    return this.read();
  }

  async reset() {
    return this.exclusive(async () => {
      const data = {
        total: 0,
        counts: {
          correction: 0,
          preference: 0,
          fact: 0,
          neutral: 0
        },
        updatedAt: new Date().toISOString()
      };

      await this.write(data);

      return { reset: true };
    });
  }
}
