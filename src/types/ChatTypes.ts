/**
 * Type definitions for Phase 2 Chat Discussion feature.
 *
 * These types are shared between:
 *   - ChatService (extension host, owns conversation state)
 *   - SidebarProvider (UI state, passes to webview)
 *   - Webview JS (renders chat bubbles)
 *
 * SECURITY: None of these types contain API keys. Keys remain in
 * SettingsService + VS Code SecretStorage only.
 */

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
    /** Monotonic id within a single conversation. */
    id: number;
    /** 'user' or 'assistant' */
    role: ChatRole;
    /** Raw text content (not HTML-escaped — rendering escapes at display time). */
    content: string;
    /** ISO-8601 timestamp, set by ChatService when the message is recorded. */
    timestamp: string;
    /** True while an assistant message is still streaming / waiting for API. */
    pending?: boolean;
    /** For an errored assistant turn: a user-safe reason string. */
    errorMessage?: string;
}

/** Selected-code snapshot captured when the user triggers Chat Discussion. */
export interface ChatCodeContext {
    fileName: string;
    languageId: string;
    /** Human-readable language name, e.g. "TypeScript", "Python". */
    languageName: string;
    lineCount: number;
    /** Raw selected code (never logged or sent to webview? No — user MUST see it in UI). */
    selectedCode: string;
}

/**
 * The canonical conversation state object (single source of truth lives in
 * ChatService; SidebarProvider holds a typed reference via `chatConversation`
 * transient fields on SidebarState when mode === 'chat').
 */
export interface ChatConversation {
    messages: ChatMessage[];
    /** The context captured at chat-start time. Persists for the whole conversation. */
    codeContext: ChatCodeContext | undefined;
    /** Display name of the provider used, e.g. "Groq". */
    provider: string;
    /** Provider name as registered with AIService, e.g. "groq". */
    providerName: string;
    /** Selected model at chat-start time; refresh allowed between turns. */
    model: string;
    /**
     * Monotonic per-conversation generation counter. Incremented whenever
     * messages[] or any other field changes. Used together with
     * SidebarProvider.stateGeneration to reject stale webview updates.
     */
    generation: number;
    /** 'idle' (user may type), 'sending' (waiting for provider), 'error'. */
    status: 'idle' | 'sending' | 'error';
    /** ISO timestamp when the conversation was created. */
    createdAt: string;
}
