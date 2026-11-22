export class ProviderManager {
  constructor({ cloud, local, mode = 'hybrid' }) {
    this.cloud = cloud;
    this.local = local;
    this.mode = mode;
  }

  getAvailableProviders() {
    const available = [];

    if (this.cloud.isAvailable()) {
      available.push('cloud');
    }

    if (this.local.isAvailable()) {
      available.push('local');
    }

    return available;
  }

  getPreferredProviders() {
    if (this.mode === 'cloud') return ['cloud'];
    if (this.mode === 'local') return ['local'];

    return ['cloud', 'local'];
  }

  async generate(input, context = [], {
    personalMemory = [],
    automaticMemory = [],
    sharePersonalMemoryWithCloud = false
  } = {}) {
    const baseContext = Array.isArray(context)
      ? [...context]
      : [context];

    for (const name of this.getPreferredProviders()) {
      const provider = name === 'cloud'
        ? this.cloud
        : this.local;

      if (!provider.isAvailable()) continue;

      const providerContext = [...baseContext];

      if (
        name === 'local' &&
        automaticMemory.length > 0
      ) {
        providerContext.push({
          type: 'automatic_personal_memory',
          entries: automaticMemory.map(entry => ({ ...entry }))
        });
      }

      const canReceiveManualMemory =
        name === 'local' ||
        sharePersonalMemoryWithCloud === true;

      if (
        canReceiveManualMemory &&
        personalMemory.length > 0
      ) {
        providerContext.push({
          type: 'personal_memory',
          entries: personalMemory.map(entry => ({ ...entry }))
        });
      }

      try {
        return {
          provider: name,
          result: await provider.generate(
            input,
            providerContext
          )
        };
      } catch (error) {
        if (this.mode !== 'hybrid') throw error;
      }
    }

    return {
      provider: null,
      result: null,
      status: 'not_configured'
    };
  }
}
