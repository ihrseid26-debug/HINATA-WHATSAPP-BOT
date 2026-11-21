const metadataCache = new Map();
const CACHE_TTL_MS = 20_000;

function normalizeJid(value) {
  if (!value || typeof value !== 'string') return '';

  let jid = value.trim().replace(/:\d+@/, '@');

  if (jid.endsWith('@c.us')) {
    jid = jid.replace(/@c\.us$/, '@s.whatsapp.net');
  }

  return jid;
}

export async function getGroupMetadata(sock, groupJid, forceRefresh = false) {
  const now = Date.now();
  const cached = metadataCache.get(groupJid);

  if (!forceRefresh && cached && now - cached.time < CACHE_TTL_MS) {
    return cached.value;
  }

  const metadata = await sock.groupMetadata(groupJid);

  metadataCache.set(groupJid, {
    value: metadata,
    time: now
  });

  return metadata;
}

async function expandJid(sock, value) {
  const original = normalizeJid(value);
  const result = new Set(original ? [original] : []);

  if (!original) return result;

  const mapping = sock?.signalRepository?.lidMapping;
  if (!mapping) return result;

  if (
    original.endsWith('@lid') &&
    typeof mapping.getPNForLID === 'function'
  ) {
    try {
      const phoneJid = await mapping.getPNForLID(original);
      const normalized = normalizeJid(phoneJid);
      if (normalized) result.add(normalized);
    } catch {}
  }

  if (
    original.endsWith('@s.whatsapp.net') &&
    typeof mapping.getLIDForPN === 'function'
  ) {
    try {
      const lid = await mapping.getLIDForPN(original);
      const normalized = normalizeJid(lid);
      if (normalized) result.add(normalized);
    } catch {}
  }

  return result;
}

export async function isGroupAdmin(
  sock,
  groupJid,
  senderJid,
  alternateJid = null
) {
  if (!senderJid && !alternateJid) return false;

  // قراءة أحدث بيانات المجموعة حتى لا تبقى ترقية المشرف مخفية في الذاكرة المؤقتة.
  const metadata = await getGroupMetadata(sock, groupJid, true);

  const senderIds = [
    senderJid,
    alternateJid
  ].filter(Boolean);

  const senderSet = new Set();

  for (const value of senderIds) {
    const expanded = await expandJid(sock, value);
    for (const jid of expanded) senderSet.add(jid);
  }

  if (!senderSet.size) return false;

  for (const participant of metadata.participants || []) {
    const participantIds = [
      participant.id,
      participant.lid,
      participant.jid,
      participant.phoneNumber
    ].filter(Boolean);

    const participantSet = new Set();

    for (const value of participantIds) {
      const expanded = await expandJid(sock, value);
      for (const jid of expanded) participantSet.add(jid);
    }

    const matches = [...participantSet].some(id => senderSet.has(id));

    if (
      matches &&
      (
        participant.admin === 'admin' ||
        participant.admin === 'superadmin'
      )
    ) {
      return true;
    }
  }

  return false;
}
