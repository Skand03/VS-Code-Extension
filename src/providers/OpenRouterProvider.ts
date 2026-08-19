import { AIProvider, AIRequest, AIResponse, ProviderConfig } from './AIProvider';
import { InvalidAPIKeyError, ProviderError, NetworkError, RateLimitError, ProviderErrorCode } from '../utils/errors';
import { logger } from '../utils/logger';

export const OPENROUTER_DEFAULT_MODEL = 'liquid/lfm-40b:free';

export class OpenRouterProvider implements AIProvider {
    readonly name = 'openrouter';
    readonly displayName = 'OpenRouter';
    readonly availableModels: string[] = []; // Will be populated dynamically

    private readonly baseUrl = 'https://openrouter.ai/api/v1';

    async generate(request: AIRequest, config: ProviderConfig): Promise<AIResponse> {
        const { apiKey, model = OPENROUTER_DEFAULT_MODEL } = config;

        // Extra safety check: prevent any request to a non-free model at the generation level
        if (!model.endsWith(':free') && model !== 'No free OpenRouter models currently available — check openrouter.ai/models for the current free list.') {
            // We allow the "No free..." string to pass through so it hits the 404 and displays cleanly,
            // but for any other non-free model, we block it instantly.
            throw new ProviderError(this.displayName, `Blocked request to non-free model: ${model}. Only :free models are supported to prevent billing.`, ProviderErrorCode.INVALID_REQUEST);
        }

        logger.info(`OpenRouter request started: model=${model}`);

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
            logger.info(`[DIAGNOSTIC] OpenRouter API Request`);
            logger.info(`[DIAGNOSTIC] Model: ${model}`);
            logger.info(`[DIAGNOSTIC] URL: ${url}`);
            logger.info(`[DIAGNOSTIC] Method: POST`);
            logger.info(`[DIAGNOSTIC] Has API key: ${!!apiKey}`);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://github.com/Antigravity', // OpenRouter recommends a referrer
                    'X-Title': 'Antigravity IDE', // OpenRouter recommends a title
                },
                body: JSON.stringify(body),
            });

            logger.info(`OpenRouter HTTP status: ${response.status}`);

            if (!response.ok) {
                await this.handleErrorResponse(response, model);
            }

            const data = await response.json() as any;

            const content: string =
                data?.choices?.[0]?.message?.content ??
                data?.choices?.[0]?.delta?.content ??
                '';

            if (!content) {
                throw new ProviderError(this.displayName, 'Empty response received from OpenRouter API.');
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

            logger.error(`OpenRouter API request failed`, error);
            throw new ProviderError(this.displayName, err?.message || 'Unknown error');
        }
    }

    validateApiKey(apiKey: string): boolean {
        if (!apiKey || !apiKey.trim()) return false;
        return true;
    }

    async testConnection(config: ProviderConfig): Promise<boolean> {
        const model = config.model || OPENROUTER_DEFAULT_MODEL;
        logger.info(`Starting OpenRouter connection test`);
        try {
            const result = await this.generate(
                { prompt: 'Reply with one word: OK', temperature: 0.1, maxTokens: 50 },
                { ...config, model }
            );
            const ok = typeof result.content === 'string' && result.content.trim().length > 0;
            if (ok) logger.info(`OpenRouter connection test succeeded`);
            return ok;
        } catch (error) {
            logger.error(`OpenRouter connection test failed`, error);
            throw error;
        }
    }

    async discoverModels(config: ProviderConfig): Promise<string[]> {
        // OpenRouter models endpoint is public, we can fetch even without API key to populate dropdown
        try {
            const baseUrl = (config.baseUrl || this.baseUrl).replace(/\/$/, '');
            const url = `${baseUrl}/models`;
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json() as any;
                if (data && data.data && Array.isArray(data.data)) {
                    // Filter to only models that end in :free or have $0 prompt/completion pricing
                    const freeModels = data.data.filter((m: any) => {
                        const isFreeSuffix = m.id && m.id.endsWith(':free');
                        const isFreePricing = m.pricing && 
                            (parseFloat(m.pricing.prompt || '1') === 0 && parseFloat(m.pricing.completion || '1') === 0);
                        return isFreeSuffix || isFreePricing;
                    });
                    
                    const chatModels = freeModels.map((m: any) => m.id);
                    chatModels.sort((a: string, b: string) => b.localeCompare(a));
                    
                    if (chatModels.length === 0) {
                        return ['No free OpenRouter models currently available — check openrouter.ai/models for the current free list.'];
                    }
                    return chatModels;
                }
            }
        } catch (e) {
            logger.error('OpenRouter model discovery failed', e);
        }
        return ['No free OpenRouter models currently available — check openrouter.ai/models for the current free list.'];
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
            `OpenRouter API error | HTTP ${status}` +
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

        if (status === 429) {
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
