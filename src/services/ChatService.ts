import * as vscode from 'vscode';
import { AIService } from './AIService';
import { AIRequest } from '../providers/AIProvider';
import { SelectionInfo, SelectionService } from './SelectionService';
import {
    ChatConversation,
    ChatMessage,
    ChatRole,
    ChatCodeContext
} from '../types/ChatTypes';
import { logger } from '../utils/logger';

/**
 * Orchestrates multi-turn chat discussions.
 *
 * Responsibilities:
 *   - Owns the authoritative `ChatConversation` object.
 *   - Appends user messages, builds a multi-turn prompt (conversation history
 *     + selected-code context + system instructions) on every turn.
 *   - Routes the request through `AIService.generate()` using the user's
 *     currently selected provider (BYOK / SecretStorage keys via SettingsService).
 *   - Appends assistant responses (or inline error messages) and bumps the
 *     conversation generation counter.
 *
 * Does NOT:
 *   - Read or log API keys.
 *   - Talk directly to Groq/Gemini/etc. (always goes through AIService).
 *   - Render UI (SidebarProvider owns that layer).
 */
export class ChatService {
    private aiService: AIService;
    private conversation: ChatConversation | undefined;

    constructor(context: vscode.ExtensionContext) {
        this.aiService = new AIService(context);
    }

    /**
     * Start a new conversation from a selection context.
     */
    startConversation(selection: SelectionInfo, provider: string, providerName: string, model: string): ChatConversation {
        const codeContext: ChatCodeContext = {
            fileName: selection.fileName,
            languageId: selection.languageId,
            languageName: SelectionService.getLanguageDisplayName(selection.languageId),
            lineCount: selection.lineCount,
            selectedCode: selection.selectedText
        };

        this.conversation = {
            messages: [],
            codeContext,
            provider,
            providerName,
            model,
            generation: 1,
            status: 'idle',
            createdAt: new Date().toISOString()
        };

        logger.info(
            `[ChatService] New conversation started | ` +
            `provider=${providerName} (${provider}) | model=${model} | ` +
            `file=${selection.fileName} | lines=${selection.lineCount} | ` +
            `generation=${this.conversation.generation}`
        );
        return this.conversation;
    }

    getConversation(): ChatConversation | undefined {
        return this.conversation;
    }

    clearConversation(): void {
        if (this.conversation) {
            this.conversation = {
                ...this.conversation,
                messages: [],
                generation: this.conversation.generation + 1,
                status: 'idle'
            };
        }
    }

    /**
     * Refresh the provider/model snapshot (reads from SettingsService live).
     * Called between turns so if the user changes provider/model via the
     * settings panel, subsequent chat turns use the new config.
     */
    private async refreshProviderSnapshot(): Promise<{ providerName: string; providerDisplayName: string; model: string }> {
        const settingsService = this.aiService.getSettingsService();
        const providerName = settingsService.getProvider();
        const providerInst = this.aiService.getProvider(providerName);
        const providerDisplayName = providerInst ? providerInst.displayName : providerName;
        const modelSetting = settingsService.getModel(providerName);
        const model = modelSetting || (providerInst?.availableModels?.[0]) || '';
        return { providerName, providerDisplayName, model };
    }

    /**
     * Append a user message and call AI. Returns the updated conversation
     * reference. The returned promise resolves AFTER the assistant message
     * (or inline error) has been appended.
     *
     * RACE-SAFETY:
     *   - The caller (SidebarProvider.handleMessage) should bump
     *     `SidebarProvider.stateGeneration` each time it sends state to the
     *     webview, regardless of when the async promise below resolves.
     *   - If the user submits a second message while the first is in flight,
     *     `sending` state is detected and the call is rejected.
     */
    async sendUserMessage(content: string, targetLanguage?: string): Promise<ChatConversation> {
        const trimmed = typeof content === 'string' ? content.trim() : '';
        if (!trimmed) {
            throw new Error('Message is empty.');
        }

        if (!this.conversation) {
            throw new Error('No active conversation. Start Chat Discussion first by selecting code.');
        }

        if (this.conversation.status === 'sending') {
            throw new Error('A request is already in progress. Please wait.');
        }

        // 1) Append user message
        const nextId = (this.conversation.messages[this.conversation.messages.length - 1]?.id ?? 0) + 1;
        const userMsg: ChatMessage = {
            id: nextId,
            role: 'user',
            content: trimmed,
            timestamp: new Date().toISOString()
        };
        this.conversation.messages.push(userMsg);

        // 2) Placeholder assistant message (pending = true) so UI shows
        //    "Thinking..." without replacing the previous conversation.
        const pendingId = nextId + 1;
        const pendingMsg: ChatMessage = {
            id: pendingId,
            role: 'assistant',
            content: '',
            timestamp: new Date().toISOString(),
            pending: true
        };
        this.conversation.messages.push(pendingMsg);
        this.conversation.status = 'sending';
        this.conversation.generation += 1;

        const turnGeneration = this.conversation.generation;
        logger.info(
            `[ChatService] Turn ${pendingId} | user="${trimmed.slice(0, 80)}${trimmed.length > 80 ? '…' : ''}" | ` +
            `generation=${turnGeneration}`
        );

        try {
            // 3) Refresh provider/model snapshot before each turn (allows user
            //    to switch provider mid-conversation via settings panel).
            const snapshot = await this.refreshProviderSnapshot();
            this.conversation.provider = snapshot.providerName;
            this.conversation.providerName = snapshot.providerDisplayName;
            this.conversation.model = snapshot.model;

            // 4) Build multi-turn prompt
            const request: AIRequest = {
                prompt: this.buildPromptFromConversation(trimmed),
                systemPrompt: this.buildSystemPrompt(targetLanguage),
                temperature: 0.7,
                maxTokens: 2048
            };

            // 5) Call AIService → provider → API
            const response = await this.aiService.generate(request);

            // Guard: ensure another turn didn't start while we awaited (should
            // be prevented by status === 'sending', but belt-and-suspenders).
            if (!this.conversation || this.conversation.generation !== turnGeneration) {
                logger.warn(`[ChatService] Stale response received; ignoring (generation mismatch).`);
                return this.conversation;
            }

            // 6) Replace pending placeholder with actual response
            const reply = response.content && response.content.trim().length > 0
                ? response.content
                : '(Empty response received from provider.)';

            const idx = this.conversation.messages.findIndex(m => m.id === pendingId);
            if (idx !== -1) {
                this.conversation.messages[idx] = {
                    id: pendingId,
                    role: 'assistant',
                    content: reply,
                    timestamp: new Date().toISOString(),
                    pending: false
                };
            }
            this.conversation.status = 'idle';
            this.conversation.generation += 1;
            logger.info(
                `[ChatService] Assistant reply received | length=${reply.length} | ` +
                `generation=${this.conversation.generation} | tokensUsed=${response.tokensUsed ?? 'n/a'}`
            );
        } catch (err: any) {
            if (!this.conversation) { throw err; }

            // Rollback generation to turnGeneration if we haven't bumped since
            if (this.conversation.generation === turnGeneration) {
                this.conversation.generation += 1;
            }

            const userSafeMsg = this.formatError(err);
            logger.error('[ChatService] Turn failed.', err);

            const idx = this.conversation.messages.findIndex(m => m.id === pendingId);
            if (idx !== -1) {
                this.conversation.messages[idx] = {
                    id: pendingId,
                    role: 'assistant',
                    content: '',
                    timestamp: new Date().toISOString(),
                    pending: false,
                    errorMessage: userSafeMsg
                };
            } else {
                this.conversation.messages.push({
                    id: pendingId,
                    role: 'assistant',
                    content: '',
                    timestamp: new Date().toISOString(),
                    errorMessage: userSafeMsg
                });
            }
            this.conversation.status = 'error';
        }

        return this.conversation;
    }

    /**
     * Build a system prompt that tells the AI the current file context,
     * language, and that the attached conversation is authoritative.
     */
    private buildSystemPrompt(targetLanguage?: string): string {
        const langMap: Record<string, string> = {
            hi: 'Hindi (हिन्दी)', bn: 'Bengali (বাংলা)', te: 'Telugu (తెలుగు)',
            mr: 'Marathi (मराठी)', ta: 'Tamil (தமிழ்)', gu: 'Gujarati (ગુજરાતી)',
            kn: 'Kannada (ಕನ್ನಡ)', ml: 'Malayalam (മലയാളം)', pa: 'Punjabi (ਪੰਜਾਬੀ)',
            or: 'Odia (ଓଡ଼ିଆ)', en: 'English'
        };
        const lines: string[] = [];
        lines.push('You are an AI coding assistant embedded inside VS Code.');
        lines.push('Answer concisely, use markdown for formatting, and include code examples when helpful.');
        if (this.conversation?.codeContext) {
            const ctx = this.conversation.codeContext;
            lines.push('');
            lines.push('=== SELECTED CODE CONTEXT (PRIMARY REFERENCE FOR THIS CONVERSATION) ===');
            lines.push(`File: ${ctx.fileName}`);
            lines.push(`Programming Language: ${ctx.languageName} (languageId: ${ctx.languageId})`);
            lines.push(`Lines: ${ctx.lineCount}`);
            lines.push('Selected code block that the user is asking about:');
            lines.push('```' + (ctx.languageId || ''));
            lines.push(ctx.selectedCode);
            lines.push('```');
            lines.push('=== END OF SELECTED CODE CONTEXT ===');
            lines.push('');
            lines.push('All user questions in this conversation refer to the selected code above unless they explicitly reference something else.');
            lines.push('Do NOT invent file contents. If the user asks about code not shown above, ask them to select it first.');
            if (targetLanguage && targetLanguage !== 'en') {
                lines.push('');
                lines.push('=== CRITICAL LANGUAGE INSTRUCTION - READ CAREFULLY ===');
                lines.push(`1. Write ALL explanatory text in ${langMap[targetLanguage] || targetLanguage}.`);
                lines.push('2. Keep ALL code identifiers in English - this includes:');
                lines.push('   - Variable names: items, total, price, etc.');
                lines.push('   - Function names: reduce, map, filter, etc.');
                lines.push('   - Keywords: null, undefined, NaN, true, false');
                lines.push('   - Class/Property names: Array, .length, .price');
                lines.push('3. When mentioning code in explanations, wrap in backticks (`code`) and keep English.');
                lines.push(`4. Do NOT translate inline code like \`items[i].price\` or \`Array.prototype.reduce\`.`);
                lines.push(`5. Do NOT add ${langMap[targetLanguage] || targetLanguage} comments inside code blocks.`);
                lines.push('');
                lines.push(`CORRECT: "यह \`items\` array को iterate करता है।"`);
                lines.push(`WRONG: "यह आइटम्स array को iterate करता है।" (DON'T DO THIS!)`);
            } else {
                lines.push('Keep code blocks and identifiers exactly as shown — do not modify code unless explicitly asked.');
            }
        }
        return lines.join('\n');
    }

    /**
     * Build a single-turn user prompt that re-serializes the full chat history
     * as plain text. We do NOT rely on provider-specific "messages[]" array
     * support because the common AIProvider interface only exposes a single
     * `prompt` + optional `systemPrompt` string. By serializing history into
     * the prompt string, all 6 providers (Gemini/OpenAI/Groq/Together/Siddhi/
     * Localhost) get identical multi-turn semantics with zero provider-specific
     * code.
     */
    private buildPromptFromConversation(currentUserMessage: string): string {
        const conv = this.conversation;
        if (!conv) { return currentUserMessage; }

        const parts: string[] = [];
        parts.push('=== CONVERSATION HISTORY ===');
        parts.push('(The messages below are the previous turns in this discussion. Use them to give context-aware replies.)');
        parts.push('');

        // Skip the last message if it's the current one (we'll append it below
        // explicitly). Also skip the pending assistant placeholder.
        const history = conv.messages.filter(m => !(m.role === 'user' && m.content === currentUserMessage) && !(m.role === 'assistant' && m.pending));
        for (const m of history) {
            const speaker = m.role === 'user' ? 'USER' : 'AI ASSISTANT';
            parts.push(`--- ${speaker} ---`);
            if (m.errorMessage) {
                parts.push(`[Previous turn had an error: ${m.errorMessage}]`);
            }
            parts.push(m.content || '(empty)');
            parts.push('');
        }

        parts.push('=== CURRENT USER QUESTION ===');
        parts.push(currentUserMessage);
        parts.push('');
        parts.push('Please answer based on the selected code context and conversation history above.');
        return parts.join('\n');
    }

    /**
     * Error → user-safe string. Never reveals API keys or internal paths.
     */
    private formatError(err: any): string {
        if (!err) { return 'Unknown error.'; }
        const msg = (err instanceof Error ? err.message : String(err)) || String(err);
        // Basic safe-guards
        const safe = msg
            .replace(/sk-[A-Za-z0-9_-]{10,}/g, '<REDACTED-API-KEY>')
            .replace(/AIza[0-9A-Za-z_-]{20,}/g, '<REDACTED-API-KEY>')
            .replace(/gsk_[A-Za-z0-9_-]{10,}/g, '<REDACTED-API-KEY>');
        return safe.length > 400 ? safe.slice(0, 400) + '…' : safe;
    }
}
