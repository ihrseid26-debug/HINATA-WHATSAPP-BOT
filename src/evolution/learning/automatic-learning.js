import { randomUUID } from 'node:crypto';
import { hashPersonId } from './consent-manager.js';

const MAX_ENTRIES = 100;
const MAX_VALUE_LENGTH = 300;

function extractCandidate(input) {
  if (typeof input !== 'string') return null;

  const text = input.trim();
  if (!text || text.length > 2000) return null;

  const patterns = [
    {
      type: 'preference',
      regex: /^(?:من الآن فصاعداً|من الآن فصاعدًا|أفضل أن|أفضل|أفضّل|لا أحب|أحب|I prefer|I like|I dislike)\s*[:،-]?\s*(.{3,300})$/i
    },
    {
      type: 'correction',
      regex: /^(?:صحح(?:ي)? أن|التصحيح هو|المعلومة الصحيحة هي|Correction:|The correct information is)\s*[:،-]?\s*(.{3,300})$/i
    },
    {
      type: 'fact',
      regex: /^(?:تذكر أن|تذكّر أن|احفظ أن|أريدك أن تتذكر أن|Remember that|Please remember that)\s*[:،-]?\s*(.{3,300})$/i
    }
  ];

  for (const item of patterns) {
    const match = text.match(item.regex);

    if (match?.[1]) {
      const value = match[1].trim();

      if (value.length < 3 || value.length > MAX_VALUE_LENGTH) {
        return null;
      }

      return {
        type: item.type,
        value
      };
    }
  }

  return null;
}

function appearsSensitive(value) {
  const patterns = [
    /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i,
    /\b(?:password|passwd|passcode|secret key|api key|token)\b/i,
    /(?:كلمة المرور|كلمه المرور|رمز التحقق|كود التحقق|كلمة السر|رقم البطاقة|رقم الحساب البنكي)/i,
    /\b(?:\+?\d[\d\s().-]{7,}\d)\b/,
    /\b\d{13,19}\b/
  ];

  return patterns.some(pattern => pattern.test(value));
}

export class AutomaticLearning {
  constructor(engine) {
    this.engine = engine;
  }

  async isEnabled(personId) {
    const key = hashPersonId(personId);
    const settings = await this.engine.readFile(
      'automatic-settings',
      {}
    );

    return settings[key]?.enabled !== false;
  }

  async setEnabled(personId, enabled) {
    if (typeof enabled !== 'boolean') {
      throw new TypeError('enabled must be a boolean');
    }

    const key = hashPersonId(personId);

    return this.engine.exclusive(async () => {
      const settings = await this.engine.readFile(
        'automatic-settings',
        {}
      );

      settings[key] = {
        enabled,
        updatedAt: new Date().toISOString()
      };

      await this.engine.writeFile(
        'automatic-settings',
        settings
      );

      return { enabled };
    });
  }

  async learnFromMessage(personId, input) {
    const key = hashPersonId(personId);
    const candidate = extractCandidate(input);

    if (!candidate || appearsSensitive(candidate.value)) {
      return {
        saved: false,
        reason: 'not_suitable'
      };
    }

    return this.engine.exclusive(async () => {
      const settings = await this.engine.readFile(
        'automatic-settings',
        {}
      );

      if (settings[key]?.enabled === false) {
        return {
          saved: false,
          reason: 'disabled'
        };
      }

      const fileName = `auto-person:${key}`;
      const data = await this.engine.readFile(
        fileName,
        { entries: [] }
      );

      const normalized = candidate.value.toLocaleLowerCase();

      const duplicate = data.entries.some(entry =>
        entry.type === candidate.type &&
        entry.value.toLocaleLowerCase() === normalized
      );

      if (duplicate) {
        return {
          saved: false,
          reason: 'duplicate'
        };
      }

      const record = {
        id: randomUUID(),
        type: candidate.type,
        value: candidate.value,
        createdAt: new Date().toISOString()
      };

      data.entries.push(record);

      if (data.entries.length > MAX_ENTRIES) {
        data.entries = data.entries.slice(-MAX_ENTRIES);
      }

      await this.engine.writeFile(fileName, data);

      return {
        saved: true,
        entry: { ...record }
      };
    });
  }

  async read(personId) {
    const key = hashPersonId(personId);

    if (!(await this.isEnabled(personId))) {
      return [];
    }

    const data = await this.engine.readFile(
      `auto-person:${key}`,
      { entries: [] }
    );

    return [...data.entries];
  }

  async clear(personId) {
    const key = hashPersonId(personId);

    return this.engine.exclusive(async () => {
      await this.engine.removeFile(`auto-person:${key}`);

      return { cleared: true };
    });
  }
}
