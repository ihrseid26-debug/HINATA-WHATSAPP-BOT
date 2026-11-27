import { createHash, randomBytes } from 'node:crypto';

export const STICKER_SIDE_PX = 512;

export function makeWebpChunk(fourcc, data) {
  if (typeof fourcc !== 'string' || fourcc.length !== 4) {
    throw new Error(`Invalid WebP chunk fourcc: ${fourcc}`);
  }
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const pad = payload.length & 1;
  const out = Buffer.alloc(8 + payload.length + pad);
  out.write(fourcc, 0, 4, 'ascii');
  out.writeUInt32LE(payload.length, 4);
  payload.copy(out, 8);
  return out;
}

export function readWebpChunks(webpBuffer) {
  const buf = Buffer.isBuffer(webpBuffer) ? webpBuffer : Buffer.from(webpBuffer);
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('Invalid WebP RIFF container');
  }
  const chunks = [];
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const fourcc = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const dataEnd = offset + 8 + size;
    if (dataEnd > buf.length) {
      throw new Error(`Truncated WebP chunk ${fourcc} at offset ${offset}`);
    }
    chunks.push({ fourcc, data: buf.subarray(offset + 8, dataEnd) });
    offset = dataEnd + (size & 1);
  }
  return chunks;
}

function writeUInt24LE(buf, offset, value) {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >> 8) & 0xff;
  buf[offset + 2] = (value >> 16) & 0xff;
}

function readUInt24LE(buf, offset) {
  return buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16);
}

export function packIdFor(packName = '', publisher = '') {
  if (!packName && !publisher) {
    const b = randomBytes(16);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = b.toString('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
  }
  const h = createHash('sha256')
    .update(`wa-sound-sticker|${packName}|${publisher}`)
    .digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export function buildWhatsAppStickerMeta({
  packId,
  packName = process.env.WA_STICKER_PACK_NAME || 'WA Sound Stickers',
  publisher = process.env.WA_STICKER_PUBLISHER || 'wa-sound-sticker',
  emojis = ['🔊'],
  soundSha256 = null,
} = {}) {
  const cleanName = String(packName || '').trim().slice(0, 128);
  const cleanPublisher = String(publisher || '').trim().slice(0, 128);
  const emojiList = Array.isArray(emojis)
    ? emojis.map(e => String(e).trim()).filter(Boolean)
    : String(emojis || '').trim()
      ? [String(emojis).trim()]
      : ['🔊'];
  const meta = {
    'sticker-pack-id': packId || packIdFor(cleanName, cleanPublisher),
  };
  if (cleanName) meta['sticker-pack-name'] = cleanName;
  if (cleanPublisher) meta['sticker-pack-publisher'] = cleanPublisher;
  meta.emojis = emojiList.length ? emojiList : ['🔊'];
  if (soundSha256) {
    meta['sound-sha256'] = soundSha256;
  }
  return meta;
}

export function buildWhatsAppExif(meta) {
  const jsonBytes = Buffer.from(JSON.stringify(meta), 'utf8');
  const header = Buffer.alloc(26);
  // Big-endian TIFF header ("MM\0*") + 1 IFD0 entry: tag 0x5741 ("WA"), UNDEFINED (7), count, offset 26
  header[0] = 0x4d;
  header[1] = 0x4d;
  header[2] = 0x00;
  header[3] = 0x2a;
  header.writeUInt32BE(8, 4);
  header.writeUInt16BE(1, 8);
  header.writeUInt16BE(0x5741, 10);
  header.writeUInt16BE(7, 12);
  header.writeUInt32BE(jsonBytes.length, 14);
  header.writeUInt32BE(26, 18);
  header.writeUInt32BE(0, 22);
  return Buffer.concat([header, jsonBytes]);
}

export function extractWhatsAppExifMeta(webpBuffer) {
  const chunks = readWebpChunks(webpBuffer);
  const exifChunk = chunks.find(c => c.fourcc === 'EXIF');
  if (!exifChunk || exifChunk.data.length <= 26) return null;
  const payload = exifChunk.data;
  if (payload[0] === 0x4d && payload[1] === 0x4d && payload.readUInt16BE(10) === 0x5741) {
    const len = payload.readUInt32BE(14);
    const off = payload.readUInt32BE(18);
    if (off + len <= payload.length) {
      return JSON.parse(payload.subarray(off, off + len).toString('utf8'));
    }
  }
  const idx = payload.indexOf(Buffer.from('{'));
  if (idx >= 0) {
    return JSON.parse(payload.subarray(idx).toString('utf8'));
  }
  return null;
}

function inferImageDimensionsFromChunks(chunks) {
  const vp8x = chunks.find(c => c.fourcc === 'VP8X');
  if (vp8x && vp8x.data.length >= 10) {
    return {
      width: readUInt24LE(vp8x.data, 4) + 1,
      height: readUInt24LE(vp8x.data, 7) + 1,
    };
  }
  const vp8l = chunks.find(c => c.fourcc === 'VP8L');
  if (vp8l && vp8l.data.length >= 5 && vp8l.data[0] === 0x2f) {
    const bits = vp8l.data.readUInt32LE(1);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  const vp8 = chunks.find(c => c.fourcc === 'VP8 ');
  if (vp8 && vp8.data.length >= 10 && vp8.data[3] === 0x9d && vp8.data[4] === 0x01 && vp8.data[5] === 0x2a) {
    return {
      width: vp8.data.readUInt16LE(6) & 0x3fff,
      height: vp8.data.readUInt16LE(8) & 0x3fff,
    };
  }
  return { width: STICKER_SIDE_PX, height: STICKER_SIDE_PX };
}

export function injectWhatsAppExif(webpBuffer, meta, { forceAnimatedDurationMs = 0 } = {}) {
  const chunks = readWebpChunks(webpBuffer);
  const exifBytes = buildWhatsAppExif(meta);
  const { width, height } = inferImageDimensionsFromChunks(chunks);

  const hasAnimChunks = chunks.some(c => c.fourcc === 'ANIM') && chunks.some(c => c.fourcc === 'ANMF');
  const vp8xChunk = chunks.find(c => c.fourcc === 'VP8X');
  const hasAlpha = Boolean(
    (vp8xChunk && (vp8xChunk.data[0] & 0x10))
    || chunks.some(c => c.fourcc === 'ALPH' || c.fourcc === 'VP8L')
  );

  let outChunks;
  if (hasAnimChunks) {
    const xmpChunks = chunks.filter(c => c.fourcc === 'XMP ');
    const filtered = chunks.filter(c => c.fourcc !== 'EXIF' && c.fourcc !== 'VP8X' && c.fourcc !== 'XMP ');
    const vp8x = Buffer.alloc(10);
    const oldFlags = vp8xChunk ? vp8xChunk.data[0] : 0;
    vp8x[0] = oldFlags | 0x02 | 0x08 | (hasAlpha ? 0x10 : 0);
    writeUInt24LE(vp8x, 4, width - 1);
    writeUInt24LE(vp8x, 7, height - 1);
    outChunks = [
      makeWebpChunk('VP8X', vp8x),
      ...filtered.map(c => makeWebpChunk(c.fourcc, c.data)),
      makeWebpChunk('EXIF', exifBytes),
      ...xmpChunks.map(c => makeWebpChunk(c.fourcc, c.data)),
    ];
  } else {
    const frameChunks = chunks.filter(c => c.fourcc === 'ALPH' || c.fourcc === 'VP8 ' || c.fourcc === 'VP8L');
    if (!frameChunks.some(c => c.fourcc === 'VP8 ' || c.fourcc === 'VP8L')) {
      throw new Error('WebP contains no image bitstream (VP8/VP8L)');
    }
    const framePayload = Buffer.concat(frameChunks.map(c => makeWebpChunk(c.fourcc, c.data)));
    if (forceAnimatedDurationMs > 0) {
      const vp8x = Buffer.alloc(10);
      vp8x[0] = 0x02 | 0x08 | (hasAlpha ? 0x10 : 0);
      writeUInt24LE(vp8x, 4, width - 1);
      writeUInt24LE(vp8x, 7, height - 1);
      const anim = Buffer.alloc(6);
      const anmfHdr = Buffer.alloc(16);
      writeUInt24LE(anmfHdr, 0, 0);
      writeUInt24LE(anmfHdr, 3, 0);
      writeUInt24LE(anmfHdr, 6, width - 1);
      writeUInt24LE(anmfHdr, 9, height - 1);
      writeUInt24LE(anmfHdr, 12, Math.max(100, Math.min(0xffffff, Math.round(forceAnimatedDurationMs))));
      anmfHdr[15] = 0x02;
      outChunks = [
        makeWebpChunk('VP8X', vp8x),
        makeWebpChunk('ANIM', anim),
        makeWebpChunk('ANMF', Buffer.concat([anmfHdr, framePayload])),
        makeWebpChunk('EXIF', exifBytes),
      ];
    } else {
      const vp8x = Buffer.alloc(10);
      vp8x[0] = 0x08 | (hasAlpha ? 0x10 : 0);
      writeUInt24LE(vp8x, 4, width - 1);
      writeUInt24LE(vp8x, 7, height - 1);
      outChunks = [
        makeWebpChunk('VP8X', vp8x),
        framePayload,
        makeWebpChunk('EXIF', exifBytes),
      ];
    }
  }

  const body = Buffer.concat(outChunks);
  const riff = Buffer.alloc(12);
  riff.write('RIFF', 0, 4, 'ascii');
  riff.writeUInt32LE(4 + body.length, 4);
  riff.write('WEBP', 8, 4, 'ascii');
  return Buffer.concat([riff, body]);
}

export function parseWebpInfo(webpBuffer) {
  const chunks = readWebpChunks(webpBuffer);
  const { width, height } = inferImageDimensionsFromChunks(chunks);
  const vp8x = chunks.find(c => c.fourcc === 'VP8X');
  const isAnimated = chunks.some(c => c.fourcc === 'ANIM') && chunks.some(c => c.fourcc === 'ANMF');
  const hasAlpha = Boolean(
    (vp8x && (vp8x.data[0] & 0x10))
    || chunks.some(c => c.fourcc === 'ALPH' || c.fourcc === 'VP8L')
  );
  const hasExif = chunks.some(c => c.fourcc === 'EXIF');
  const exifMeta = extractWhatsAppExifMeta(webpBuffer);
  return {
    width,
    height,
    isAnimated,
    hasAlpha,
    hasExif,
    byteLength: webpBuffer.length,
    exifMeta,
  };
}
