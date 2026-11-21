/**
 * ALVARIA SUBBOT MEDIA CACHE
 * CacheStore متوافق مع Baileys 7.
 * يستخدم للبوتات الفرعية فقط.
 */

const MAX_CACHE_BYTES = 64 * 1024 * 1024;
const MAX_CACHE_ITEMS = 80;

const entries = new Map();
let totalBytes = 0;

function getSize(value) {
  if (Buffer.isBuffer(value)) return value.length;
  if (value instanceof Uint8Array) return value.byteLength;

  if (value?.byteLength && Number.isFinite(value.byteLength)) {
    return value.byteLength;
  }

  return 0;
}

function removeEntry(key) {
  const entry = entries.get(key);
  if (!entry) return;

  totalBytes -= entry.size;
  entries.delete(key);
}

function trimCache() {
  while (
    entries.size > MAX_CACHE_ITEMS ||
    totalBytes > MAX_CACHE_BYTES
  ) {
    const oldestKey = entries.keys().next().value;

    if (oldestKey === undefined) break;

    removeEntry(oldestKey);
  }
}

export const subbotMediaCache = Object.freeze({
  get(key) {
    const entry = entries.get(key);

    if (!entry) return undefined;

    // تحديث ترتيب LRU.
    entries.delete(key);
    entries.set(key, entry);

    return entry.value;
  },

  set(key, value) {
    if (typeof key !== 'string' || !key) return;

    const size = getSize(value);

    if (!size || size > MAX_CACHE_BYTES) {
      removeEntry(key);
      return;
    }

    removeEntry(key);

    entries.set(key, { value, size });
    totalBytes += size;

    trimCache();
  },

  del(key) {
    removeEntry(key);
  },

  flushAll() {
    entries.clear();
    totalBytes = 0;
  },

  close() {
    // لا توجد موارد خارجية لإغلاقها.
  }
});

export function getSubbotMediaCacheStats() {
  return {
    items: entries.size,
    bytes: totalBytes,
    maxBytes: MAX_CACHE_BYTES,
    maxItems: MAX_CACHE_ITEMS
  };
}
