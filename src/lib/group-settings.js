import fs from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_PROTECTION = Object.freeze({
  antiLinks: false,
  antiContacts: false,
  antiNumbers: false,
  antiSpam: false,
  antiMentions: false,
  antiForwarded: false,
  antiMedia: false,
  antiBots: false,
  antiStickers: false
});

export function createGroupSettingsStore(databaseDir) {
  const filePath = path.join(databaseDir, 'group-settings.json');

  let cache = null;
  let writeQueue = Promise.resolve();

  async function load() {
    if (cache) return cache;

    await fs.mkdir(databaseDir, { recursive: true });

    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw);

      cache = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch (error) {
      if (error.code !== 'ENOENT') {
        const backup = `${filePath}.corrupt-${Date.now()}`;
        await fs.rename(filePath, backup).catch(() => {});
      }

      cache = {};
    }

    return cache;
  }

  async function persist() {
    const snapshot = JSON.stringify(cache, null, 2);

    writeQueue = writeQueue.then(async () => {
      const tempPath = `${filePath}.tmp`;
      await fs.writeFile(tempPath, snapshot, 'utf8');
      await fs.rename(tempPath, filePath);
    });

    return writeQueue;
  }

  function normalize(group) {
    const protection = {
      ...DEFAULT_PROTECTION,
      ...(group?.protection || {})
    };

    for (const key of Object.keys(DEFAULT_PROTECTION)) {
      protection[key] = protection[key] === true;
    }

    return {
      ...group,
      mode: group?.mode === 'admins' ? 'admins' : 'members',
      protection
    };
  }

  return {
    async get(groupJid) {
      const data = await load();
      return normalize(data[groupJid]);
    },

    async setMode(groupJid, mode) {
      if (!['admins', 'members'].includes(mode)) {
        throw new TypeError('Invalid group mode.');
      }

      const data = await load();

      data[groupJid] = {
        ...normalize(data[groupJid]),
        mode,
        updatedAt: new Date().toISOString()
      };

      await persist();
      return normalize(data[groupJid]);
    },

    async setProtection(groupJid, feature, enabled) {
      if (!Object.hasOwn(DEFAULT_PROTECTION, feature)) {
        throw new TypeError('Unknown protection feature.');
      }

      if (typeof enabled !== 'boolean') {
        throw new TypeError('Protection state must be boolean.');
      }

      const data = await load();
      const current = normalize(data[groupJid]);

      data[groupJid] = {
        ...current,
        protection: {
          ...current.protection,
          [feature]: enabled
        },
        updatedAt: new Date().toISOString()
      };

      await persist();
      return normalize(data[groupJid]);
    },

    async setMarasem(groupJid, marasem) {
      if (!marasem || typeof marasem !== 'object' || Array.isArray(marasem)) {
        throw new TypeError('Invalid marasem settings.');
      }
      const data = await load();
      const current = normalize(data[groupJid]);
      data[groupJid] = {
        ...current,
        marasem,
        updatedAt: new Date().toISOString()
      };
      await persist();
      return normalize(data[groupJid]);
    },

    async setSubbotControl(groupJid, control) {
      if (!control || typeof control !== 'object') {
        throw new TypeError('Invalid subbot control settings.');
      }
      const allowed = ['members', 'admins', 'private'];
      if (!allowed.includes(control.audience)) {
        throw new TypeError('Invalid subbot audience.');
      }
      const data = await load();
      const current = normalize(data[groupJid]);
      data[groupJid] = {
        ...current,
        subbotControl: {
          sleeping: control.sleeping === true,
          audience: control.audience
        },
        updatedAt: new Date().toISOString()
      };
      await persist();
      return normalize(data[groupJid]);
    },

    async toggleProtection(groupJid, feature) {
      if (!Object.hasOwn(DEFAULT_PROTECTION, feature)) {
        throw new TypeError('Unknown protection feature.');
      }

      const data = await load();
      const current = normalize(data[groupJid]);
      const enabled = !current.protection[feature];

      data[groupJid] = {
        ...current,
        protection: {
          ...current.protection,
          [feature]: enabled
        },
        updatedAt: new Date().toISOString()
      };

      await persist();
      return { enabled, settings: normalize(data[groupJid]) };
    }
  };
}
