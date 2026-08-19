import { AIProvider, AIRequest, AIResponse, ProviderConfig } from './AIProvider';
import { InvalidAPIKeyError, ProviderError, NetworkError, RateLimitError, ProviderErrorCode } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * DeepSeek Provider — uses the DeepSeek OpenAI-compatible REST endpoint.
 * https://api.deepseek.com/chat/completions
 *
 * DeepSeek V4 family released April 2026. Two production models:
 * - deepseek-v4-flash: Cost-effective, fast (284B params, ~13B active)
 * - deepseek-v4-pro: Most capable (1.6T params, ~49B active)
 *
 * Both models support:
 * - 1M token context window
 * - 384K max output tokens
 * - Thinking mode (reasoning) and non-thinking mode
 * - OpenAI-compatible API format
 *
 * Every user brings their own DeepSeek API key (BYOK).
 * Keys are stored in VS Code SecretStorage per-provider.
 *
 * Official docs: https://api-docs.deepseek.com/
 */

/**
 * DeepSeek V4 production models (April 2026).
 * Ordered: most capable first.
 */
export const DEEPSEEK_MODELS: ReadonlyArray<string> = [
    'deepseek-v4-pro',          // Most capable: 1.6T params, 49B active
    'deepseek-v4-flash',        // Fast & cost-effective: 284B params, 13B active
];

export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-v4-flash';

export class DeepSeekProvider implements AIProvider {
    readonly name = 'deepseek';
    readonly displayName = 'DeepSeek';
    readonly availableModels: string[] = [...DEEPSEEK_MODELS];

    private readonly baseUrl = 'https://api.deepseek.com';

    async generate(request: AIRequest, config: ProviderConfig): Promise<AIResponse> {
        const { apiKey, model = DEEPSEEK_DEFAULT_MODEL } = config;

        logger.info(`DeepSeek request started: model=${model}`);

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
            logger.info(`[DIAGNOSTIC] DeepSeek API Request`);
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

            logger.info(`DeepSeek HTTP status: ${response.status}`);
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
                throw new ProviderError(this.displayName, 'Empty response received from DeepSeek API.');
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

            logger.error(`DeepSeek API request failed`, error);
            throw new ProviderError(this.displayName, err?.message || 'Unknown error');
        }
    }

    validateApiKey(apiKey: string): boolean {
        if (!apiKey || !apiKey.trim()) return false;
        const trimmed = apiKey.trim();
        // DeepSeek API keys are typically 32+ characters
        return trimmed.length >= 20;
    }

    async testConnection(config: ProviderConfig): Promise<boolean> {
        const model = config.model || DEEPSEEK_DEFAULT_MODEL;
        logger.info(`Starting DeepSeek connection test`);
        logger.info(`Testing connection to DeepSeek API with model: ${model}`);

        try {
            const result = await this.generate(
                { prompt: 'Reply with one word: OK', temperature: 0.1, maxTokens: 50 },
                { ...config, model }
            );
            const ok = typeof result.content === 'string' && result.content.trim().length > 0;
            if (ok) logger.info(`DeepSeek connection test succeeded`);
            return ok;
        } catch (error) {
            logger.error(`DeepSeek connection test failed`, error);
            throw error;
        }
    }

    async discoverModels(config: ProviderConfig): Promise<string[]> {
        if (!this.validateApiKey(config.apiKey)) return [...DEEPSEEK_MODELS];
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
                    models.sort((a: string, b: string) => b.localeCompare(a));
                    return models.length > 0 ? models : [...DEEPSEEK_MODELS];
                }
            }
        } catch (e) {
            logger.error('DeepSeek model discovery failed', e);
        }
        return [...DEEPSEEK_MODELS];
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
            `DeepSeek API error | HTTP ${status}` +
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
        
        if (status === 402) {
            throw new ProviderError(this.displayName, 'Insufficient Balance', ProviderErrorCode.INSUFFICIENT_BALANCE);
        }

        if (status >= 500) {
            throw new ProviderError(this.displayName, 'Service temporarily unavailable', ProviderErrorCode.SERVER_ERROR);
        }

        throw new ProviderError(this.displayName, errorMessage, ProviderErrorCode.UNKNOWN);
    }
}
