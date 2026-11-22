import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ExperienceEngine } from './experience-engine.js';
import { ReflectionEngine } from './reflection-engine.js';

const MAX_HISTORY = 100;

const GOALS = Object.freeze({
  learn_from_corrections: 'مراجعة التصحيحات',
  understand_preferences: 'تحليل التفضيلات',
  improve_consistency: 'مراجعة الاستمرارية',
  review_progress: 'تقييم التقدم'
});

function createInitialState() {
  return {
    version: 1,
    enabled: true,
    primaryMission: 'continuous_self_development',
    activeGoal: 'review_progress',
    interactions: 0,
    corrections: 0,
    preferences: 0,
    facts: 0,
    reviewedCorrections: 0,
    reviewedPreferences: 0,
    lastConsistencyReview: 0,
    cycles: 0,
    experiences: [],
    decisions: [],
    updatedAt: new Date().toISOString()
  };
}

function classifyMessage(input) {
  if (typeof input !== 'string') return 'neutral';

  const text = input.trim();

  if (!text || text.length > 2000) return 'neutral';

  if (
    /^(?:صحح(?:ي)? أن|التصحيح هو|المعلومة الصحيحة هي|Correction:|The correct information is)/i.test(text)
  ) {
    return 'correction';
  }

  if (
    /^(?:أفضل أن|أفضل|أفضّل|لا أحب|أحب|من الآن فصاعداً|من الآن فصاعدًا|I prefer|I like|I dislike)/i.test(text)
  ) {
    return 'preference';
  }

  if (
    /^(?:تذكر أن|تذكّر أن|احفظ أن|Remember that|Please remember that)/i.test(text)
  ) {
    return 'fact';
  }

  return 'neutral';
}

export class AutonomousDevelopmentEngine {
  constructor({
    storageDir = path.resolve('storage')
  } = {}) {
    this.storageDir = path.resolve(storageDir);
    this.statePath = path.join(
      this.storageDir,
      'autonomy',
      'development-state.json'
    );

    this.queue = Promise.resolve();
    this.experiences = new ExperienceEngine({ storageDir });
    this.reflection = new ReflectionEngine({ storageDir });
  }

  exclusive(task) {
    const operation = this.queue.then(task, task);

    this.queue = operation.then(
      () => undefined,
      () => undefined
    );

    return operation;
  }

  async readState() {
    try {
      const raw = await fs.readFile(this.statePath, 'utf8');
      const saved = JSON.parse(raw);

      if (
        !saved ||
        saved.version !== 1 ||
        typeof saved.enabled !== 'boolean' ||
        !Array.isArray(saved.experiences) ||
        !Array.isArray(saved.decisions)
      ) {
        throw new Error('Invalid autonomy state');
      }

      return {
        ...createInitialState(),
        ...saved
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return createInitialState();
      }

      throw error;
    }
  }

  async writeState(state) {
    await fs.mkdir(path.dirname(this.statePath), {
      recursive: true
    });

    const temporary = `${this.statePath}.${process.pid}.tmp`;

    try {
      await fs.writeFile(
        temporary,
        JSON.stringify(state, null, 2),
        {
          encoding: 'utf8',
          mode: 0o600
        }
      );

      await fs.rename(temporary, this.statePath);
    } catch (error) {
      try {
        await fs.unlink(temporary);
      } catch {}

      throw error;
    }
  }

  async initialize() {
    return this.exclusive(async () => {
      const state = await this.readState();
      await this.writeState(state);
      await this.experiences.initialize();
      await this.reflection.initialize();

      return {
        initialized: true,
        enabled: state.enabled
      };
    });
  }

  async observeMessage(input) {
    const kind = classifyMessage(input);

    return this.exclusive(async () => {
      const state = await this.readState();

      if (!state.enabled) {
        return {
          recorded: false,
          reason: 'disabled'
        };
      }

      state.interactions += 1;

      if (kind === 'correction') state.corrections += 1;
      if (kind === 'preference') state.preferences += 1;
      if (kind === 'fact') state.facts += 1;

      // لا نحفظ نص الرسالة أو بيانات صاحبها.
      if (kind !== 'neutral') {
        state.experiences.push({
          kind,
          timestamp: new Date().toISOString()
        });

        state.experiences = state.experiences.slice(-MAX_HISTORY);
      }

      state.updatedAt = new Date().toISOString();
      await this.experiences.record(kind);

      await this.writeState(state);

      return {
        recorded: kind !== 'neutral',
        kind
      };
    });
  }

  chooseGoal(state) {
    if (state.corrections > state.reviewedCorrections) {
      return 'learn_from_corrections';
    }

    if (state.preferences > state.reviewedPreferences) {
      return 'understand_preferences';
    }

    if (
      state.interactions >= 5 &&
      state.interactions - state.lastConsistencyReview >= 5
    ) {
      return 'improve_consistency';
    }

    return 'review_progress';
  }

  async executeGoal(state, goal) {
    switch (goal) {
      case 'learn_from_corrections': {
        const reviewed =
          state.corrections - state.reviewedCorrections;

        state.reviewedCorrections = state.corrections;

        return {
          action: 'review_correction_signals',
          reviewed
        };
      }

      case 'understand_preferences': {
        const reviewed =
          state.preferences - state.reviewedPreferences;

        state.reviewedPreferences = state.preferences;

        return {
          action: 'review_preference_signals',
          reviewed
        };
      }

      case 'improve_consistency': {
        state.lastConsistencyReview = state.interactions;

        return {
          action: 'review_interaction_consistency',
          interactionsReviewed: state.interactions
        };
      }

      default:
        return {
          action: 'evaluate_development_progress',
          interactions: state.interactions,
          corrections: state.corrections,
          preferences: state.preferences
        };
    }
  }

  async runCycle() {
    return this.exclusive(async () => {
      const state = await this.readState();

      if (!state.enabled) {
        return {
          executed: false,
          reason: 'disabled'
        };
      }

      const previousGoal = state.activeGoal;
      const nextGoal = this.chooseGoal(state);

      state.activeGoal = nextGoal;

      const result = await this.executeGoal(state, nextGoal);
      const experienceSummary = await this.experiences.getSummary();
      const reflection = await this.reflection.reflect(experienceSummary);

      state.cycles += 1;

      state.decisions.push({
        goal: nextGoal,
        changed: previousGoal !== nextGoal,
        cycle: state.cycles,
        timestamp: new Date().toISOString(),
        result,
        reflection: {
          level: reflection.level,
          nextFocus: reflection.nextFocus
        }
      });

      state.decisions = state.decisions.slice(-MAX_HISTORY);
      state.updatedAt = new Date().toISOString();

      await this.writeState(state);

      return {
        executed: true,
        goalChanged: previousGoal !== nextGoal,
        cycle: state.cycles
      };
    });
  }

  async setEnabled(enabled) {
    if (typeof enabled !== 'boolean') {
      throw new TypeError('enabled must be a boolean');
    }

    return this.exclusive(async () => {
      const state = await this.readState();

      state.enabled = enabled;
      state.updatedAt = new Date().toISOString();

      await this.writeState(state);

      return { enabled };
    });
  }

  async getStatus() {
    const state = await this.readState();

    return {
      enabled: state.enabled,
      mission: state.primaryMission,
      interactions: state.interactions,
      experiences: state.experiences.length,
      completedCycles: state.cycles,
      latestReflection: await this.reflection.getLatest()
    };
  }

  async getDevelopmentHistory() {
    const state = await this.readState();

    return state.decisions.map(item => ({ ...item }));
  }
}

export { GOALS };
