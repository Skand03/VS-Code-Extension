import { AIProvider, AIRequest, AIResponse, ProviderConfig } from './AIProvider';
import { ProviderError, NetworkError, RateLimitError, ProviderErrorCode } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * Localhost Provider — for self-hosted / locally-run LLMs.
 * 
 * Supports two backends:
 *   • Ollama           (port 11434) -> http://localhost:11434 (native Ollama API)
 *   • LM Studio        (port 1234)  -> http://localhost:1234/v1 (OpenAI-compatible)
 * 
 * The provider automatically detects which backend is running and uses the appropriate API format.
 * 
 * Ollama:
 *   - Uses native Ollama API endpoints (/api/version, /api/tags, /api/chat, /api/generate)
 *   - Dynamic model discovery via GET /api/tags
 *   - No API key required
 * 
 * LM Studio:
 *   - Uses OpenAI-compatible /v1/chat/completions endpoint
 *   - API key optional (some servers may require Bearer token)
 * 
 * Model discovery is dynamic - no hardcoded model list. Models are discovered from the running server.
 */

export const OLLAMA_BASE_URL = 'http://localhost:11434';
export const LM_STUDIO_BASE_URL = 'http://localhost:1234/v1';

export class LocalhostProvider implements AIProvider {
    readonly name = 'localhost';
    readonly displayName = 'Localhost';
    readonly availableModels: string[] = []; // Populated dynamically via discoverModels()

    private detectedBackend: 'ollama' | 'lmstudio' | null = null;

    /**
     * Detect which local backend is running (Ollama or LM Studio)
     */
    private async detectBackend(): Promise<'ollama' | 'lmstudio' | null> {
        // Try Ollama first
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch(`${OLLAMA_BASE_URL}/api/version`, {
                method: 'GET',
                signal: controller.signal
            });
            clearTimeout(timeout);
            
            if (response.ok) {
                const data = await response.json() as any;
                logger.info(`Ollama detected: version ${data.version || 'unknown'}`);
                return 'ollama';
            }
        } catch (error) {
            // Ollama not available, try LM Studio next
        }

        // Try LM Studio
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch(`${LM_STUDIO_BASE_URL}/models`, {
                method: 'GET',
                signal: controller.signal
            });
            clearTimeout(timeout);
            
            if (response.ok) {
                logger.info('LM Studio detected');
                return 'lmstudio';
            }
        } catch (error) {
            // LM Studio not available
        }

        return null;
    }

    /**
     * Discover available models from the local backend
     */
    async discoverModels(config: ProviderConfig): Promise<string[]> {
        logger.info('Starting Localhost model discovery...');
        
        const backend = await this.detectBackend();
        
        if (backend === 'ollama') {
            return await this.discoverOllamaModels();
        } else if (backend === 'lmstudio') {
            return await this.discoverLMStudioModels(config.apiKey);
        } else {
            logger.warn('No local backend detected (tried Ollama and LM Studio)');
            return [];
        }
    }

    /**
     * Discover models from Ollama
     */
    private async discoverOllamaModels(): Promise<string[]> {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
                method: 'GET',
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (!response.ok) {
                logger.error(`Ollama /api/tags returned ${response.status}`);
                return [];
            }

            const data = await response.json() as any;
            
            if (data && data.models && Array.isArray(data.models)) {
                const models = data.models.map((m: any) => m.name || m.model).filter(Boolean);
                logger.info(`Discovered ${models.length} Ollama model(s): ${models.join(', ')}`);
                return models;
            }

            logger.warn('Ollama /api/tags returned unexpected format');
            return [];
        } catch (error) {
            logger.error('Failed to discover Ollama models', error);
            return [];
        }
    }

    /**
     * Discover models from LM Studio
     */
    private async discoverLMStudioModels(apiKey?: string): Promise<string[]> {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            
            const headers: Record<string, string> = {};
            if (apiKey && apiKey.trim().length > 0) {
                headers['Authorization'] = `Bearer ${apiKey.trim()}`;
            }

            const response = await fetch(`${LM_STUDIO_BASE_URL}/models`, {
                method: 'GET',
                headers,
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (!response.ok) {
                logger.error(`LM Studio /models returned ${response.status}`);
                return [];
            }

            const data = await response.json() as any;
            
            if (data && data.data && Array.isArray(data.data)) {
                const models = data.data.map((m: any) => m.id).filter(Boolean);
                logger.info(`Discovered ${models.length} LM Studio model(s): ${models.join(', ')}`);
                return models;
            }

            logger.warn('LM Studio /models returned unexpected format');
            return [];
        } catch (error) {
            logger.error('Failed to discover LM Studio models', error);
            return [];
        }
    }

    async generate(request: AIRequest, config: ProviderConfig): Promise<AIResponse> {
        if (!config.model) {
            throw new ProviderError(this.displayName, 'No model specified. Please select a model and save settings.');
        }

        const model = config.model;
        const backend = await this.detectBackend();

        if (!backend) {
            throw new NetworkError('No local backend detected. Please start Ollama (localhost:11434) or LM Studio (localhost:1234).');
        }

        this.detectedBackend = backend;

        if (backend === 'ollama') {
            return await this.generateWithOllama(request, config, model);
        } else {
            return await this.generateWithLMStudio(request, config, model);
        }
    }

    /**
     * Generate response using Ollama's native API
     */
    private async generateWithOllama(request: AIRequest, config: ProviderConfig, model: string): Promise<AIResponse> {
        const url = `${OLLAMA_BASE_URL}/api/chat`;

        logger.info(`Ollama request started: model=${model}`);
        logger.info(`Ollama endpoint: ${url}`);

        const messages: Array<{ role: string; content: string }> = [];
        if (request.systemPrompt) {
            messages.push({ role: 'system', content: request.systemPrompt });
        }
        messages.push({ role: 'user', content: request.prompt });

        const body = {
            model,
            messages,
            stream: false,
            options: {
                temperature: request.temperature ?? 0.7,
                num_predict: request.maxTokens ?? 2048,
            }
        };

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 120000); // 120 second timeout for inference

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal
            });
            clearTimeout(timeout);

            logger.info(`Ollama HTTP status: ${response.status}`);

            if (!response.ok) {
                await this.handleOllamaErrorResponse(response, model);
            }

            const data = await response.json() as any;

            const content: string = data?.message?.content || '';

            if (!content) {
                throw new ProviderError(this.displayName, 'Empty response received from Ollama.');
            }

            return {
                content,
                model: data?.model || model,
                provider: this.name,
                tokensUsed: data?.eval_count || undefined,
            };
        } catch (error) {
            if (error instanceof ProviderError || error instanceof RateLimitError) {
                throw error;
            }

            const err = error as any;
            if (err?.name === 'AbortError') {
                throw new ProviderError(this.displayName, 'Request timeout. The model may be loading or the prompt may be too complex.');
            }
            if (err?.code === 'ENOTFOUND' || err?.code === 'ECONNREFUSED') {
                throw new NetworkError('Unable to connect to Ollama. Please ensure Ollama is running at http://localhost:11434');
            }

            logger.error(`Ollama API request failed`, error);
            throw new ProviderError(this.displayName, err?.message || 'Unknown error');
        }
    }

    /**
     * Generate response using LM Studio's OpenAI-compatible API
     */
    private async generateWithLMStudio(request: AIRequest, config: ProviderConfig, model: string): Promise<AIResponse> {
        const baseUrl = config.baseUrl || LM_STUDIO_BASE_URL;
        const url = `${baseUrl}/chat/completions`;
        const apiKey = config.apiKey || '';

        logger.info(`LM Studio request started: model=${model}`);
        logger.info(`LM Studio endpoint: ${url}`);

        const messages: Array<{ role: string; content: string }> = [];
        if (request.systemPrompt) {
            messages.push({ role: 'system', content: request.systemPrompt });
        }
        messages.push({ role: 'user', content: request.prompt });

        const body: any = {
            model,
            messages,
            temperature: request.temperature ?? 0.7,
            max_tokens: request.maxTokens ?? 2048,
        };

        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };
            if (apiKey && apiKey.trim().length > 0) {
                headers['Authorization'] = `Bearer ${apiKey.trim()}`;
            }

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 120000); // 120 second timeout

            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal: controller.signal
            });
            clearTimeout(timeout);

            logger.info(`LM Studio HTTP status: ${response.status}`);

            if (!response.ok) {
                await this.handleLMStudioErrorResponse(response, model);
            }

            const data = await response.json() as any;

            const content: string =
                data?.choices?.[0]?.message?.content ??
                data?.choices?.[0]?.delta?.content ??
                '';

            if (!content) {
                throw new ProviderError(this.displayName, 'Empty response received from LM Studio.');
            }

            const tokensUsed = data?.usage?.total_tokens;

            return {
                content,
                model: data?.model || model,
                provider: this.name,
                tokensUsed: typeof tokensUsed === 'number' ? tokensUsed : undefined,
            };
        } catch (error) {
            if (error instanceof ProviderError || error instanceof RateLimitError) {
                throw error;
            }

            const err = error as any;
            if (err?.name === 'AbortError') {
                throw new ProviderError(this.displayName, 'Request timeout. The model may be loading or the prompt may be too complex.');
            }
            if (err?.code === 'ENOTFOUND' || err?.code === 'ECONNREFUSED') {
                throw new NetworkError('Unable to connect to LM Studio. Please ensure LM Studio is running at http://localhost:1234');
            }

            logger.error(`LM Studio API request failed`, error);
            throw new ProviderError(this.displayName, err?.message || 'Unknown error');
        }
    }

    validateApiKey(apiKey: string): boolean {
        // API key is optional for Ollama and most local servers
        return true;
    }

    async testConnection(config: ProviderConfig): Promise<boolean> {
        if (!config.model) {
            throw new ProviderError(this.displayName, 'No model selected. Please select a model from the discovered list.');
        }

        const model = config.model;
        logger.info(`Starting Localhost connection test with model: ${model}`);

        const backend = await this.detectBackend();

        if (!backend) {
            throw new NetworkError('No local backend detected. Please start Ollama (localhost:11434) or LM Studio (localhost:1234).');
        }

        if (backend === 'ollama') {
            return await this.testOllamaConnection(model);
        } else {
            return await this.testLMStudioConnection(config, model);
        }
    }

    /**
     * Test Ollama connection with a small generation request
     */
    private async testOllamaConnection(model: string): Promise<boolean> {
        try {
            const url = `${OLLAMA_BASE_URL}/api/generate`;
            
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout for test

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model,
                    prompt: 'Reply with OK',
                    stream: false
                }),
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (!response.ok) {
                const errorText = await response.text();
                
                if (response.status === 404) {
                    throw new ProviderError(
                        this.displayName, 
                        `Model "${model}" is not installed in Ollama. Run: ollama pull ${model}`,
                        ProviderErrorCode.MODEL_NOT_FOUND
                    );
                }
                
                throw new ProviderError(this.displayName, `Ollama test failed: ${errorText}`);
            }

            const data = await response.json() as any;
            const ok = typeof data.response === 'string' && data.response.length > 0;
            
            if (ok) {
                logger.info(`Ollama connection test succeeded with model: ${model}`);
            }
            
            return ok;
        } catch (error) {
            if (error instanceof ProviderError) {
                throw error;
            }
            
            const err = error as any;
            if (err?.name === 'AbortError') {
                throw new ProviderError(this.displayName, 'Connection test timeout. Ollama may be loading the model.');
            }
            if (err?.code === 'ECONNREFUSED') {
                throw new NetworkError('Ollama is not running. Please start Ollama and try again.');
            }
            
            logger.error(`Ollama connection test failed`, error);
            throw error;
        }
    }

    /**
     * Test LM Studio connection
     */
    private async testLMStudioConnection(config: ProviderConfig, model: string): Promise<boolean> {
        try {
            const result = await this.generateWithLMStudio(
                { prompt: 'Reply with one word: OK', temperature: 0.1, maxTokens: 50 },
                config,
                model
            );
            const ok = typeof result.content === 'string' && result.content.trim().length > 0;
            if (ok) {
                logger.info(`LM Studio connection test succeeded with model: ${model}`);
            }
            return ok;
        } catch (error) {
            logger.error(`LM Studio connection test failed`, error);
            throw error;
        }
    }

    private async handleOllamaErrorResponse(response: Response, model: string): Promise<never> {
        const status = response.status;
        let errorMessage = 'Ollama request failed';

        try {
            const text = await response.text();
            const data = JSON.parse(text);
            errorMessage = data?.error || text || errorMessage;
        } catch {
            errorMessage = response.statusText || errorMessage;
        }

        logger.error(`Ollama API error | HTTP ${status} | model: ${model} | message: ${errorMessage}`);

        if (status === 404) {
            throw new ProviderError(
                this.displayName, 
                `Model "${model}" not found in Ollama. Run: ollama pull ${model}`,
                ProviderErrorCode.MODEL_NOT_FOUND
            );
        }

        if (status >= 500) {
            throw new ProviderError(this.displayName, 'Ollama server error', ProviderErrorCode.SERVER_ERROR);
        }

        throw new ProviderError(this.displayName, errorMessage, ProviderErrorCode.UNKNOWN);
    }

    private async handleLMStudioErrorResponse(response: Response, model: string): Promise<never> {
        const status = response.status;
        let errorMessage = 'LM Studio request failed';
        let errorCode = '';

        try {
            const d = await response.json() as any;
            errorMessage = d?.error?.message || d?.message || errorMessage;
            errorCode = d?.error?.code ? String(d.error.code) : '';
        } catch {
            errorMessage = response.statusText || errorMessage;
        }

        logger.error(
            `LM Studio API error | HTTP ${status}` +
            (errorCode ? ` | code: ${errorCode}` : '') +
            ` | model: ${model}` +
            ` | message: ${errorMessage}`
        );

        if (status === 401 || status === 403) {
            throw new ProviderError(this.displayName, errorMessage, ProviderErrorCode.PERMISSION_DENIED);
        }
        if (status === 404) {
            throw new ProviderError(this.displayName, `Model "${model}" not found`, ProviderErrorCode.MODEL_NOT_FOUND);
        }

        if (status === 400 || status === 422) {
            throw new ProviderError(this.displayName, errorMessage, ProviderErrorCode.INVALID_REQUEST);
        }

        if (status === 429) {
            throw new RateLimitError(this.displayName);
        }

        if (status >= 500) {
            throw new ProviderError(this.displayName, 'LM Studio server error', ProviderErrorCode.SERVER_ERROR);
        }

        throw new ProviderError(this.displayName, errorMessage, ProviderErrorCode.UNKNOWN);
    }
}
