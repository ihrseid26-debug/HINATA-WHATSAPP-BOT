
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 2000;
const socketCaches = new WeakMap();

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
}

function extractMessageText(root) {
  const visited = new Set();

  function walk(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 15 || visited.has(value)) {
      return '';
    }

    visited.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = walk(item, depth + 1);
        if (found) return found;
      }
      return '';
    }

    if (typeof value.conversation === 'string' && value.conversation.trim()) {
      return value.conversation;
    }

    const directFields = [
      ['extendedTextMessage', 'text'],
      ['imageMessage', 'caption'],
      ['videoMessage', 'caption'],
      ['documentMessage', 'caption'],
      ['documentWithCaptionMessage', 'message'],
      ['buttonsResponseMessage', 'selectedDisplayText'],
      ['templateButtonReplyMessage', 'selectedDisplayText']
    ];

    for (const pair of directFields) {
      const parent = value[pair[0]];
      if (!parent) continue;

      const candidate = parent[pair[1]];

      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate;
      }

      if (typeof candidate === 'object') {
        const found = walk(candidate, depth + 1);
        if (found) return found;
      }
    }

    const wrappers = [
      'ephemeralMessage',
      'viewOnceMessage',
      'viewOnceMessageV2',
      'viewOnceMessageV2Extension',
      'documentWithCaptionMessage',
      'editedMessage'
    ];

    for (const key of wrappers) {
      if (value[key]?.message) {
        const found = walk(value[key].message, depth + 1);
        if (found) return found;
      }
    }

    return '';
  }

  return walk(root);
}

export function rememberNewsletterMessages(sock, messages) {
  if (!sock || !Array.isArray(messages)) return;

  let cache = socketCaches.get(sock);

  if (!cache) {
    cache = [];
    socketCaches.set(sock, cache);
  }

  const now = Date.now();

  for (const message of messages) {
    const key = message?.key;
    const jid = key?.remoteJid;

    if (typeof jid !== 'string' || !jid.endsWith('@newsletter')) {
      continue;
    }

    const serverId = key.server_id || key.id;

    if (!serverId) continue;

    const text = extractMessageText(message.message);
    const normalized = normalizeText(text);

    if (!normalized) continue;

    const identity = String(jid) + ':' + String(serverId);

    const existing = cache.findIndex(item => item.identity === identity);

    const entry = {
      identity,
      jid,
      serverId: String(serverId),
      text,
      normalized,
      timestamp: now
    };

    if (existing >= 0) {
      cache[existing] = entry;
    } else {
      cache.push(entry);
    }
  }

  const valid = cache.filter(item => now - item.timestamp < CACHE_TTL);
  cache.length = 0;
  cache.push(...valid.slice(-MAX_ENTRIES));
}

export function findNewsletterPost(sock, forwardedMessage) {
  const cache = socketCaches.get(sock);

  if (!cache?.length) {
    return { status: 'empty' };
  }

  const text = extractMessageText(forwardedMessage);
  const normalized = normalizeText(text);

  if (!normalized) {
    return { status: 'no-text' };
  }

  const now = Date.now();

  const matches = cache.filter(item =>
    now - item.timestamp < CACHE_TTL &&
    item.normalized === normalized
  );

  if (matches.length === 0) {
    return { status: 'not-found' };
  }

  if (matches.length > 1) {
    return { status: 'ambiguous' };
  }

  return {
    status: 'found',
    post: matches[0]
  };
}
