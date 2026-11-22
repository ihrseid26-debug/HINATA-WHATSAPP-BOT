export class LocalProvider {
  constructor(config) {
    this.config = config;
  }

  isAvailable() {
    return this.config.localEnabled;
  }

  async generate() {
    throw new Error(
      'Local language model is not configured yet.'
    );
  }
}
