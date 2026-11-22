import { randomUUID } from 'node:crypto';
import { hashPersonId } from './consent-manager.js';
import { validateMemoryEntry } from './learning-validator.js';

export class PersonalMemory {
  constructor(engine) {
    this.engine = engine;
  }

  async remember(personId, entry) {
    const key = hashPersonId(personId);
    const validated = validateMemoryEntry(entry);

    return this.engine.exclusive(async () => {
      const consents = await this.engine.readFile(
        'consents',
        {}
      );

      if (!consents[key]?.personal) {
        throw new Error('Personal memory consent is required');
      }

      const data = await this.engine.readFile(
        `person:${key}`,
        { entries: [] }
      );

      const record = {
        id: randomUUID(),
        ...validated,
        createdAt: new Date().toISOString()
      };

      data.entries.push(record);

      if (data.entries.length > 500) {
        data.entries = data.entries.slice(-500);
      }

      await this.engine.writeFile(
        `person:${key}`,
        data
      );

      return { ...record };
    });
  }

  async read(personId) {
    const key = hashPersonId(personId);

    const consents = await this.engine.readFile(
      'consents',
      {}
    );

    if (!consents[key]?.personal) {
      throw new Error('Personal memory consent is required');
    }

    const data = await this.engine.readFile(
      `person:${key}`,
      { entries: [] }
    );

    return [...data.entries];
  }

  async forgetEntry(personId, entryId) {
    const key = hashPersonId(personId);

    return this.engine.exclusive(async () => {
      const consents = await this.engine.readFile(
        'consents',
        {}
      );

      if (!consents[key]?.personal) {
        throw new Error('Personal memory consent is required');
      }

      const data = await this.engine.readFile(
        `person:${key}`,
        { entries: [] }
      );

      const before = data.entries.length;

      data.entries = data.entries.filter(
        item => item.id !== entryId
      );

      await this.engine.writeFile(`person:${key}`, data);

      return data.entries.length < before;
    });
  }
}
