export const MEMORY_TYPES = Object.freeze([
  'preference',
  'fact',
  'correction',
  'experience'
]);

export function validatePersonId(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError('A valid person identifier is required');
  }

  if (value.length > 256) {
    throw new Error('Person identifier is too long');
  }

  return value.trim();
}

export function validateMemoryEntry({ type, value }) {
  if (!MEMORY_TYPES.includes(type)) {
    throw new Error('Unsupported memory type');
  }

  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError('Memory value must be non-empty text');
  }

  if (value.length > 1000) {
    throw new Error('Memory value exceeds 1000 characters');
  }

  return {
    type,
    value: value.trim()
  };
}

export function validateSharedEntry({
  topic,
  fact,
  source,
  containsPersonalData
}) {
  if (containsPersonalData !== false) {
    throw new Error(
      'Shared knowledge must explicitly contain no personal data'
    );
  }

  for (const [name, value] of [
    ['topic', topic],
    ['fact', fact],
    ['source', source]
  ]) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new TypeError(`${name} is required`);
    }
  }

  if (topic.length > 120 || fact.length > 1000 || source.length > 300) {
    throw new Error('Shared knowledge field is too long');
  }

  return {
    topic: topic.trim(),
    fact: fact.trim(),
    source: source.trim()
  };
}
