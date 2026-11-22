import path from 'node:path';
import { createHash } from 'node:crypto';
import { SelfImprovementEngine } from './self-improvement.js';

const FEEDBACK_PATTERNS = [
  {
    signal: 'prefer_friendly',
    pattern: /أفضل الأسلوب الودي|أفضل أسلوب ودّي|كن وديا|كن ودياً|تحدث بود|prefer friendly/i
  },
  {
    signal: 'prefer_calm',
    pattern: /أفضل الأسلوب الهادئ|كن هادئا|تحدث بهدوء|prefer calm/i
  },
  {
    signal: 'prefer_formal',
    pattern: /أفضل الأسلوب الرسمي|كن رسميا|تحدث بشكل رسمي|prefer formal/i
  },
  {
    signal: 'prefer_concise',
    pattern: /أفضل الردود المختصرة|أفضل الاختصار|أجب باختصار|اجعل الرد مختصرا|prefer concise/i
  },
  {
    signal: 'prefer_detail',
    pattern: /أفضل الشرح المفصل|اشرح بالتفصيل|أريد تفاصيل أكثر|prefer detail/i
  },
  {
    signal: 'prefer_balanced',
    pattern: /أفضل التوازن في الشرح|اجعل الشرح متوسطا|prefer balanced/i
  }
];

function detectFeedback(input) {
  if (typeof input !== 'string' || input.length > 2000) {
    return null;
  }

  for (const item of FEEDBACK_PATTERNS) {
    if (item.pattern.test(input)) {
      return item.signal;
    }
  }

  return null;
}

export class PersonalityAdaptationEngine {
  constructor({
    storageDir = path.resolve('storage')
  } = {}) {
    this.storageDir = path.resolve(storageDir);
    this.engines = new Map();
    this.queues = new Map();
  }

  getPersonKey(personId) {
    if (
      typeof personId !== 'string' ||
      !personId.trim() ||
      personId.length > 256
    ) {
      throw new TypeError('personId must be a valid string');
    }

    return createHash('sha256')
      .update(personId)
      .digest('hex');
  }

  getEngine(personId) {
    const key = this.getPersonKey(personId);

    if (!this.engines.has(key)) {
      const personStorage = path.join(
        this.storageDir,
        'people',
        key,
        'personality'
      );

      this.engines.set(
        key,
        new SelfImprovementEngine({
          storageDir: personStorage
        })
      );
    }

    return {
      key,
      engine: this.engines.get(key)
    };
  }

  async exclusive(key, task) {
    const previous = this.queues.get(key) || Promise.resolve();

    const operation = previous.then(task, task);

    this.queues.set(
      key,
      operation.then(
        () => undefined,
        () => undefined
      )
    );

    try {
      return await operation;
    } finally {
      if (this.queues.get(key) === operation) {
        this.queues.delete(key);
      }
    }
  }

  async adaptFromMessage(personId, input) {
    if (!personId) return null;

    const { key, engine } = this.getEngine(personId);
    const signal = detectFeedback(input);

    return this.exclusive(key, async () => {
      await engine.initialize();

      if (signal) {
        await engine.recordFeedback(signal);
      }

      return engine.getProfile();
    });
  }

  async getProfile(personId) {
    if (personId === undefined || personId === null) {
      return null;
    }

    const { key, engine } = this.getEngine(personId);

    return this.exclusive(key, async () => {
      await engine.initialize();
      return engine.getProfile();
    });
  }
}
