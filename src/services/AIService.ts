import * as vscode from 'vscode';
import { AIProvider, AIRequest, AIResponse, ProviderConfig } from '../providers/AIProvider';
import { GroqProvider } from '../providers/GroqProvider';
import { GeminiProvider } from '../providers/GeminiProvider';
import { OpenAIProvider } from '../providers/OpenAIProvider';
import { DeepSeekProvider } from '../providers/DeepSeekProvider';
import { PerplexityProvider } from '../providers/PerplexityProvider';
import { LocalhostProvider } from '../providers/LocalhostProvider';
import { CerebrasProvider } from '../providers/CerebrasProvider';
import { OpenRouterProvider } from '../providers/OpenRouterProvider';
import { MissingAPIKeyError, ProviderError } from '../utils/errors';
import { logger } from '../utils/logger';
import { SettingsService } from './SettingsService';

/**
 * AI Service — V2: Multi-provider support
 * Supports 5 providers: Groq, Gemini, OpenAI, DeepSeek, Perplexity, Localhost
 * 
 * Each provider maintains independent:
 * - API key storage (VS Code SecretStorage per provider)
 * - Model selection
 * - Configuration
 */
export class AIService {
    private providers: Map<string, AIProvider> = new Map();
    private settingsService: SettingsService;

    constructor(context: vscode.ExtensionContext) {
        this.settingsService = new SettingsService(context);
        this.registerProviders();
    }

    /** Register all supported providers for V2 */
    private registerProviders(): void {
        const providers: AIProvider[] = [
            new GroqProvider(),
            new GeminiProvider(),
            new OpenAIProvider(),
            new DeepSeekProvider(),
            new PerplexityProvider(),
            new LocalhostProvider(),
            new CerebrasProvider(),
            new OpenRouterProvider()
        ];
        
        providers.forEach(p => {
            this.providers.set(p.name, p);
            logger.info(`[AIService] Registered provider: ${p.displayName}`);
        });
    }

    /**
     * Generate AI response using the user's selected provider.
     */
    async generate(request: AIRequest): Promise<AIResponse> {
        const settings = await this.settingsService.getSettings();

        // Use provider from settings (NO hardcoding)
        const provider = this.providers.get(settings.provider);
        
        if (!provider) {
            const available = Array.from(this.providers.keys()).join(', ');
            throw new ProviderError(
                'Unknown Provider',
                `Provider '${settings.provider}' not found. Available providers: ${available}`
            );
        }

        // Localhost/Ollama does not require an API key
        if (!settings.apiKey && provider.name !== 'localhost') {
            throw new MissingAPIKeyError(provider.displayName);
        }

        const model = settings.model || provider.availableModels[0];
        if (!model) {
            throw new ProviderError(provider.displayName, 'No model available.');
        }

        const config: ProviderConfig = { apiKey: settings.apiKey, model };

        logger.info(`Generating response via ${provider.displayName} | model=${model}`);

        try {
            const response = await provider.generate(request, config);
            logger.info(`Response received (${response.tokensUsed ?? 'unknown'} tokens)`);
            return response;
        } catch (error) {
            logger.error(`Generation failed from ${provider.displayName}`, error);
            throw error;
        }
    }

    /** Get the currently selected provider */
    async getCurrentProvider(): Promise<AIProvider | undefined> {
        const settings = await this.settingsService.getSettings();
        return this.providers.get(settings.provider);
    }

    /** Returns list of all registered providers. */
    getAllProviders(): AIProvider[] {
        return Array.from(this.providers.values());
    }

    getProvider(name: string): AIProvider | undefined {
        return this.providers.get(name);
    }

    /**
     * Test connection to the currently selected provider.
     */
    async testConnection(): Promise<boolean> {
        logger.info('[DIAGNOSTIC] ===== TEST CONNECTION START =====');

        const settings = await this.settingsService.getSettings();
        
        logger.info(`[DIAGNOSTIC] Provider: ${settings.provider}`);
        logger.info(`[DIAGNOSTIC] Model: ${settings.model || '(default)'}`);
        logger.info(`[DIAGNOSTIC] Has API key: ${settings.apiKey ? 'YES' : 'NO'}`);

        const provider = this.providers.get(settings.provider);
        
        if (!provider) {
            logger.error(`[DIAGNOSTIC] Provider '${settings.provider}' not found`);
            return false;
        }

        // Localhost/Ollama does not require an API key
        if (!settings.apiKey && provider.name !== 'localhost') {
            logger.error('[DIAGNOSTIC] No API key configured');
            return false;
        }

        const model = settings.model || provider.availableModels[0] || '';

        logger.info(`[DIAGNOSTIC] Testing: ${provider.displayName} with model ${model}`);

        const config: ProviderConfig = { apiKey: settings.apiKey, model };

        try {
            const result = await provider.testConnection(config);
            logger.info(`[DIAGNOSTIC] Test result: ${result ? 'SUCCESS' : 'FAILED'}`);
            logger.info('[DIAGNOSTIC] ===== TEST CONNECTION END =====');
            return result;
        } catch (error) {
            logger.error('[DIAGNOSTIC] Connection test threw exception', error);
            logger.info('[DIAGNOSTIC] ===== TEST CONNECTION END =====');
            return false;
        }
    }

    async getAvailableModels(): Promise<string[]> {
        const settings = await this.settingsService.getSettings();
        const provider = this.providers.get(settings.provider);
        return provider?.availableModels || [];
    }

    /** Discovers live models from the provider's API */
    async discoverModels(providerName: string): Promise<string[]> {
        const provider = this.providers.get(providerName);
        if (!provider) return [];
        
        // Get API key (optional for localhost/Ollama)
        const apiKey = await this.settingsService.getApiKey(providerName);
        
        if (provider.discoverModels) {
            return await provider.discoverModels({ apiKey });
        }
        
        return provider.availableModels || [];
    }

    getSettingsService(): SettingsService {
        return this.settingsService;
    }
}
