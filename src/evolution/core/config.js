const allowedModes = new Set(['hybrid', 'cloud', 'local']);

export function loadConfig(env = process.env) {
  const mode = String(env.HINATA_MODE || 'hybrid').toLowerCase();

  if (!allowedModes.has(mode)) {
    throw new Error('Invalid HINATA_MODE');
  }

  return Object.freeze({
    name: String(env.HINATA_NAME || 'HINATA'),
    mode,
    cloudApiUrl: String(env.HINATA_CLOUD_API_URL || ''),
    cloudApiKey: String(env.HINATA_CLOUD_API_KEY || ''),
    localEnabled: env.HINATA_LOCAL_ENABLED !== 'false'
  });
}
