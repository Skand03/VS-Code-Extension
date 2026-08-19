import * as vscode from 'vscode';
import { logger } from '../utils/logger';

/**
 * Settings structure for AI Assistant
 */
export interface AIAssistantSettings {
    provider: string;
    model: string;
    apiKey: string;
}

/**
 * Service for managing extension settings and secure API key storage
 * Uses VS Code SecretStorage for API keys and workspace configuration for other settings
 */
export class SettingsService {
    private context: vscode.ExtensionContext;
    private readonly CONFIG_SECTION = 'aiAssistant';
    private readonly SECRET_KEY_PREFIX = 'aiAssistant.apiKey';

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Get all settings including securely stored API key.
     * If no model is configured, returns an empty string (not a provider-specific default).
     * The caller (AIService or Settings UI) should resolve the provider's default model if needed.
     */
    async getSettings(): Promise<AIAssistantSettings> {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
        
        const provider = config.get<string>('provider', 'groq');
        const model = this.getModel(provider);
        
        // Retrieve API key securely from SecretStorage
        const apiKey = await this.getApiKey(provider);

        return {
            provider,
            model,
            apiKey
        };
    }

    /**
     * Update provider setting
     */
    async setProvider(provider: string): Promise<void> {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
        await config.update('provider', provider, vscode.ConfigurationTarget.Global);
        logger.info(`Provider updated to: ${provider}`);
    }

    /**
     * Update model setting for a specific provider
     */
    async setModel(provider: string, model: string): Promise<void> {
        await this.context.globalState.update(`${this.CONFIG_SECTION}.model.${provider}`, model);
        logger.info(`Model updated to: ${model} for provider: ${provider}`);
    }

    /**
     * Get API key from secure storage
     */
    async getApiKey(provider: string): Promise<string> {
        const secretKey = `${this.SECRET_KEY_PREFIX}.${provider}`;
        const apiKey = await this.context.secrets.get(secretKey);
        
        // DIAGNOSTIC: Log retrieval status (NEVER log the actual key)
        logger.info(`[DIAGNOSTIC] Getting API key for provider: ${provider}`);
        logger.info(`[DIAGNOSTIC] Secret key name: ${secretKey}`);
        logger.info(`[DIAGNOSTIC] API key retrieved: ${apiKey ? 'YES' : 'NO'}`);
        logger.info(`[DIAGNOSTIC] API key length: ${apiKey ? apiKey.length : 0}`);
        
        return apiKey || '';
    }

    /**
     * Store API key securely in SecretStorage.
     * SECURITY: The apiKey parameter is NEVER logged. Only provider name is logged.
     */
    async setApiKey(provider: string, apiKey: string): Promise<void> {
        const secretKey = `${this.SECRET_KEY_PREFIX}.${provider}`;
        
        // DIAGNOSTIC: Log storage operation (NEVER log the actual key)
        logger.info(`[DIAGNOSTIC] Storing API key for provider: ${provider}`);
        logger.info(`[DIAGNOSTIC] Secret key name: ${secretKey}`);
        logger.info(`[DIAGNOSTIC] API key provided: ${apiKey && apiKey.trim().length > 0 ? 'YES' : 'NO'}`);
        logger.info(`[DIAGNOSTIC] API key length: ${apiKey ? apiKey.trim().length : 0}`);
        
        if (apiKey && apiKey.trim().length > 0) {
            await this.context.secrets.store(secretKey, apiKey.trim());
            logger.info(`[DIAGNOSTIC] API key stored successfully for provider: ${provider}`);
        } else {
            // Empty string → treat as deletion
            await this.context.secrets.delete(secretKey);
            logger.info(`[DIAGNOSTIC] API key removed for provider: ${provider}`);
        }
    }

    /**
     * Delete API key from secure storage
     */
    async deleteApiKey(provider: string): Promise<void> {
        const secretKey = `${this.SECRET_KEY_PREFIX}.${provider}`;
        await this.context.secrets.delete(secretKey);
        logger.info(`API key deleted for provider: ${provider}`);
    }

    /**
     * Check if API key exists for a provider
     */
    async hasApiKey(provider: string): Promise<boolean> {
        const apiKey = await this.getApiKey(provider);
        return apiKey.length > 0;
    }

    /**
     * Get current provider
     */
    getProvider(): string {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
        return config.get<string>('provider', 'gemini');
    }

    /**
     * Get current model for a specific provider.
     * Returns empty string if not configured (caller should use provider's default).
     */
    getModel(provider: string): string {
        return this.context.globalState.get<string>(`${this.CONFIG_SECTION}.model.${provider}`, '');
    }

    /**
     * Save all settings at once
     */
    async saveSettings(settings: Partial<AIAssistantSettings>): Promise<void> {
        if (settings.provider !== undefined) {
            await this.setProvider(settings.provider);
        }

        if (settings.model !== undefined && settings.provider !== undefined) {
            await this.setModel(settings.provider, settings.model);
        }

        if (settings.apiKey !== undefined && settings.provider) {
            await this.setApiKey(settings.provider, settings.apiKey);
        }

        logger.info('Settings saved successfully');
    }

    /**
     * Reset all settings to defaults
     */
    async resetSettings(): Promise<void> {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
        await config.update('provider', undefined, vscode.ConfigurationTarget.Global);
        await config.update('model', undefined, vscode.ConfigurationTarget.Global);
        
        // Delete all stored API keys for V2 providers (6 providers, NO Siddhi)
        const providers = ['groq', 'gemini', 'openai', 'deepseek', 'together', 'localhost'];
        for (const provider of providers) {
            await this.deleteApiKey(provider);
        }

        logger.info('All settings reset to defaults');
    }

    /**
     * Returns a loggable summary of current settings.
     * SECURITY: Never includes the API key value — only a boolean presence flag.
     */
    async getSettingsSummary(): Promise<string> {
        const provider = this.getProvider();
        const model = this.getModel(provider);
        const hasKey = await this.hasApiKey(provider);
        return `Provider: ${provider}, Model: ${model}, API Key: ${hasKey ? 'configured' : 'not configured'}`;
    }
}
