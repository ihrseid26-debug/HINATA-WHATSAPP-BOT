import { requireCapability } from '../safety/guard.js';

export class MemoryStore {
  constructor() {
    this.entries = new Map();
  }

  write(key, value) {
    requireCapability('memory.write');

    if (typeof key !== 'string' || !key.trim()) {
      throw new TypeError('Memory key must be a non-empty string');
    }

    this.entries.set(key, value);
    return true;
  }

  read(key) {
    requireCapability('memory.read');
    return this.entries.get(key) ?? null;
  }

  delete(key) {
    requireCapability('memory.write');
    return this.entries.delete(key);
  }

  clear() {
    requireCapability('memory.write');
    this.entries.clear();
  }
}
