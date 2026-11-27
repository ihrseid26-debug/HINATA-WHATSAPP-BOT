const INSTALLED_SYMBOL = Symbol.for('wa_sound_sticker.wire_installed');
const ATTACHMENT_SYMBOL = Symbol.for('wa_sound_sticker.attachment');

const MAX_PENDING_ENTRIES = 256;
const PENDING_TTL_MS = 10 * 60 * 1000;

const pendingWeak = new WeakMap();
const pendingByEncHash = new Map();

export function encodeVarint(value) {
  const parts = [];
  let n = value >>> 0;
  while (n > 0x7f) {
    parts.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  parts.push(n);
  return Buffer.from(parts);
}

export function decodeVarint(buf, offset) {
  let value = 0;
  let shift = 0;
  let bytes = 0;
  while (offset + bytes < buf.length) {
    const b = buf[offset + bytes];
    value |= (b & 0x7f) << shift;
    bytes += 1;
    if ((b & 0x80) === 0) {
      return { value: value >>> 0, bytes, ok: true };
    }
    shift += 7;
    if (shift > 35) {
      return { value: 0, bytes: 0, ok: false };
    }
  }
  return { value: 0, bytes: 0, ok: false };
}

export function scanWireFields(buf) {
  const data = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const fields = [];
  let i = 0;
  while (i < data.length) {
    const start = i;
    const tag = decodeVarint(data, i);
    if (!tag.ok) break;
    i += tag.bytes;
    const fieldNum = tag.value >>> 3;
    const wireType = tag.value & 0x07;
    if (wireType === 0) {
      const v = decodeVarint(data, i);
      if (!v.ok) break;
      i += v.bytes;
      fields.push({ fieldNum, wireType, start, end: i, varintVal: v.value, val: data.subarray(start + tag.bytes, i) });
    } else if (wireType === 1) {
      if (i + 8 > data.length) break;
      const val = data.subarray(i, i + 8);
      i += 8;
      fields.push({ fieldNum, wireType, start, end: i, val });
    } else if (wireType === 2) {
      const len = decodeVarint(data, i);
      if (!len.ok) break;
      const valStart = i + len.bytes;
      const valEnd = valStart + len.value;
      if (valEnd > data.length) break;
      i = valEnd;
      fields.push({ fieldNum, wireType, start, end: i, val: data.subarray(valStart, valEnd) });
    } else if (wireType === 5) {
      if (i + 4 > data.length) break;
      const val = data.subarray(i, i + 4);
      i += 4;
      fields.push({ fieldNum, wireType, start, end: i, val });
    } else {
      break;
    }
  }
  return fields;
}

function prunePendingCache() {
  const now = Date.now();
  for (const [k, entry] of pendingByEncHash) {
    if (now - entry.createdAt > PENDING_TTL_MS) {
      pendingByEncHash.delete(k);
    }
  }
  while (pendingByEncHash.size > MAX_PENDING_ENTRIES) {
    const oldest = pendingByEncHash.keys().next().value;
    pendingByEncHash.delete(oldest);
  }
}

export function registerPendingSoundSticker(stickerMessage, attachment) {
  if (!stickerMessage || typeof stickerMessage !== 'object') {
    throw new Error('stickerMessage object is required');
  }
  if (!attachment?.audioBytes || !attachment.audioBytes.length) {
    throw new Error('attachment.audioBytes is required');
  }
  const entry = {
    audioBytes: Buffer.isBuffer(attachment.audioBytes)
      ? attachment.audioBytes
      : Buffer.from(attachment.audioBytes),
    premium: attachment.premium ?? 0,
    emojis: attachment.emojis ? String(attachment.emojis) : '',
    createdAt: Date.now(),
  };
  pendingWeak.set(stickerMessage, entry);
  try {
    Object.defineProperty(stickerMessage, ATTACHMENT_SYMBOL, {
      value: entry,
      enumerable: false,
      configurable: true,
    });
  } catch {}
  if (stickerMessage.fileEncSha256) {
    prunePendingCache();
    const hex = Buffer.from(stickerMessage.fileEncSha256).toString('hex');
    pendingByEncHash.set(hex, entry);
  }
  return entry;
}

function lookupPendingAttachment(stickerMessage) {
  if (!stickerMessage || typeof stickerMessage !== 'object') return null;
  if (stickerMessage[ATTACHMENT_SYMBOL]) return stickerMessage[ATTACHMENT_SYMBOL];
  if (pendingWeak.has(stickerMessage)) return pendingWeak.get(stickerMessage);
  if (stickerMessage.fileEncSha256) {
    const hex = Buffer.from(stickerMessage.fileEncSha256).toString('hex');
    const entry = pendingByEncHash.get(hex);
    if (entry) {
      if (Date.now() - entry.createdAt <= PENDING_TTL_MS) return entry;
      pendingByEncHash.delete(hex);
    }
  }
  return null;
}

function cloneMessageOmitting(m, omittedKeys) {
  const rest = Object.create(Object.getPrototypeOf(m) || Object.prototype);
  for (const key of Object.keys(m)) {
    if (!omittedKeys.has(key)) {
      rest[key] = m[key];
    }
  }
  return rest;
}

/**
 * Installs a zero-touch runtime hook onto Baileys' `proto.Message.encode` and `proto.Message.decode`
 * so WhatsApp sound stickers (`Message` field 134 -> `FutureProofMessage` -> `StickerMessage`
 * with fields 24, 25, 26) can be sent and received without modifying `node_modules`.
 */
export function installSoundStickerCodec(proto) {
  if (!proto?.Message) {
    throw new Error('Valid Baileys proto.Message is required');
  }
  if (proto.Message[INSTALLED_SYMBOL]) {
    return proto;
  }

  const origEncode = proto.Message.encode;
  const origDecode = proto.Message.decode;
  const hasNativeField134 = Object.prototype.hasOwnProperty.call(
    proto.Message.prototype || {},
    'audioStickerMessage',
  );
  const hasNativeStickerAudio = Object.prototype.hasOwnProperty.call(
    proto.Message.StickerMessage?.prototype || {},
    'audioMessage',
  );

  function writeStickerNodeWithAudio(w, stk, attachment) {
    w.uint32((26 << 3) | 2).fork();
    if (hasNativeStickerAudio) {
      const cleanStk = cloneMessageOmitting(stk, new Set(['premium', 'emojis', 'audioMessage']));
      proto.Message.StickerMessage.encode(cleanStk, w);
    } else {
      proto.Message.StickerMessage.encode(stk, w);
    }
    const premium = attachment?.premium ?? stk.premium ?? 0;
    const emojis = attachment?.emojis ?? stk.emojis ?? '';
    const audioBytes = attachment?.audioBytes
      || (stk.audioMessage ? proto.Message.AudioMessage.encode(stk.audioMessage).finish() : null);

    w.uint32((24 << 3) | 0).uint32(premium >>> 0);
    if (emojis) {
      w.uint32((25 << 3) | 2).string(String(emojis));
    }
    if (audioBytes && audioBytes.length > 0) {
      w.uint32((26 << 3) | 2).bytes(audioBytes);
    }
    w.ldelim();
  }

  proto.Message.encode = function encodeWithSoundStickers(m, w) {
    if (m && typeof m === 'object') {
      const attachment = m.stickerMessage ? lookupPendingAttachment(m.stickerMessage) : null;
      if (attachment) {
        const rest = cloneMessageOmitting(m, new Set(['stickerMessage', 'audioStickerMessage']));
        const writer = origEncode.call(this, rest, w);
        writer.uint32((134 << 3) | 2).fork();
        writer.uint32((1 << 3) | 2).fork();
        writeStickerNodeWithAudio(writer, m.stickerMessage, attachment);
        writer.ldelim();
        writer.ldelim();
        return writer;
      }

      if (!hasNativeField134 && m.audioStickerMessage?.message?.stickerMessage) {
        const innerMsg = m.audioStickerMessage.message;
        const innerStk = innerMsg.stickerMessage;
        const rest = cloneMessageOmitting(m, new Set(['audioStickerMessage']));
        const writer = origEncode.call(this, rest, w);
        writer.uint32((134 << 3) | 2).fork();
        writer.uint32((1 << 3) | 2).fork();
        const innerRest = cloneMessageOmitting(innerMsg, new Set(['stickerMessage']));
        origEncode.call(this, innerRest, writer);
        writeStickerNodeWithAudio(writer, innerStk, null);
        writer.ldelim();
        writer.ldelim();
        return writer;
      }
    }
    return origEncode.call(this, m, w);
  };

  proto.Message.decode = function decodeWithSoundStickers(r, l, e) {
    let rawBuf = null;
    let startPos = 0;
    let endPos = 0;
    if (r instanceof Uint8Array) {
      rawBuf = r;
      startPos = 0;
      endPos = l === undefined ? r.length : l;
    } else if (r && r.buf instanceof Uint8Array) {
      rawBuf = r.buf;
      startPos = r.pos;
      endPos = l === undefined ? r.len : r.pos + l;
    }

    const msg = origDecode.call(this, r, l, e);

    if (rawBuf && endPos <= rawBuf.length && endPos > startPos) {
      const topFields = scanWireFields(rawBuf.subarray(startPos, endPos));
      const f134 = topFields.find(f => f.fieldNum === 134 && f.wireType === 2);
      if (f134) {
        const fpFields = scanWireFields(f134.val);
        const f1 = fpFields.find(f => f.fieldNum === 1 && f.wireType === 2);
        if (f1) {
          const innerMsg = proto.Message.decode(f1.val);
          const innerFields = scanWireFields(f1.val);
          const f26 = innerFields.find(f => f.fieldNum === 26 && f.wireType === 2);
          if (f26 && innerMsg.stickerMessage) {
            const stkFields = scanWireFields(f26.val);
            for (const sf of stkFields) {
              if (sf.fieldNum === 24 && sf.wireType === 0) {
                innerMsg.stickerMessage.premium = sf.varintVal;
              } else if (sf.fieldNum === 25 && sf.wireType === 2) {
                innerMsg.stickerMessage.emojis = Buffer.from(sf.val).toString('utf8');
              } else if (sf.fieldNum === 26 && sf.wireType === 2 && proto.Message.AudioMessage) {
                innerMsg.stickerMessage.audioMessage = proto.Message.AudioMessage.decode(sf.val);
              }
            }
          }
          msg.audioStickerMessage = proto.Message.FutureProofMessage
            ? proto.Message.FutureProofMessage.create({ message: innerMsg })
            : { message: innerMsg };
        }
      }
    }
    return msg;
  };

  Object.defineProperty(proto.Message, INSTALLED_SYMBOL, {
    value: true,
    enumerable: false,
  });

  return proto;
}

export function unwrapSoundStickerMessage(message) {
  let cur = message;
  for (let i = 0; i < 8 && cur && typeof cur === 'object'; i += 1) {
    const next =
      cur.deviceSentMessage?.message
      ?? cur.ephemeralMessage?.message
      ?? cur.viewOnceMessage?.message
      ?? cur.viewOnceMessageV2?.message
      ?? cur.audioStickerMessage?.message;
    if (!next) break;
    cur = next;
  }
  return cur;
}

export function extractSoundStickerInfo(msgOrMessage) {
  const root = msgOrMessage?.message || msgOrMessage;
  const unwrapped = unwrapSoundStickerMessage(root);
  const stk = unwrapped?.stickerMessage;
  if (!stk) return null;
  const audio = stk.audioMessage || null;
  return {
    stickerMessage: stk,
    audioMessage: audio,
    hasAudio: Boolean(audio && (audio.url || audio.directPath)),
    isAnimated: Boolean(stk.isAnimated),
    emojis: stk.emojis || null,
    premium: stk.premium ?? null,
    audioSeconds: audio?.seconds ?? null,
    audioMimetype: audio?.mimetype || null,
  };
}
