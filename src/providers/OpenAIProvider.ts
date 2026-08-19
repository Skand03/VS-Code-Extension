import { AIProvider, AIRequest, AIResponse, ProviderConfig, filterChatModels } from './AIProvider';
import { InvalidAPIKeyError, ProviderError, NetworkError, RateLimitError, ProviderErrorCode, QuotaExceededError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * OpenAI Provider — uses the official OpenAI REST /v1/chat/completions endpoint.
 * Compatible with GPT-5.x, GPT-4.x, o-series reasoning models.
 *
 * Every user brings their own OpenAI API key (BYOK). Keys are prefixed `sk-proj-`
 * or `sk-` and are stored in the user's VS Code SecretStorage per-provider.
 *
 * Models verified as of August 2026. See: https://help.openai.com/en-us/articles/9624314-model-release-notes
 */

/**
 * Stable text-generation models (ordered: newest / most capable first).
 * Includes current GPT-5.x flagship, GPT-4.x, and o-series reasoning models.
 */
export const OPENAI_MODELS: ReadonlyArray<string> = [
    'gpt-4o-mini',         // RECOMMENDED: Cost-effective, fast, smart
    'gpt-4o',              // GPT-4 optimized: excellent balance
    'gpt-4.1',             // Specialized for coding (May 2025)
    'gpt-4.1-mini',        // Fast coding model (May 2025)
    'o4-mini',             // Fast reasoning: math/coding/visual
    'o3-mini',             // Cost-efficient reasoning (Jan 2025)
    'o3',                  // Powerful reasoning (retiring Aug 26, 2026)
    'gpt-3.5-turbo',       // Legacy: fast & cheap
];

export const OPENAI_DEFAULT_MODEL = 'gpt-4o-mini';

export class OpenAIProvider implements AIProvider {
    readonly name = 'openai';
    readonly displayName = 'OpenAI';
    readonly availableModels: string[] = [...OPENAI_MODELS];

    private readonly baseUrl = 'https://api.openai.com/v1';

    async generate(request: AIRequest, config: ProviderConfig): Promise<AIResponse> {
        const { apiKey, model = OPENAI_DEFAULT_MODEL } = config;

        logger.info(`OpenAI request started: model=${model}`);

        if (!this.validateApiKey(apiKey)) {
            throw new InvalidAPIKeyError(this.displayName);
        }

        const baseUrl = (config.baseUrl || this.baseUrl).replace(/\/$/, '');
        const url = `${baseUrl}/chat/completions`;

        const messages: Array<{ role: string; content: string }> = [];
        if (request.systemPrompt) {
            messages.push({ role: 'system', content: request.systemPrompt });
        }
        messages.push({ role: 'user', content: request.prompt });

        const body = {
            model,
            messages,
            temperature: request.temperature ?? 0.7,
            max_tokens: request.maxTokens ?? 2048,
        };

        try {
            logger.info(`[DIAGNOSTIC] OpenAI API Request`);
            logger.info(`[DIAGNOSTIC] Model: ${model}`);
            logger.info(`[DIAGNOSTIC] URL: ${url}`);
            logger.info(`[DIAGNOSTIC] Method: POST`);
            logger.info(`[DIAGNOSTIC] Has API key: ${!!apiKey}`);
            logger.info(`[DIAGNOSTIC] API key length: ${apiKey ? apiKey.length : 0}`);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify(body),
            });

            logger.info(`OpenAI HTTP status: ${response.status}`);
            logger.info(`[DIAGNOSTIC] HTTP Status: ${response.status}`);
            logger.info(`[DIAGNOSTIC] Status Text: ${response.statusText}`);

            if (!response.ok) {
                await this.handleErrorResponse(response, model);
            }

            const data = await response.json() as any;
            logger.info(`[DIAGNOSTIC] Response OK - reading JSON`);

            const content: string =
                data?.choices?.[0]?.message?.content ??
                data?.choices?.[0]?.delta?.content ??
                '';

            if (!content) {
                throw new ProviderError(this.displayName, 'Empty response received from OpenAI API.');
            }

            const tokensUsed = data?.usage?.total_tokens;

            return {
                content,
                model: data?.model || model,
                provider: this.name,
                tokensUsed: typeof tokensUsed === 'number' ? tokensUsed : undefined,
            };
        } catch (error) {
            if (error instanceof InvalidAPIKeyError ||
                error instanceof ProviderError ||
                error instanceof RateLimitError) {
                throw error;
            }

            const err = error as any;
            if (err?.code === 'ENOTFOUND' || err?.code === 'ECONNREFUSED' || err?.name === 'TypeError') {
                throw new NetworkError();
            }

            logger.error(`OpenAI API request failed`, error);
            throw new ProviderError(this.displayName, err?.message || 'Unknown error');
        }
    }

    validateApiKey(apiKey: string): boolean {
        if (!apiKey || !apiKey.trim()) return false;
        return true;
    }

    async testConnection(config: ProviderConfig): Promise<boolean> {
        const model = config.model || OPENAI_DEFAULT_MODEL;
        logger.info(`Starting OpenAI connection test`);
        logger.info(`Testing connection to OpenAI API with model: ${model}`);

        try {
            const result = await this.generate(
                { prompt: 'Reply with one word: OK', temperature: 0.1, maxTokens: 50 },
                { ...config, model }
            );
            const ok = typeof result.content === 'string' && result.content.trim().length > 0;
            if (ok) logger.info(`OpenAI connection test succeeded`);
            return ok;
        } catch (error) {
            logger.error(`OpenAI connection test failed`, error);
            // Re-throw the error so UI can display classified error message
            throw error;
        }
    }

    async discoverModels(config: ProviderConfig): Promise<string[]> {
        if (!this.validateApiKey(config.apiKey)) return [...OPENAI_MODELS];
        try {
            const baseUrl = (config.baseUrl || this.baseUrl).replace(/\/$/, '');
            const url = `${baseUrl}/models`;
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${config.apiKey}` }
            });
            if (response.ok) {
                const data = await response.json() as any;
                if (data && data.data && Array.isArray(data.data)) {
                    const models = data.data.map((m: any) => m.id);
                    // Filter out non-chat models (audio, embedding, etc.)
                    const chatModels = filterChatModels(models);
                    chatModels.sort((a: string, b: string) => b.localeCompare(a));
                    return chatModels.length > 0 ? chatModels : models;
                }
            }
        } catch (e) {
            logger.error('OpenAI model discovery failed', e);
        }
        return [...OPENAI_MODELS];
    }

    private async handleErrorResponse(response: Response, model: string): Promise<never> {
        const status = response.status;
        let errorMessage = 'API request failed';
        let errorCode = '';

        try {
            const d = await response.json() as any;
            errorMessage = d?.error?.message || d?.message || errorMessage;
            errorCode = d?.error?.code ? String(d.error.code) : '';
        } catch {
            errorMessage = response.statusText || errorMessage;
        }

        logger.error(
            `OpenAI API error | HTTP ${status}` +
            (errorCode ? ` | code: ${errorCode}` : '') +
            ` | model: ${model}` +
            ` | message: ${errorMessage}`
        );

        if (status === 401) {
            throw new InvalidAPIKeyError(this.displayName);
        }
        if (status === 403) {
            throw new ProviderError(this.displayName, errorMessage, ProviderErrorCode.PERMISSION_DENIED);
        }
        if (status === 404) {
            throw new ProviderError(this.displayName, errorMessage, ProviderErrorCode.MODEL_NOT_FOUND);
        }

        const lc = errorMessage.toLowerCase();
        if (status === 400 && (lc.includes('invalid') || lc.includes('incorrect') || lc.includes('api key'))) {
            throw new InvalidAPIKeyError(this.displayName);
        }

        if (status === 400 || status === 422) {
            throw new ProviderError(this.displayName, errorMessage, ProviderErrorCode.INVALID_REQUEST);
        }

        if (status === 429) {
            if (errorCode === 'insufficient_quota') {
                throw new QuotaExceededError(this.displayName);
            }
            throw new RateLimitError(this.displayName);
        }
        
        if (status === 402) {
            throw new ProviderError(this.displayName, errorMessage, ProviderErrorCode.INSUFFICIENT_BALANCE);
        }

        if (status >= 500) {
            throw new ProviderError(this.displayName, 'Service temporarily unavailable', ProviderErrorCode.SERVER_ERROR);
        }

        throw new ProviderError(this.displayName, errorMessage, ProviderErrorCode.UNKNOWN);
    }
}
