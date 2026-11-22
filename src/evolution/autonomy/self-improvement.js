import { promises as fs } from 'node:fs';
import path from 'node:path';

const DEFAULT_PROFILE = Object.freeze({
  tone: 'friendly',
  verbosity: 'balanced',
  initiative: 'medium',
  version: 1
});

const ALLOWED = {
  tone: ['friendly', 'calm', 'formal'],
  verbosity: ['concise', 'balanced', 'detailed'],
  initiative: ['low', 'medium', 'high']
};

const FEEDBACK = {
  prefer_friendly: ['tone', 'friendly'],
  prefer_calm: ['tone', 'calm'],
  prefer_formal: ['tone', 'formal'],
  prefer_concise: ['verbosity', 'concise'],
  prefer_detail: ['verbosity', 'detailed'],
  prefer_balanced: ['verbosity', 'balanced']
};

const THRESHOLD = 3;
const MAX_LOGS = 100;

export class SelfImprovementEngine {
  constructor({
    storageDir = path.resolve('storage'),
    enabled = true
  } = {}) {
    this.storageDir = storageDir;
    this.enabled = enabled;
    this.profilePath = path.join(
      storageDir,
      'personality-profile.json'
    );
    this.logPath = path.join(
      storageDir,
      'self-improvement-log.json'
    );
    this.feedbackPath = path.join(
      storageDir,
      'feedback-counts.json'
    );
  }

  async readJson(file, fallback) {
    try {
      const content = await fs.readFile(file, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'ENOENT') return fallback;
      throw error;
    }
  }

  async writeJson(file, value) {
    await fs.mkdir(this.storageDir, { recursive: true });

    const temporary = `${file}.tmp`;

    await fs.writeFile(
      temporary,
      JSON.stringify(value, null, 2),
      {
        encoding: 'utf8',
        mode: 0o600
      }
    );

    await fs.rename(temporary, file);
  }

  normalizeProfile(profile) {
    const result = { ...DEFAULT_PROFILE };

    for (const key of Object.keys(ALLOWED)) {
      if (ALLOWED[key].includes(profile?.[key])) {
        result[key] = profile[key];
      }
    }

    if (Number.isInteger(profile?.version)) {
      result.version = profile.version;
    }

    return result;
  }

  async initialize() {
    await fs.mkdir(this.storageDir, { recursive: true });

    const saved = await this.readJson(
      this.profilePath,
      DEFAULT_PROFILE
    );

    const profile = this.normalizeProfile(saved);

    await this.writeJson(this.profilePath, profile);

    await this.readJson(this.logPath, []);
    await this.readJson(this.feedbackPath, {});

    return profile;
  }

  async getProfile() {
    const saved = await this.readJson(
      this.profilePath,
      DEFAULT_PROFILE
    );

    return this.normalizeProfile(saved);
  }

  async getHistory() {
    return this.readJson(this.logPath, []);
  }

  async adjust(field, value, reason = 'self-review') {
    if (!this.enabled) {
      return { changed: false, reason: 'disabled' };
    }

    if (!Object.hasOwn(ALLOWED, field)) {
      throw new Error('This profile field cannot be modified');
    }

    if (!ALLOWED[field].includes(value)) {
      throw new Error('Invalid profile value');
    }

    const profile = await this.getProfile();
    const previous = profile[field];

    if (previous === value) {
      return { changed: false, reason: 'unchanged' };
    }

    profile[field] = value;
    profile.version += 1;

    const history = await this.getHistory();

    history.push({
      field,
      previous,
      next: value,
      reason: String(reason).slice(0, 100),
      timestamp: new Date().toISOString(),
      version: profile.version
    });

    await this.writeJson(
      this.profilePath,
      profile
    );

    await this.writeJson(
      this.logPath,
      history.slice(-MAX_LOGS)
    );

    return {
      changed: true,
      field,
      previous,
      next: value,
      version: profile.version
    };
  }

  async recordFeedback(signal) {
    if (!this.enabled) {
      return { changed: false, reason: 'disabled' };
    }

    if (!Object.hasOwn(FEEDBACK, signal)) {
      throw new Error('Unknown feedback signal');
    }

    const counts = await this.readJson(
      this.feedbackPath,
      {}
    );

    counts[signal] = (counts[signal] || 0) + 1;

    if (counts[signal] < THRESHOLD) {
      await this.writeJson(this.feedbackPath, counts);

      return {
        changed: false,
        feedbackCount: counts[signal],
        required: THRESHOLD
      };
    }

    const [field, value] = FEEDBACK[signal];

    const result = await this.adjust(
      field,
      value,
      `repeated-human-feedback:${signal}`
    );

    counts[signal] = 0;

    await this.writeJson(this.feedbackPath, counts);

    return {
      ...result,
      feedbackCount: THRESHOLD
    };
  }

  async restorePrevious() {
    if (!this.enabled) {
      return { changed: false, reason: 'disabled' };
    }

    const history = await this.getHistory();
    const last = history.at(-1);

    if (!last) {
      return { changed: false, reason: 'no-history' };
    }

    const result = await this.adjust(
      last.field,
      last.previous,
      'restore-previous-version'
    );

    return result;
  }
}
