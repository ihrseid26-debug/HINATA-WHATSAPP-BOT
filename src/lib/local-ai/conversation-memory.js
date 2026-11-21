// ذاكرة مؤقتة مستقلة لكل اتصال ومحادثة ومرسل.
const memories = new WeakMap();

const TTL_MS = 10 * 60 * 1000;
const MAX_TURNS = 8;
const MAX_CONTEXT = 4;

function getStore(sock) {
  let store = memories.get(sock);

  if (!store) {
    store = new Map();
    memories.set(sock, store);
  }

  return store;
}

function makeKey(chatJid, senderJid) {
  return `${chatJid}\u0000${senderJid}`;
}

export function getConversationContext(sock, chatJid, senderJid) {
  if (!sock || !chatJid || !senderJid) return [];

  const store = getStore(sock);
  const key = makeKey(chatJid, senderJid);
  const entry = store.get(key);

  if (!entry) return [];

  if (Date.now() - entry.updatedAt > TTL_MS) {
    store.delete(key);
    return [];
  }

  return entry.turns.slice(-MAX_CONTEXT);
}

export function rememberConversationTurn(
  sock,
  chatJid,
  senderJid,
  text
) {
  if (!sock || !chatJid || !senderJid) return;

  const value = String(text ?? '').trim();
  if (!value) return;

  const store = getStore(sock);
  const key = makeKey(chatJid, senderJid);
  const now = Date.now();

  let entry = store.get(key);

  if (!entry || now - entry.updatedAt > TTL_MS) {
    entry = { turns: [], updatedAt: now };
  }

  entry.turns.push(value.slice(0, 500));

  if (entry.turns.length > MAX_TURNS) {
    entry.turns.splice(0, entry.turns.length - MAX_TURNS);
  }

  entry.updatedAt = now;
  store.set(key, entry);

  // حد أعلى لعدد المحادثات المخزنة في اتصال واحد.
  if (store.size > 500) {
    const oldestKey = store.keys().next().value;
    if (oldestKey !== undefined) store.delete(oldestKey);
  }
}
