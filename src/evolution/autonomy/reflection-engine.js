import { promises as fs } from 'node:fs';
import path from 'node:path';

const MAX_REFLECTIONS = 100;

export class ReflectionEngine {
  constructor({
    storageDir = path.resolve('storage')
  } = {}) {
    this.file = path.join(
      path.resolve(storageDir),
      'autonomy',
      'reflection-history.json'
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

      if (!Array.isArray(data)) {
        throw new Error('Invalid reflection history');
      }

      return data;
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async write(history) {
    await fs.mkdir(path.dirname(this.file), {
      recursive: true
    });

    const temporary = `${this.file}.${process.pid}.tmp`;

    try {
      await fs.writeFile(
        temporary,
        JSON.stringify(history, null, 2),
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

  analyze(summary) {
    if (
      !summary ||
      typeof summary.total !== 'number' ||
      !summary.counts
    ) {
      throw new Error('A valid experience summary is required');
    }

    const corrections = summary.counts.correction || 0;
    const preferences = summary.counts.preference || 0;
    const facts = summary.counts.fact || 0;

    if (summary.total < 3) {
      return {
        level: 'insufficient_data',
        insight: 'لا توجد تجارب كافية لاستخلاص نتيجة موثوقة.',
        nextFocus: 'collect_more_experience'
      };
    }

    if (corrections > preferences * 2) {
      return {
        level: 'correction_focus',
        insight: 'إشارات التصحيح أكثر من إشارات التفضيل.',
        nextFocus: 'review_correction_patterns'
      };
    }

    if (preferences > corrections * 2) {
      return {
        level: 'preference_focus',
        insight: 'إشارات التفضيل أكثر من إشارات التصحيح.',
        nextFocus: 'review_preference_patterns'
      };
    }

    if (facts > corrections + preferences) {
      return {
        level: 'knowledge_focus',
        insight: 'إشارات المعلومات والتذكّر هي الأكثر ظهوراً.',
        nextFocus: 'review_knowledge_handling'
      };
    }

    return {
      level: 'balanced',
      insight: 'إشارات التعلم المسجلة متوازنة نسبياً.',
      nextFocus: 'continue_general_development'
    };
  }

  async initialize() {
    return this.exclusive(async () => {
      const history = await this.read();
      await this.write(history);

      return { initialized: true };
    });
  }

  async reflect(summary) {
    const analysis = this.analyze(summary);

    return this.exclusive(async () => {
      const history = await this.read();

      const reflection = {
        ...analysis,
        experienceCount: summary.total,
        timestamp: new Date().toISOString()
      };

      history.push(reflection);

      await this.write(
        history.slice(-MAX_REFLECTIONS)
      );

      return { ...reflection };
    });
  }

  async getLatest() {
    const history = await this.read();
    return history.at(-1) || null;
  }

  async getHistory() {
    return this.read();
  }
}
