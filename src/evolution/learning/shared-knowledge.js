import { randomUUID, createHash } from 'node:crypto';
import { hashPersonId } from './consent-manager.js';
import { validateSharedEntry } from './learning-validator.js';

export class SharedKnowledge {
  constructor(engine) {
    this.engine = engine;
  }

  async propose(personId, entry) {
    const contributor = hashPersonId(personId);

    const validated = validateSharedEntry(entry);

    return this.engine.exclusive(async () => {
      const consents = await this.engine.readFile(
        'consents',
        {}
      );

      if (!consents[contributor]?.shared) {
        throw new Error('Shared learning consent is required');
      }

      const pending = await this.engine.readFile(
        'shared-pending',
        []
      );

      const candidate = {
        id: randomUUID(),
        ...validated,
        contributor,
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      pending.push(candidate);

      await this.engine.writeFile(
        'shared-pending',
        pending.slice(-500)
      );

      return {
        id: candidate.id,
        topic: candidate.topic,
        status: candidate.status
      };
    });
  }

  async approve(candidateId, reviewerId) {
    if (typeof reviewerId !== 'string' || !reviewerId.trim()) {
      throw new Error('A reviewer identifier is required');
    }

    return this.engine.exclusive(async () => {
      const pending = await this.engine.readFile(
        'shared-pending',
        []
      );

      const index = pending.findIndex(
        item => item.id === candidateId
      );

      if (index === -1) {
        throw new Error('Shared candidate not found');
      }

      const candidate = pending[index];

      const consents = await this.engine.readFile(
        'consents',
        {}
      );

      if (!consents[candidate.contributor]?.shared) {
        throw new Error('Contributor consent is no longer active');
      }

      const approved = await this.engine.readFile(
        'shared-approved',
        []
      );

      const record = {
        id: candidate.id,
        topic: candidate.topic,
        fact: candidate.fact,
        source: candidate.source,
        contributor: candidate.contributor,
        reviewer: createHash('sha256')
          .update(reviewerId.trim())
          .digest('hex'),
        status: 'approved',
        approvedAt: new Date().toISOString()
      };

      approved.push(record);

      pending.splice(index, 1);

      await this.engine.writeFile(
        'shared-approved',
        approved.slice(-1000)
      );

      await this.engine.writeFile(
        'shared-pending',
        pending
      );

      return {
        id: record.id,
        topic: record.topic,
        status: record.status
      };
    });
  }

  async reject(candidateId) {
    return this.engine.exclusive(async () => {
      const pending = await this.engine.readFile(
        'shared-pending',
        []
      );

      const next = pending.filter(
        item => item.id !== candidateId
      );

      const removed = next.length !== pending.length;

      await this.engine.writeFile(
        'shared-pending',
        next
      );

      return removed;
    });
  }

  async readApproved() {
    const approved = await this.engine.readFile(
      'shared-approved',
      []
    );

    return approved.map(({ contributor, reviewer, ...item }) => item);
  }

  async readPending() {
    const pending = await this.engine.readFile(
      'shared-pending',
      []
    );

    return pending.map(({ contributor, ...item }) => item);
  }
}
