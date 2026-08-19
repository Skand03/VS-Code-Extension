/**
 * Request parameters for AI generation
 */
export interface AIRequest {
    prompt: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
}

/**
 * Response from AI provider
 */
export interface AIResponse {
    content: string;
    model: string;
    provider: string;
    tokensUsed?: number;
}

/**
 * Configuration for an AI provider
 */
export interface ProviderConfig {
    apiKey: string;
    model?: string;
    baseUrl?: string;
    [key: string]: any;
}

/**
 * Abstract interface for AI providers
 * Implement this interface to add new AI providers (OpenAI, Groq, etc.)
 */
export interface AIProvider {
    /**
     * Unique identifier for the provider
     */
    readonly name: string;

    /**
     * Display name for the provider
     */
    readonly displayName: string;

    /**
     * Available models for this provider
     */
    readonly availableModels: string[];

    /**
     * Generate AI response
     */
    generate(request: AIRequest, config: ProviderConfig): Promise<AIResponse>;

    /**
     * Validate API key format (basic validation)
     */
    validateApiKey(apiKey: string): boolean;

    /**
     * Test connection with the provider
     */
    testConnection(config: ProviderConfig): Promise<boolean>;

    /**
     * Fetch available models directly from the provider's API.
     * Some providers may not support this, in which case they return their hardcoded list.
     */
    discoverModels?(config: ProviderConfig): Promise<string[]>;
}

/**
 * Filter out models that are not designed for general text/chat completion.
 * Excludes audio, speech, image, embedding, and moderation models.
 */
export function filterChatModels(models: string[]): string[] {
    const excludedPatterns = [
        'whisper', 'transcribe', 'realtime', 'translate', 'tts', 
        'speech', 'audio', 'image', 'vision-only', 'embedding', 
        'moderation', 'guard', 'safeguard', 'orpheus', 'dall-e'
    ];
    
    return models.filter(model => {
        const lowerModel = model.toLowerCase();
        return !excludedPatterns.some(pattern => lowerModel.includes(pattern));
    });
}
