/**
 * Custom error classes for the AI Assistant extension
 */

export class AIAssistantError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AIAssistantError';
    }
}

export enum ProviderErrorCode {
    INVALID_API_KEY,
    MODEL_NOT_FOUND,
    MODEL_UNAVAILABLE,
    INSUFFICIENT_QUOTA,
    INSUFFICIENT_BALANCE,
    RATE_LIMITED,
    PERMISSION_DENIED,
    INVALID_REQUEST,
    NETWORK_ERROR,
    SERVER_ERROR,
    UNKNOWN,
}

export class NoSelectionError extends AIAssistantError {
    constructor() {
        super('Please select some code or text first.');
        this.name = 'NoSelectionError';
    }
}

export class ProviderError extends AIAssistantError {
    public readonly errorCode: ProviderErrorCode;
    constructor(provider: string, message: string, errorCode: ProviderErrorCode = ProviderErrorCode.UNKNOWN) {
        super(`${provider} Error: ${message}`);
        this.name = 'ProviderError';
        this.errorCode = errorCode;
    }
}

export class MissingAPIKeyError extends AIAssistantError {
    constructor(provider: string) {
        super(`${provider} API key is not configured. Please open Settings to add your API key.`);
        this.name = 'MissingAPIKeyError';
    }
}

export class InvalidAPIKeyError extends ProviderError {
    constructor(provider: string) {
        super(provider, `Invalid ${provider} API key. Please check your API key in Settings.`, ProviderErrorCode.INVALID_API_KEY);
        this.name = 'InvalidAPIKeyError';
    }
}

export class NetworkError extends ProviderError {
    constructor(message: string = 'Network request failed. Please check your internet connection.') {
        super('Network', message, ProviderErrorCode.NETWORK_ERROR);
        this.name = 'NetworkError';
    }
}

export class RateLimitError extends ProviderError {
    constructor(provider: string) {
        super(provider, `${provider} rate limit exceeded. Please try again later.`, ProviderErrorCode.RATE_LIMITED);
        this.name = 'RateLimitError';
    }
}

export class QuotaExceededError extends ProviderError {
    constructor(provider: string, message: string = `${provider} API quota unavailable. Check billing/credits.`) {
        super(provider, message, ProviderErrorCode.INSUFFICIENT_QUOTA);
        this.name = 'QuotaExceededError';
    }
}

/**
 * Format error for user-friendly display
 */
export function formatErrorForUser(error: any): string {
    if (error instanceof AIAssistantError) {
        return error.message;
    }

    if (error.response?.status === 401) {
        return 'Invalid API key. Please check your API key in Settings.';
    }

    if (error.response?.status === 429) {
        return 'Rate limit exceeded. Please try again later.';
    }

    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        return 'Network error. Please check your internet connection.';
    }

    return 'An unexpected error occurred. Please try again.';
}
