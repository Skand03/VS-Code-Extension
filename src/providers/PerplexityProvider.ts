import { AIProvider, AIRequest, AIResponse, ProviderConfig } from './AIProvider';
import { InvalidAPIKeyError, ProviderError, NetworkError, RateLimitError, ProviderErrorCode } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * Perplexity API Provider
 * 
 * Uses Perplexity's chat/completions endpoint.
 * Perplexity does not currently expose a standard /models discovery endpoint for API users.
 * Therefore, we rely on the hardcoded stable list.
 */

export const PERPLEXITY_MODELS: ReadonlyArray<string> = [
    'llama-3.1-sonar-huge-128k-online',
    'llama-3.1-sonar-large-128k-online',
    'llama-3.1-sonar-small-128k-online',
    'llama-3.1-8b-instruct',
    'llama-3.1-70b-instruct'
];

export const PERPLEXITY_DEFAULT_MODEL = 'llama-3.1-sonar-large-128k-online';

export class PerplexityProvider implements AIProvider {
    readonly name = 'perplexity';
    readonly displayName = 'Perplexity';
    readonly availableModels: string[] = [...PERPLEXITY_MODELS];

    private readonly baseUrl = 'https://api.perplexity.ai';

    async generate(request: AIRequest, config: ProviderConfig): Promise<AIResponse> {
        const { apiKey, model = PERPLEXITY_DEFAULT_MODEL } = config;

        logger.info(`Perplexity request started: model=${model}`);

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
            max_tokens: request.maxTokens,
        };

        try {
            logger.info(`[DIAGNOSTIC] Perplexity API Request`);
            logger.info(`[DIAGNOSTIC] Model: ${model}`);
            logger.info(`[DIAGNOSTIC] URL: ${url}`);
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify(body),
            });

            logger.info(`Perplexity HTTP status: ${response.status}`);

            if (!response.ok) {
                await this.handleErrorResponse(response, model);
            }

            const data = await response.json() as any;

            const content: string =
                data?.choices?.[0]?.message?.content ??
                data?.choices?.[0]?.delta?.content ??
                '';

            if (!content) {
                throw new ProviderError(this.displayName, 'Empty response received from Perplexity API.');
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

            logger.error(`Perplexity API request failed`, error);
            throw new ProviderError(this.displayName, err?.message || 'Unknown error');
        }
    }

    validateApiKey(apiKey: string): boolean {
        if (!apiKey || !apiKey.trim()) return false;
        // Perplexity keys usually start with 'pplx-'
        return apiKey.trim().length >= 20;
    }

    async testConnection(config: ProviderConfig): Promise<boolean> {
        const model = config.model || PERPLEXITY_DEFAULT_MODEL;
        logger.info(`Starting Perplexity connection test`);

        try {
            const result = await this.generate(
                { prompt: 'Reply with one word: OK', temperature: 0.1, maxTokens: 50 },
                { ...config, model }
            );
            const ok = typeof result.content === 'string' && result.content.trim().length > 0;
            if (ok) logger.info(`Perplexity connection test succeeded`);
            return ok;
        } catch (error) {
            logger.error(`Perplexity connection test failed`, error);
            throw error;
        }
    }

    async discoverModels(config: ProviderConfig): Promise<string[]> {
        // Perplexity doesn't expose a standard /models endpoint reliably,
        // so we return the hardcoded models.
        return [...PERPLEXITY_MODELS];
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
            `Perplexity API error | HTTP ${status}` +
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
