import { AIProvider, AIRequest, AIResponse, ProviderConfig, filterChatModels } from './AIProvider';
import { InvalidAPIKeyError, ProviderError, NetworkError, RateLimitError, ProviderErrorCode } from '../utils/errors';
import { logger } from '../utils/logger';

export const CEREBRAS_MODELS: ReadonlyArray<string> = [
    'llama3.1-8b',
    'llama-4-scout',
    'gpt-oss-120b',
    'qwen-3-32b'
];

export const CEREBRAS_DEFAULT_MODEL = 'llama3.1-8b';

export class CerebrasProvider implements AIProvider {
    readonly name = 'cerebras';
    readonly displayName = 'Cerebras';
    readonly availableModels: string[] = [...CEREBRAS_MODELS];

    private readonly baseUrl = 'https://api.cerebras.ai/v1';

    async generate(request: AIRequest, config: ProviderConfig): Promise<AIResponse> {
        const { apiKey, model = CEREBRAS_DEFAULT_MODEL } = config;

        logger.info(`Cerebras request started: model=${model}`);

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
            logger.info(`[DIAGNOSTIC] Cerebras API Request`);
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

            logger.info(`Cerebras HTTP status: ${response.status}`);

            if (!response.ok) {
                await this.handleErrorResponse(response, model);
            }

            const data = await response.json() as any;

            const content: string =
                data?.choices?.[0]?.message?.content ??
                data?.choices?.[0]?.delta?.content ??
                '';

            if (!content) {
                throw new ProviderError(this.displayName, 'Empty response received from Cerebras API.');
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

            logger.error(`Cerebras API request failed`, error);
            throw new ProviderError(this.displayName, err?.message || 'Unknown error');
        }
    }

    validateApiKey(apiKey: string): boolean {
        if (!apiKey || !apiKey.trim()) return false;
        return true;
    }

    async testConnection(config: ProviderConfig): Promise<boolean> {
        const model = config.model || CEREBRAS_DEFAULT_MODEL;
        logger.info(`Starting Cerebras connection test`);
        try {
            const result = await this.generate(
                { prompt: 'Reply with one word: OK', temperature: 0.1, maxTokens: 50 },
                { ...config, model }
            );
            const ok = typeof result.content === 'string' && result.content.trim().length > 0;
            if (ok) logger.info(`Cerebras connection test succeeded`);
            return ok;
        } catch (error) {
            logger.error(`Cerebras connection test failed`, error);
            throw error;
        }
    }

    async discoverModels(config: ProviderConfig): Promise<string[]> {
        if (!this.validateApiKey(config.apiKey)) return [...CEREBRAS_MODELS];
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
                    return chatModels.length > 0 ? chatModels : models;
                }
            }
        } catch (e) {
            logger.error('Cerebras model discovery failed', e);
        }
        return [...CEREBRAS_MODELS];
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
            `Cerebras API error | HTTP ${status}` +
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
