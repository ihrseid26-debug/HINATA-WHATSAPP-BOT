import { createHash } from 'node:crypto';
import { validatePersonId } from './learning-validator.js';

export function hashPersonId(personId) {
  const id = validatePersonId(personId);

  return createHash('sha256')
    .update(id)
    .digest('hex');
}

export class ConsentManager {
  constructor(engine) {
    this.engine = engine;
  }

  async grant(personId, {
    personal = false,
    shared = false
  } = {}) {
    const key = hashPersonId(personId);

    return this.engine.exclusive(async () => {
      const consents = await this.engine.readFile(
        'consents',
        {}
      );

      consents[key] = {
        personal: Boolean(personal),
        shared: Boolean(shared),
        updatedAt: new Date().toISOString()
      };

      await this.engine.writeFile('consents', consents);

      return { ...consents[key] };
    });
  }

  async get(personId) {
    const key = hashPersonId(personId);

    const consents = await this.engine.readFile(
      'consents',
      {}
    );

    return consents[key] || {
      personal: false,
      shared: false
    };
  }

  async revoke(personId, scope = 'all') {
    const key = hashPersonId(personId);

    if (!['all', 'personal', 'shared'].includes(scope)) {
      throw new Error('Invalid consent scope');
    }

    return this.engine.exclusive(async () => {
      const consents = await this.engine.readFile(
        'consents',
        {}
      );

      const current = consents[key] || {
        personal: false,
        shared: false
      };

      if (scope === 'all' || scope === 'personal') {
        current.personal = false;

        await this.engine.removeFile(
          `person:${key}`
        );
      }

      if (scope === 'all' || scope === 'shared') {
        current.shared = false;

        const pending = await this.engine.readFile(
          'shared-pending',
          []
        );

        const approved = await this.engine.readFile(
          'shared-approved',
          []
        );

        await this.engine.writeFile(
          'shared-pending',
          pending.filter(item => item.contributor !== key)
        );

        await this.engine.writeFile(
          'shared-approved',
          approved.filter(item => item.contributor !== key)
        );
      }

      if (!current.personal && !current.shared) {
        delete consents[key];
      } else {
        current.updatedAt = new Date().toISOString();
        consents[key] = current;
      }

      await this.engine.writeFile('consents', consents);

      return {
        revoked: scope,
        remaining: {
          personal: Boolean(current.personal),
          shared: Boolean(current.shared)
        }
      };
    });
  }
}
