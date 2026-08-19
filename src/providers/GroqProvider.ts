import { AIProvider, AIRequest, AIResponse, ProviderConfig, filterChatModels } from './AIProvider';
import { InvalidAPIKeyError, ProviderError, NetworkError, RateLimitError, ProviderErrorCode } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * Groq Provider — uses the Groq Cloud OpenAI-compatible /v1/chat/completions endpoint.
 * https://api.groq.com/openai/v1/chat/completions
 *
 * Every user brings their own Groq API key (BYOK). Keys are typically prefixed `gsk_`.
 *
 * IMPORTANT: As of June 17, 2026, Groq deprecated llama-3.1-8b-instant and llama-3.3-70b-versatile.
 * Production traffic now routes to openai/gpt-oss-120b and openai/gpt-oss-20b.
 * See: https://console.groq.com/docs/models
 */

/**
 * Current Groq production models (August 2026).
 * Ordered: best value/performance first.
 */
export const GROQ_MODELS: ReadonlyArray<string> = [
    'openai/gpt-oss-20b',            // FASTEST: 1000 T/sec, best value
    'openai/gpt-oss-120b',           // SMARTEST: 500 T/sec, most capable
    'qwen/qwen3.6-27b',              // Preview: 500 T/sec, multilingual
];

export const GROQ_DEFAULT_MODEL = 'openai/gpt-oss-20b';

export class GroqProvider implements AIProvider {
    readonly name = 'groq';
    readonly displayName = 'Groq';
    readonly availableModels: string[] = [...GROQ_MODELS];

    private readonly baseUrl = 'https://api.groq.com/openai/v1';

    async generate(request: AIRequest, config: ProviderConfig): Promise<AIResponse> {
        const { apiKey, model = GROQ_DEFAULT_MODEL } = config;

        logger.info(`Groq request started: model=${model}`);

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
            logger.info(`[DIAGNOSTIC] Groq API Request`);
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

            logger.info(`Groq HTTP status: ${response.status}`);
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
                throw new ProviderError(this.displayName, 'Empty response received from Groq API.');
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

            logger.error(`Groq API request failed`, error);
            throw new ProviderError(this.displayName, err?.message || 'Unknown error');
        }
    }

    validateApiKey(apiKey: string): boolean {
        if (!apiKey || !apiKey.trim()) return false;
        const trimmed = apiKey.trim();
        // Groq keys are typically prefixed gsk_ (Groq API key), length 40+
        return trimmed.length >= 20;
    }

    async testConnection(config: ProviderConfig): Promise<boolean> {
        const model = config.model || GROQ_DEFAULT_MODEL;
        logger.info(`Starting Groq connection test`);
        logger.info(`Testing connection to Groq API with model: ${model}`);

        try {
            const result = await this.generate(
                { prompt: 'Reply with one word: OK', temperature: 0.1, maxTokens: 50 },
                { ...config, model }
            );
            const ok = typeof result.content === 'string' && result.content.trim().length > 0;
            if (ok) logger.info(`Groq connection test succeeded`);
            return ok;
        } catch (error) {
            logger.error(`Groq connection test failed`, error);
            throw error;
        }
    }

    async discoverModels(config: ProviderConfig): Promise<string[]> {
        if (!this.validateApiKey(config.apiKey)) return [...GROQ_MODELS];
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
                    const chatModels = filterChatModels(models);
                    chatModels.sort((a: string, b: string) => b.localeCompare(a));
                    return chatModels.length > 0 ? chatModels : [...GROQ_MODELS];
                }
            }
        } catch (e) {
            logger.error('Groq model discovery failed', e);
        }
        return [...GROQ_MODELS];
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
            `Groq API error | HTTP ${status}` +
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
            throw new RateLimitError(this.displayName);
        }

        if (status >= 500) {
            throw new ProviderError(this.displayName, 'Service temporarily unavailable', ProviderErrorCode.SERVER_ERROR);
        }

        throw new ProviderError(this.displayName, errorMessage, ProviderErrorCode.UNKNOWN);
    }
}
