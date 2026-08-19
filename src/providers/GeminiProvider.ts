import { AIProvider, AIRequest, AIResponse, ProviderConfig, filterChatModels } from './AIProvider';
import { InvalidAPIKeyError, ProviderError, NetworkError, RateLimitError, ProviderErrorCode } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * Google Gemini AI Provider Implementation
 * Uses the Gemini REST API (v1beta) for code analysis and generation.
 *
 * Model list: verified against https://ai.google.dev/gemini-api/docs/models
 * as of August 2026. To get a live list, call:
 *   GET https://generativelanguage.googleapis.com/v1beta/models?key=API_KEY
 * and filter for models that support "generateContent".
 *
 * Update GEMINI_MODELS below whenever Google publishes new stable models.
 */

/**
 * Stable text-generation models verified from the official Gemini API docs.
 * Ordered: newest / most capable first so the dropdown shows the best option at the top.
 * Do NOT include audio, image, video, embedding, or experimental-only models here.
 */
export const GEMINI_MODELS: ReadonlyArray<string> = [
    'gemini-2.5-flash',          // Best free model – fast & smart
    'gemini-2.5-flash-lite',     // Fastest, lightest 2.5
    'gemini-2.0-flash',          // Stable Flash generation
    'gemini-1.5-flash',          // Reliable, widely available
    'gemini-1.5-pro',            // Most capable 1.5 model
    'gemini-1.5-flash-8b',       // Ultra-fast lightweight model
];


/** Default model used when no model is configured. */
export const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash';


export class GeminiProvider implements AIProvider {
    readonly name = 'gemini';
    readonly displayName = 'Google Gemini';

    /**
     * availableModels is the live list used by the Settings UI dropdown.
     * It references the exported constant so callers can also import just
     * GEMINI_MODELS if they need it without constructing the provider.
     */
    readonly availableModels: string[] = [...GEMINI_MODELS];

    private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

    /**
     * Generate AI response using Gemini REST API.
     * If no model is specified in config, uses GEMINI_DEFAULT_MODEL.
     */
    async generate(request: AIRequest, config: ProviderConfig): Promise<AIResponse> {
        const { apiKey, model = GEMINI_DEFAULT_MODEL } = config;

        // User-requested safe request-start log (never contains the key)
        logger.info(`Gemini request started: model=${model}`);

        if (!this.validateApiKey(apiKey)) {
            throw new InvalidAPIKeyError(this.displayName);
        }

        // NOTE: The API key is passed via the x-goog-api-key header (current best practice).
        // This keeps the key out of the URL entirely and prevents accidental logging of the URL.
        const url = `${this.baseUrl}/models/${model}:generateContent`;

        // Construct the Gemini API request body
        const body = {
            contents: [
                {
                    parts: [
                        {
                            text: request.systemPrompt 
                                ? `${request.systemPrompt}\n\n${request.prompt}`
                                : request.prompt
                        }
                    ]
                }
            ],
            generationConfig: {
                temperature: request.temperature ?? 0.7,
                maxOutputTokens: request.maxTokens ?? 2048,
            }
        };

        try {
            // DIAGNOSTIC: Log request details (NEVER log the API key itself)
            logger.info(`[DIAGNOSTIC] Gemini API Request`);
            logger.info(`[DIAGNOSTIC] Model: ${model}`);
            logger.info(`[DIAGNOSTIC] URL: ${url}`);
            logger.info(`[DIAGNOSTIC] Method: POST`);
            logger.info(`[DIAGNOSTIC] Has API key: ${apiKey ? 'YES' : 'NO'}`);
            logger.info(`[DIAGNOSTIC] API key length: ${apiKey ? apiKey.length : 0}`);
            logger.info(`[DIAGNOSTIC] Request body: ${JSON.stringify(body, null, 2)}`);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey
                },
                body: JSON.stringify(body)
            });

            // User-requested safe HTTP status log (never contains the key)
            logger.info(`Gemini HTTP status: ${response.status}`);

            // DIAGNOSTIC: Log response details
            logger.info(`[DIAGNOSTIC] HTTP Status: ${response.status}`);
            logger.info(`[DIAGNOSTIC] Status Text: ${response.statusText}`);

            if (!response.ok) {
                // Clone response to read body for diagnostics without consuming it
                const clonedResponse = response.clone();
                try {
                    const errorBody = await clonedResponse.text();
                    logger.error(`[DIAGNOSTIC] Error response body: ${errorBody}`);
                } catch (e) {
                    logger.error(`[DIAGNOSTIC] Could not read error response body`);
                }
                
                // handleErrorResponse always throws — return ensures TypeScript
                // understands execution never continues past this point
                return await this.handleErrorResponse(response, model);
            }

            logger.info(`[DIAGNOSTIC] Response OK - reading JSON`);
            const responseText = await response.text();
            logger.info(`[DIAGNOSTIC] Response body length: ${responseText.length} chars`);
            logger.info(`[DIAGNOSTIC] Response body preview: ${responseText.substring(0, 200)}...`);

            const data = JSON.parse(responseText) as any;

            // Extract content from Gemini response
            const content = this.extractContent(data);

            logger.info('[DIAGNOSTIC] Successfully extracted content from Gemini API');

            return {
                content,
                model,
                provider: this.displayName,
                tokensUsed: data.usageMetadata?.totalTokenCount
            };

        } catch (error: any) {
            logger.error('[DIAGNOSTIC] Gemini API request failed');
            logger.error(`[DIAGNOSTIC] Error type: ${error.constructor?.name || typeof error}`);
            logger.error(`[DIAGNOSTIC] Error message: ${error.message || String(error)}`);
            logger.error(`[DIAGNOSTIC] Error stack: ${error.stack || 'no stack'}`);

            if (error instanceof InvalidAPIKeyError || 
                error instanceof ProviderError || 
                error instanceof RateLimitError ||
                error instanceof NetworkError) {
                throw error;
            }

            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new NetworkError();
            }

            throw new ProviderError(this.displayName, error.message || 'Unknown error occurred');
        }
    }

    /**
     * Extract text content from Gemini API response.
     * Handles safety blocks, empty candidates, and unexpected formats.
     */
    private extractContent(data: any): string {
        if (!data.candidates || data.candidates.length === 0) {
            // This can happen if the request was blocked at the prompt level
            const blockReason = data.promptFeedback?.blockReason;
            if (blockReason) {
                throw new ProviderError(this.displayName, `Request blocked: ${blockReason}`);
            }
            throw new ProviderError(this.displayName, 'No response generated');
        }

        const candidate = data.candidates[0];

        // Check if the response was blocked mid-generation.
        // MAX_TOKENS means the model ran out of token budget — the connection
        // itself worked, so treat this as a valid (partial) response rather
        // than an error. Only treat unexpected finish reasons as errors.
        const finishReason = candidate.finishReason;
        if (finishReason &&
            finishReason !== 'STOP' &&
            finishReason !== 'MAX_TOKENS') {
            throw new ProviderError(
                this.displayName,
                `Response stopped unexpectedly (reason: ${finishReason})`
            );
        }

        if (!candidate.content?.parts || candidate.content.parts.length === 0) {
            // With thinking models a MAX_TOKENS stop can yield no output parts —
            // that still means the API responded successfully.
            if (finishReason === 'MAX_TOKENS') {
                return '[Response truncated — token limit reached]';
            }
            throw new ProviderError(this.displayName, 'Empty response received from API');
        }

        // Thinking models (gemini-2.5-pro, gemini-2.5-flash, etc.) include
        // thought parts alongside the final answer. Skip non-text parts and
        // collect only the visible text output.
        const textParts = candidate.content.parts
            .filter((p: any) => typeof p.text === 'string' && p.text.trim().length > 0);

        if (textParts.length === 0) {
            if (finishReason === 'MAX_TOKENS') {
                return '[Response truncated — token limit reached]';
            }
            throw new ProviderError(this.displayName, 'Empty text in API response');
        }

        return textParts.map((p: any) => p.text).join('\n');
    }

    /**
     * Handle error responses from Gemini API.
     * WARNING: Do not log the request URL or any value derived from the API key.
     */
    private async handleErrorResponse(response: Response, model: string): Promise<never> {
        const status = response.status;
        let errorMessage = 'API request failed';
        let errorCode = '';
        let errorStatus = '';

        try {
            const errorData = await response.json() as any;
            // Use only the message/code fields, which should never contain the key
            errorMessage = errorData.error?.message || errorMessage;
            errorCode = errorData.error?.code ? String(errorData.error.code) : '';
            errorStatus = errorData.error?.status || '';
        } catch {
            errorMessage = response.statusText || errorMessage;
        }

        // Log full diagnostic info — status, code, message, model — NEVER the URL or key
        logger.error(
            `Gemini API error | HTTP ${status}` +
            (errorCode ? ` | code: ${errorCode}` : '') +
            (errorStatus ? ` | status: ${errorStatus}` : '') +
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

        // Google often returns HTTP 400 (Bad Request) with errorCode === 'INVALID_ARGUMENT' or
        // JSON inner code === 400 and message containing "API key not valid" for revoked keys.
        const lcMsg = errorMessage.toLowerCase();
        if (
            (status === 400 && (lcMsg.includes('api key not valid') || lcMsg.includes('invalid api key'))) ||
            (errorStatus && errorStatus === 'INVALID_ARGUMENT' && lcMsg.includes('api key'))
        ) {
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

    /**
     * Validate Gemini API key format
     * Gemini keys typically start with "AIza" and are 39 characters
     */
    validateApiKey(apiKey: string): boolean {
        if (!apiKey || typeof apiKey !== 'string') {
            return false;
        }

        const trimmed = apiKey.trim();
        
        // Basic validation: non-empty and reasonable length
        return trimmed.length > 20 && trimmed.length < 100;
    }

    /**
     * Test connection to Gemini API.
     *
     * Uses a minimal prompt with a token budget large enough for thinking models
     * (gemini-2.5-pro / gemini-2.5-flash etc.) which consume thinking tokens
     * *in addition* to output tokens. 10 tokens is far too small — the thinking
     * pass alone exceeds that, producing a MAX_TOKENS finish or a 400 error.
     * 200 output tokens is a safe lower bound that keeps the test call cheap
     * while reliably succeeding on all current Gemini models.
     */
    async testConnection(config: ProviderConfig): Promise<boolean> {
        const model = config.model || GEMINI_DEFAULT_MODEL;

        // User-requested safe connection-start log (never contains the key)
        logger.info(`Starting Gemini connection test`);
        logger.info(`Testing connection to Gemini API with model: ${model}`);

        try {
            const testRequest: AIRequest = {
                prompt: 'Reply with one word: OK',
                maxTokens: 200
            };

            await this.generate(testRequest, config);
            logger.info('Gemini connection test succeeded');
            return true;

        } catch (error) {
            logger.error('Gemini connection test failed', error);
            throw error;
        }
    }

    async discoverModels(config: ProviderConfig): Promise<string[]> {
        if (!this.validateApiKey(config.apiKey)) return [...GEMINI_MODELS];
        try {
            const url = `${this.baseUrl}/models?key=${config.apiKey}`;
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json() as any;
                if (data && data.models && Array.isArray(data.models)) {
                    let models = data.models
                        .filter((m: any) => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
                        .map((m: any) => m.name.replace('models/', ''));
                    
                    models = filterChatModels(models);
                    
                    // sort to keep newest/pro/flash models top
                    models.sort((a: string, b: string) => b.localeCompare(a));
                    return models.length > 0 ? models : [...GEMINI_MODELS];
                }
            }
        } catch (e) {
            logger.error('Gemini model discovery failed', e);
        }
        return [...GEMINI_MODELS];
    }
}
