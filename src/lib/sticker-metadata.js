import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const webpmux = require('node-webpmux');

const DEFAULT_PACK_ID = 'com.hinata.stickers';

export async function addHinataStickerMetadata(buffer, options = {}) {
  const input = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  if (
    input.length < 20 ||
    input.toString('ascii', 0, 4) !== 'RIFF' ||
    input.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    throw new Error('HINATA_STICKER_METADATA_REQUIRES_WEBP');
  }

  const metadata = {
    'sticker-pack-id': options.packId || DEFAULT_PACK_ID,
    'sticker-pack-name': options.packName || '❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 𝑺𝑻𝑰𝑪𝑲𝑬𝑹𝑺',
    'sticker-pack-publisher': options.publisher || '🍁 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 𝑩𝑶𝑻 🍁',
    emojis: Array.isArray(options.emojis) ? options.emojis : ['🌸']
  };

  const exifBytes = Buffer.from(JSON.stringify(metadata), 'utf8');

  // TIFF/EXIF header المستخدم في صيغة ملصقات WhatsApp.
  const exifHeader = Buffer.from([
    0x49, 0x49, 0x2a, 0x00,
    0x08, 0x00, 0x00, 0x00,
    0x01, 0x00,
    0x41, 0x57, 0x07, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x16, 0x00, 0x00, 0x00
  ]);

  exifHeader.writeUInt32LE(exifBytes.length, 14);

  const image = new webpmux.Image();
  await image.load(input);
  image.exif = Buffer.concat([exifHeader, exifBytes]);

  const result = await image.save(null);

  if (!Buffer.isBuffer(result)) {
    throw new Error('HINATA_STICKER_METADATA_SAVE_FAILED');
  }

  return result;
}
