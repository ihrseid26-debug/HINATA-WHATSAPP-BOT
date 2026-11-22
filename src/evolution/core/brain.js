import { requireCapability } from '../safety/guard.js';
import { CloudProvider } from '../providers/cloud-provider.js';
import { LocalProvider } from '../providers/local-provider.js';
import { ProviderManager } from '../providers/provider-manager.js';
import { LearningEngine } from '../learning/learning-engine.js';
import { AutonomousDevelopmentEngine } from '../autonomy/autonomous-development.js';
import { PersonalityAdaptationEngine } from '../autonomy/personality-adaptation.js';

export class HinataBrain {
  constructor(config, {
    learningEngine,
    storageDir,
    providerManager
  } = {}) {
    this.config = config;

    if (providerManager) {
      this.providers = providerManager;
    } else {
      const cloud = new CloudProvider(config);
      const local = new LocalProvider(config);

      this.providers = new ProviderManager({
        cloud,
        local,
        mode: config.mode
      });
    }

    this.learning = learningEngine || new LearningEngine({
      storageDir
    });

    this.autonomy = new AutonomousDevelopmentEngine({
      storageDir
    });

    this.personality = new PersonalityAdaptationEngine({
      storageDir
    });

    this.initialization = null;
  }

  async initialize() {
    if (!this.initialization) {
      this.initialization = this.learning.initialize().catch(error => {
        this.initialization = null;
        throw error;
      });
    }

    await this.initialization;
    await this.autonomy.initialize();

    return {
      initialized: true,
      learning: true
    };
  }

  getStatus() {
    return {
      name: this.config.name,
      mode: this.config.mode,
      availableProviders: this.providers.getAvailableProviders(),
      learningInitialized: Boolean(this.initialization),
      autonomyEnabled: true
    };
  }

  async respond(input, context = [], options = {}) {
    requireCapability('conversation.respond');

    if (typeof input !== 'string' || !input.trim()) {
      throw new TypeError('Input must be a non-empty string');
    }

    if (
      options.personId !== undefined &&
      (typeof options.personId !== 'string' || !options.personId.trim())
    ) {
      throw new TypeError('personId must be a non-empty string');
    }

    await this.initialize();

    let personalMemory = [];
    let automaticMemory = [];
    let personalityProfile = null;

    if (options.personId) {
      const consent = await this.learning.consent.get(
        options.personId
      );

      if (consent.personal) {
        personalMemory = await this.learning.personal.read(
          options.personId
        );
      }

      await this.learning.automatic.learnFromMessage(
        options.personId,
        input.trim()
      );

      automaticMemory = await this.learning.automatic.read(
        options.personId
      );

      personalityProfile = await this.personality.adaptFromMessage(
        options.personId,
        input.trim()
      );
    }

    await this.autonomy.observeMessage(input.trim());
    await this.autonomy.runCycle();

    return this.providers.generate(
      input.trim(),
      context,
      {
        personalMemory,
        automaticMemory,
        personalityProfile,
        sharePersonalMemoryWithCloud:
          options.sharePersonalMemoryWithCloud === true
      }
    );
  }
}
