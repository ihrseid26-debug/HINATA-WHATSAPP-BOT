export class CloudProvider {
  constructor(config) {
    this.config = config;
  }

  isAvailable() {
    return Boolean(
      this.config.cloudApiUrl &&
      this.config.cloudApiKey
    );
  }

  async generate() {
    throw new Error(
      'Cloud provider is not connected. Configure and verify an API adapter first.'
    );
  }
}
