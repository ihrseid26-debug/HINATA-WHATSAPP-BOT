import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function envBoolean(value, fallback) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

export const config = Object.freeze({
  rootDir: ROOT_DIR,
  prefix: process.env.HINATA_PREFIX || '.',
  logLevel: process.env.HINATA_LOG_LEVEL || 'info',
  sessionDir: path.resolve(ROOT_DIR, process.env.HINATA_SESSION_DIR || './sessions/main'),
  subbotSessionsDir: path.resolve(ROOT_DIR, process.env.HINATA_SUBBOT_SESSIONS_DIR || './sessions/subbots'),
  databaseDir: path.resolve(ROOT_DIR, process.env.HINATA_DATABASE_DIR || './database'),
  groupsOnly: envBoolean(process.env.HINATA_GROUPS_ONLY, true),
  phoneNumber: String(process.env.HINATA_PHONE_NUMBER || '').replace(/\D/g, ''),
  mainOwnerNumber: String(process.env.HINATA_MAIN_OWNER || '380911818719').replace(/\D/g, ''),
  mainOwnerJid: `${String(process.env.HINATA_MAIN_OWNER || '380911818719').replace(/\D/g, '')}@s.whatsapp.net`
});

if (config.prefix.length !== 1) {
  throw new Error('HINATA_PREFIX must be exactly one character.');
}
