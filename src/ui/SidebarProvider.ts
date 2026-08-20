import * as vscode from 'vscode';
import { AIResponse } from '../providers/AIProvider';
import { SelectionInfo } from '../services/SelectionService';
import { AIService } from '../services/AIService';
import { PromptService } from '../services/PromptService';
import { ChatService } from '../services/ChatService';
import { ChatConversation, ChatMessage } from '../types/ChatTypes';
import { logger } from '../utils/logger';
import { marked } from 'marked';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

const _jsdomWindow = new JSDOM('').window;
const DOMPurify = createDOMPurify(_jsdomWindow as any);

/**
 * State for the sidebar.
 *
 * The sidebar has two distinct modes:
 *   - 'analyze': single-shot Analyze Code feature (Phase 1, working)
 *   - 'chat':    multi-turn Chat Discussion (Phase 2, new)
 *
 * Mode is determined by the `mode` field. Fields are mode-partitioned so
 * existing Analyze Code behavior is completely untouched.
 */
interface SidebarState {
    /** 'analyze' | 'chat' */
    mode: 'analyze' | 'chat';

    // ---- Shared fields ----
    action?: string;
    provider?: string;
    model?: string;
    /** Current UI language code (e.g. 'en', 'hi', 'bn'). */
    uiLanguage?: string;
    status: 'idle' | 'loading' | 'success' | 'error';

    // ---- Mode: 'analyze' (Phase 1) ----
    selection?: {
        fileName: string;
        languageId: string;
        lineCount: number;
    };
    response?: string;
    error?: string;

    // ---- Mode: 'chat' (Phase 2) ----
    chatStatus?: 'idle' | 'sending' | 'error';
    chatCodeContext?: {
        fileName: string;
        languageId: string;
        languageName: string;
        lineCount: number;
        /**
         * Preview of the selected code for the UI. Always HTML-escaped on
         * the extension side BEFORE putting into state so the webview can
         * insert it raw without re-escaping (we handle it once, safely).
         */
        selectedCodePreviewHtml: string;
    };
    /**
     * Serialized chat messages for the webview. Rendered to HTML on the
     * extension side (role, timestamp, content-HTML) to avoid any
     * template-literal / backtick / regex parser conflicts in the webview.
     */
    chatMessagesHtml?: string;
    /** Count of messages — used by UI to auto-scroll after render. */
    chatMessageCount?: number;
    /** Convenience field: the last assistant message TEXT (used by TTS/Save). */
    chatLastAssistantContent?: string;
    /** Whether the active provider had a valid API key at chat-start time. */
    chatReady?: boolean;
}

/**
 * Supported UI languages. Add new languages here AND update package.json enum.
 * Code is kept as metadata — actual translated strings would live in i18n JSON
 * files for a full translation pass. For Phase 2 we implement:
 *   - language selector UI
 *   - persistence via aiAssistant.uiLanguage setting
 *   - the selector chip/button visible in both modes' header.
 */
const UI_LANGUAGES: ReadonlyArray<{ code: string; name: string; native: string }> = [
    { code: 'en', name: 'English',    native: 'English' },
    { code: 'hi', name: 'Hindi',      native: 'हिन्दी' },
    { code: 'bn', name: 'Bengali',    native: 'বাংলা' },
    { code: 'te', name: 'Telugu',     native: 'తెలుగు' },
    { code: 'mr', name: 'Marathi',    native: 'मराठी' },
    { code: 'ta', name: 'Tamil',      native: 'தமிழ்' },
    { code: 'gu', name: 'Gujarati',   native: 'ગુજરાતી' },
    { code: 'kn', name: 'Kannada',    native: 'ಕನ್ನಡ' },
    { code: 'ml', name: 'Malayalam',  native: 'മലയാളം' },
    { code: 'pa', name: 'Punjabi',    native: 'ਪੰਜਾਬੀ' },
    { code: 'or', name: 'Odia',       native: 'ଓଡ଼ିଆ' }
];

function getUiLanguageConfig(): string {
    try {
        const cfg = vscode.workspace.getConfiguration('aiAssistant');
        const c = cfg.get<string>('uiLanguage', 'en');
        return UI_LANGUAGES.some(l => l.code === c) ? c : 'en';
    } catch {
        return 'en';
    }
}

/**
 * Provider for the AI Assistant Sidebar WebviewView
 */
export class SidebarProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private extensionUri: vscode.Uri;
    private currentState: SidebarState = { mode: 'analyze', status: 'idle' };
    private stateGeneration: number = 0;
    private hasRevealed: boolean = false;
    private currentUiLanguage: string = 'en';
    /** True while a background translation request is in flight. Prevents re-entrant translate calls. */
    private _translating: boolean = false;

    /** Returns the user's currently selected UI language code (e.g. 'hi', 'en') */
    public getUiLanguage(): string { return this.currentUiLanguage; }

    // ---- Chat Discussion (Phase 2) ----
    private chatService: ChatService | undefined;

    private extensionContext?: vscode.ExtensionContext;

    constructor(extensionUri: vscode.Uri, extensionContext?: vscode.ExtensionContext) {
        this.extensionUri = extensionUri;
        this.extensionContext = extensionContext;
        // FIX: Load UI language from configuration at construction time
        this.currentUiLanguage = getUiLanguageConfig();
    }

    /**
     * Lazily create (or reuse) a ChatService for the sidebar's lifetime.
     * Called by the `chatDiscussionCommand` handler. One service per
     * sidebar lifetime means conversation state survives sidebar close/reopen
     * within the same VS Code session (per design goal).
     */
    getOrCreateChatService(context: vscode.ExtensionContext): ChatService {
        if (!this.chatService) {
            this.chatService = new ChatService(context);
        }
        return this.chatService;
    }

    /**
     * Called when the view is first opened
     */
    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ): void | Thenable<void> {
        const genAtResolve = this.stateGeneration;
        logger.info(
            `[UI DIAG] resolveWebviewView CALLED | currentState.status=${this.currentState.status}` +
            ` | generation=${genAtResolve}` +
            (this.currentState.status === 'success' && this.currentState.response
                ? ` | responseLength=${this.currentState.response.length}`
                : '')
        );

        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        webviewView.webview.html = this.getHtmlContent(this.currentState, this.currentUiLanguage);

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(
            async (message) => {
                await this.handleMessage(message);
            }
        );
        // State is already embedded in the HTML — no postMessage replay needed
    }

    /**
     * Handle messages from the webview
     */
    private async handleMessage(message: any): Promise<void> {
        const modeSnippet = this.currentState.mode;
        logger.info(
            `[UI DIAG] handleMessage RECEIVED command=${message?.command ?? 'undefined'}` +
            ` | mode=${modeSnippet}` +
            ` | currentState.status=${this.currentState.status}` +
            ` | stateGeneration=${this.stateGeneration}` +
            (this.currentState.status === 'success' ? ` | responseLength=${(this.currentState.response ?? '').length}` : '') +
            (this.currentState.mode === 'chat' ? ` | chat.messages=${this.currentState.chatMessageCount ?? 0}` : '')
        );

        switch (message.command) {
            case 'copyResponse':
                await this.copyToClipboard(message.text);
                break;

            case 'insertAtCursor':
                await this.insertAtCursor(message.text);
                break;

            case 'openSettings':
                await vscode.commands.executeCommand('aiAssistant.openSettings');
                break;

            case 'ready': {
                // Webview is ready, send current state + UI language list so the
                // dropdown is populated even if state is idle.
                const stateSnapshot = this.currentState;
                const genSnapshot = this.stateGeneration;
                logger.info(
                    `[UI DIAG] ready handler: about to replay state | status=${stateSnapshot.status}` +
                    ` | generation=${genSnapshot}` +
                    (stateSnapshot.status === 'success' ? ` | responseLength=${(stateSnapshot.response ?? '').length}` : '')
                );

                // State is already embedded in HTML — no postMessage needed
                break;
            }

            case 'setUiLanguage': {
                const code = String(message.code || 'en');
                // Guard: ignore if already this language
                if (code === this.currentUiLanguage) { break; }
                // Guard: ignore if a translation is already in flight
                if (this._translating) {
                    logger.info('[UI DIAG] setUiLanguage ignored — translation already in flight');
                    break;
                }
                this.currentUiLanguage = code;
                try {
                    // Persist FIRST so getUiLanguageConfig() returns the new value
                    // immediately when updateView re-renders the HTML.
                    const cfg = vscode.workspace.getConfiguration('aiAssistant');
                    await cfg.update('uiLanguage', code, vscode.ConfigurationTarget.Global);
                    this.currentState.uiLanguage = code;
                    // Re-render HTML with new language so dropdown shows correct selection
                    const g = ++this.stateGeneration;
                    this.updateView(this.currentState, g);
                    // Re-run the original AI request in the new language if a
                    // response is currently displayed (analyze/explain/debug etc.)
                    if (
                        this.currentState.status === 'success' &&
                        this.currentState.response &&
                        this.currentState.selection
                    ) {
                        this.translateExistingResponse(code);
                    }
                } catch (err) {
                    logger.error('[UI DIAG] Failed to persist UI language', err);
                }
                break;
            }

            // ---------- Chat Discussion (Phase 2) ----------

            case 'chatSendMessage': {
                await this.handleChatSend(String(message.text || ''));
                break;
            }

            case 'chatClearConversation': {
                if (this.chatService) {
                    this.chatService.clearConversation();
                    const conv = this.chatService.getConversation();
                    if (conv) {
                        const st = this.chatConversationToState(conv, this.currentState.action || 'Chat Discussion');
                        const gen = ++this.stateGeneration;
                        this.currentState = st;
                        this.currentState.uiLanguage = getUiLanguageConfig();
                        this.updateView(st, gen);
                    }
                }
                break;
            }

            case 'chatSaveLastAssistant': {
                const text = String(message.text || this.currentState.response || this.currentState.chatLastAssistantContent || '').trim();
                if (!text) {
                    vscode.window.showWarningMessage('Nothing to save yet.');
                    break;
                }
                const filename = (this.currentState.action || 'ai-response').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.md';
                await this.saveTextToUserFile(text, filename);
                break;
            }

            case 'chatNew': {
                // Same as clear, but also shows the context card for the
                // originally selected code (preserves codeContext in ChatService).
                if (this.chatService) {
                    this.chatService.clearConversation();
                    const conv = this.chatService.getConversation();
                    if (conv) {
                        const st = this.chatConversationToState(conv, this.currentState.action || 'Chat Discussion');
                        const gen = ++this.stateGeneration;
                        this.currentState = st;
                        this.currentState.uiLanguage = getUiLanguageConfig();
                        this.updateView(st, gen);
                    }
                }
                break;
            }

            // ---------- Existing telemetry hooks ----------

            case 'webviewReceivedUpdateState': {
                logger.info(
                    `[UI DIAG] WEBVIEW confirmed received updateState` +
                    ` | webviewGeneration=${message.generation}` +
                    ` | state.status=${message.stateStatus}` +
                    ` | accepted=${message.accepted}`
                );
                break;
            }

            case 'webviewRendered': {
                logger.info(
                    `[UI DIAG] WEBVIEW completed render()` +
                    ` | renderedStatus=${message.status}` +
                    ` | generation=${message.generation}` +
                    (typeof message.mode === 'string' ? ` | mode=${message.mode}` : '')
                );
                break;
            }

            case 'webviewRenderError': {
                logger.error(
                    `[UI DIAG] WEBVIEW render() THREW EXCEPTION` +
                    ` | generation=${message.generation}` +
                    ` | error=${String(message.message ?? '(none)').slice(0, 400)}`
                );
                break;
            }

            case 'webviewTopLevelError': {
                logger.error(
                    `[UI DIAG] WEBVIEW TOP-LEVEL EXCEPTION in message handler` +
                    ` | error=${String(message.message ?? '(none)').slice(0, 400)}`
                );
                break;
            }
        }
    }

    /**
     * Show loading state
     */
    showLoading(action: string, selection: SelectionInfo, provider: string, model: string): void {
        this.currentState = {
            mode: 'analyze',
            uiLanguage: getUiLanguageConfig(),
            status: 'loading',
            action,
            provider,
            model,
            selection: {
                fileName: selection.fileName,
                languageId: selection.languageId,
                lineCount: selection.lineCount
            }
        };
        const gen = ++this.stateGeneration;

        logger.info(
            `[UI DIAG] showLoading called | state set to loading` +
            ` | generation=${gen}`
        );

        // Force the AI Assistant sidebar to open FIRST (even if collapsed or
        // never opened before). This triggers resolveWebviewView, which
        // assigns this.view so subsequent postMessage calls succeed.
        this.hasRevealed = false;
        this.reveal().then(() => {
            this.hasRevealed = true;
            // After reveal, push the latest state (again, in case the webview
            // JS listener attached after our earlier updateView was skipped).
            // Always use the LATEST generation (this.stateGeneration) so
            // reveal.then callbacks never overwrite a newer state with a
            // stale one — critical if Groq returned faster than the 60ms.
            const latestGen = this.stateGeneration;
            logger.info(
                `[UI DIAG] showLoading reveal.then firing` +
                ` | currentState.status=${this.currentState.status}` +
                ` | usingLatestGeneration=${latestGen}`
            );
            this.updateView(this.currentState, latestGen);
        });
        this.updateView(this.currentState, gen);
    }

    /**
     * Show success response
     */
    showResponse(action: string, selection: SelectionInfo, aiResponse: AIResponse): void {
        // Format response to safe HTML HERE IN TYPESCRIPT (not inside the
        // webview inline script). This avoids nested-template-literal escape
        // conflicts and means the webview only has to insert the rendered
        // HTML string — no markdown parsing on the client side.
        const renderedHtml = this.renderMarkdownToSafeHtml(aiResponse.content);

        this.currentState = {
            mode: 'analyze',
            uiLanguage: getUiLanguageConfig(),
            status: 'success',
            action,
            provider: aiResponse.provider,
            model: aiResponse.model,
            selection: {
                fileName: selection.fileName,
                languageId: selection.languageId,
                lineCount: selection.lineCount
            },
            response: aiResponse.content
        };
        // Attach pre-rendered HTML as a transient side-channel field (SidebarState
        // interface only declares `response`, so type-assert to carry this).
        (this.currentState as any).responseHtml = renderedHtml;
        (this.currentState as any).charCount = aiResponse.content ? aiResponse.content.length : 0;

        const gen = ++this.stateGeneration;

        const responseLen = aiResponse.content?.length ?? 0;
        logger.info(
            `[UI DIAG] showResponse called | state set to success` +
            ` | generation=${gen}` +
            ` | responseLength=${responseLen}` +
            ` | tokensUsed=${aiResponse.tokensUsed ?? 'n/a'}` +
            ` | hasRevealed=${this.hasRevealed} | viewExists=${!!this.view}`
        );

        // Sync push first — if the webview listener is already attached
        // (from the earlier showLoading → reveal), this is sufficient.
        this.updateView(this.currentState, gen);

        // Only call reveal() if the sidebar may not be open.
        // If hasRevealed === true AND this.view exists, the webview is
        // already initialized and we MUST NOT force re-focus, because
        // focus/resolveWebviewView can re-instantiate the webview HTML,
        // wiping the in-flight success state and re-triggering a 'ready'
        // replay of whatever state snapshot was captured at resolve time.
        // This is the ROOT-CAUSE FIX for the "stuck on loading" bug.
        if (!this.hasRevealed || !this.view) {
            logger.info(`[UI DIAG] showResponse calling reveal() (sidebar not yet ready)`);
            this.reveal().then(() => {
                this.hasRevealed = true;
                const latestGen = this.stateGeneration;
                logger.info(
                    `[UI DIAG] showResponse reveal.then firing` +
                    ` | currentState.status=${this.currentState.status}` +
                    ` | responseLength=${(this.currentState.response ?? '').length}` +
                    ` | usingLatestGeneration=${latestGen}`
                );
                this.updateView(this.currentState, latestGen);
            });
        } else {
            logger.info(
                `[UI DIAG] showResponse SKIPPED redundant reveal()` +
                ` — sidebar already open, avoiding webview re-init race.`
            );
        }

        // Belt-and-suspenders: send the SUCCESS state once more after a
        // short delay. This guards against the specific case where the sync
        // updateView() above ran concurrently with the webview JS listener being
        // compiled/attached by the browser microtask queue. Because the webview
        // message listener rejects stale generations, posting the SAME generation is
        // safe — the webview will simply accept the duplicate.
        const genAfterDelay = gen;
        const snapshot = this.currentState;
        setTimeout(() => {
            if (this.currentState === snapshot && this.view) {
                logger.info(
                    `[UI DIAG] showResponse delayed re-push (belt-and-suspenders)` +
                    ` | generation=${genAfterDelay} | status=${snapshot.status}`
                );
                this.updateView(snapshot, genAfterDelay);
            }
        }, 20);
    }

    /**
     * Show error state
     */
    showError(action: string, error: string): void {
        this.currentState = {
            mode: this.currentState.mode || 'analyze',
            uiLanguage: getUiLanguageConfig(),
            status: 'error',
            action,
            error
        };
        const gen = ++this.stateGeneration;

        logger.info(
            `[UI DIAG] showError called | state set to error` +
            ` | generation=${gen}` +
            ` | message=${error.slice(0, 80)}`
        );

        // Sync push first.
        this.updateView(this.currentState, gen);

        // Same race-safe reveal guard as showResponse.
        if (!this.hasRevealed || !this.view) {
            logger.info(`[UI DIAG] showError calling reveal() (sidebar not yet ready)`);
            this.reveal().then(() => {
                this.hasRevealed = true;
                const latestGen = this.stateGeneration;
                logger.info(
                    `[UI DIAG] showError reveal.then firing` +
                    ` | currentState.status=${this.currentState.status}` +
                    ` | usingLatestGeneration=${latestGen}`
                );
                this.updateView(this.currentState, latestGen);
            });
        } else {
            logger.info(
                `[UI DIAG] showError SKIPPED redundant reveal()` +
                ` — sidebar already open, avoiding webview re-init race.`
            );
        }

        // Belt-and-suspenders: delayed re-push (same logic as showResponse)
        const genAfterDelayErr = gen;
        const snapshotErr = this.currentState;
        setTimeout(() => {
            if (this.currentState === snapshotErr && this.view) {
                logger.info(
                    `[UI DIAG] showError delayed re-push (belt-and-suspenders)` +
                    ` | generation=${genAfterDelayErr} | status=${snapshotErr.status}`
                );
                this.updateView(snapshotErr, genAfterDelayErr);
            }
        }, 20);
    }

    // =====================================================================
    // Phase 2 — Chat Discussion
    // =====================================================================

    /**
     * Show an initialized Chat Discussion in the sidebar.
     *
     * This is the "entry point" called by `chatDiscussionCommand` after a
     * successful selection + provider + model resolution. It:
     *   - Builds the initial chat SidebarState (mode='chat', status='idle')
     *   - Attaches a pre-rendered code-context card + empty message list
     *   - Reveals the sidebar (with the same race guards as analyze code)
     *   - Uses the 20ms belt-and-suspenders re-push for attach-timing safety
     */
    showChatConversation(
        action: string,
        selection: SelectionInfo,
        provider: string,
        model: string,
        conversation: ChatConversation
    ): void {
        const state = this.chatConversationToState(conversation, action);
        state.uiLanguage = getUiLanguageConfig();

        this.currentState = state;
        const gen = ++this.stateGeneration;

        logger.info(
            `[UI DIAG] showChatConversation called` +
            ` | generation=${gen}` +
            ` | messages=${state.chatMessageCount ?? 0}` +
            ` | hasRevealed=${this.hasRevealed} | viewExists=${!!this.view}`
        );

        this.updateView(state, gen);

        if (!this.hasRevealed || !this.view) {
            logger.info(`[UI DIAG] showChatConversation calling reveal()`);
            this.reveal().then(() => {
                this.hasRevealed = true;
                const latestGen = this.stateGeneration;
                logger.info(
                    `[UI DIAG] showChatConversation reveal.then firing` +
                    ` | usingLatestGeneration=${latestGen}`
                );
                this.updateView(this.currentState, latestGen);
            });
        } else {
            logger.info(`[UI DIAG] showChatConversation SKIPPED redundant reveal()`);
        }

        // 20ms belt-and-suspenders re-push
        const snap = this.currentState;
        const genAfter = gen;
        setTimeout(() => {
            if (this.currentState === snap && this.view) {
                logger.info(
                    `[UI DIAG] showChatConversation delayed re-push` +
                    ` | generation=${genAfter}`
                );
                this.updateView(snap, genAfter);
            }
        }, 20);
    }

    /**
     * Build a SidebarState (mode='chat') snapshot from a ChatConversation.
     *
     * All message HTML rendering is done HERE in TypeScript, outside of any
     * template-literal scope, so there are zero backtick/regex parser
     * conflicts. The webview just inserts the pre-rendered strings.
     */
    private chatConversationToState(
        conversation: ChatConversation,
        action: string
    ): SidebarState {
        let codeCtx: SidebarState['chatCodeContext'] = undefined;
        if (conversation.codeContext) {
            const ctx = conversation.codeContext;
            // Render a truncated code preview (max 60 lines / 6000 chars).
            const full = ctx.selectedCode;
            const lines = full.split(/\r?\n/);
            const MAX_LINES = 60;
            const MAX_CHARS = 6000;
            let shown = lines.slice(0, MAX_LINES).join('\n');
            let truncated = lines.length > MAX_LINES;
            if (shown.length > MAX_CHARS) {
                shown = shown.slice(0, MAX_CHARS);
                truncated = true;
            }
            const previewHtml = this.escapeAttrTiny(shown) +
                (truncated ? '<div style="opacity:.65;font-size:11px;margin-top:4px;">… (preview truncated, see editor for full context)</div>' : '');
            codeCtx = {
                fileName: ctx.fileName,
                languageId: ctx.languageId,
                languageName: ctx.languageName,
                lineCount: ctx.lineCount,
                selectedCodePreviewHtml:
                    '<pre style="margin:0;padding:8px 10px;overflow-x:auto;max-height:190px;overflow-y:auto;' +
                    'background:var(--vscode-textCodeBlock-background,#2d2d2d);' +
                    'border:1px solid var(--vscode-panel-border,#3c3c3c);' +
                    'border-radius:6px;' +
                    'white-space:pre;word-wrap:normal;font:var(--vscode-editor-font-family),Consolas,monospace;font-size:11.5px;line-height:1.45;">' +
                    previewHtml +
                    '</pre>'
            };
        }

        const chatMessagesHtml = this.renderChatMessagesToHtml(conversation.messages);
        let lastAssistantContent = '';
        for (let i = conversation.messages.length - 1; i >= 0; i--) {
            const m = conversation.messages[i];
            if (m.role === 'assistant' && !m.pending && m.content && m.content.trim()) {
                lastAssistantContent = m.content;
                break;
            }
        }

        const chatStatus: SidebarState['chatStatus'] =
            (conversation.status === 'sending') ? 'sending' :
            (conversation.status === 'error') ? 'error' : 'idle';

        const status: SidebarState['status'] =
            conversation.messages.length === 0 ? 'idle' :
            chatStatus === 'sending' ? 'loading' :
            chatStatus === 'error' ? 'error' : 'success';

        const state: SidebarState = {
            mode: 'chat',
            status,
            action,
            provider: conversation.providerName,
            model: conversation.model,
            chatStatus,
            chatCodeContext: codeCtx,
            chatMessagesHtml,
            chatMessageCount: conversation.messages.length,
            chatLastAssistantContent: lastAssistantContent,
            chatReady: true
        };
        return state;
    }

    /**
     * Render a ChatMessage[] → a pre-built HTML string (one chat-bubble
     * per message). Because this runs in pure TypeScript (not inside a TS
     * template literal), we are free to use strings without any template
     * parser conflicts. Security: all user/assistant TEXT content is
     * HTML-escaped BEFORE the HTML wrapper is added. Markdown formatting
     * of assistant messages uses the same renderMarkdownToSafeHtml we use
     * for Analyze Code.
     */
    private renderChatMessagesToHtml(messages: ChatMessage[]): string {
        const out: string[] = [];
        if (!messages || messages.length === 0) {
            out.push(
                '<div class="chat-empty-hint">' +
                'Ask your first question about the selected code above.' +
                '</div>'
            );
            return out.join('');
        }

        for (const m of messages) {
            if (!m) continue;
            const ts = this.formatTime(m.timestamp);
            if (m.role === 'user') {
                const safe = this.escapeAttrTiny(m.content);
                out.push(
                    '<div class="chat-msg chat-msg-user">' +
                        '<div class="chat-msg-avatar chat-avatar-user">U</div>' +
                        '<div class="chat-msg-bubble chat-bubble-user">' +
                            '<div class="chat-msg-text">' + safe + '</div>' +
                            '<div class="chat-msg-time">' + ts + '</div>' +
                        '</div>' +
                    '</div>'
                );
                continue;
            }
            // assistant
            if (m.errorMessage && !m.content) {
                const errSafe = this.escapeAttrTiny(m.errorMessage);
                out.push(
                    '<div class="chat-msg chat-msg-assistant">' +
                        '<div class="chat-msg-avatar chat-avatar-ai">AI</div>' +
                        '<div class="chat-msg-bubble chat-bubble-assistant chat-bubble-error">' +
                            '<div class="chat-msg-error-title">Request failed</div>' +
                            '<div class="chat-msg-error-text">' + errSafe + '</div>' +
                            '<div class="chat-msg-time">' + ts + '</div>' +
                        '</div>' +
                    '</div>'
                );
                continue;
            }
            if (m.pending) {
                out.push(
                    '<div class="chat-msg chat-msg-assistant">' +
                        '<div class="chat-msg-avatar chat-avatar-ai">AI</div>' +
                        '<div class="chat-msg-bubble chat-bubble-assistant">' +
                            '<div class="chat-thinking">' +
                                '<span class="chat-thinking-dot"></span>' +
                                '<span class="chat-thinking-dot"></span>' +
                                '<span class="chat-thinking-dot"></span>' +
                                '<span class="chat-thinking-text">Thinking...</span>' +
                            '</div>' +
                            '<div class="chat-msg-time">' + ts + '</div>' +
                        '</div>' +
                    '</div>'
                );
                continue;
            }
            // Success: use renderMarkdownToSafeHtml for markdown rendering
            const bodyHtml = m.content ? this.renderMarkdownToSafeHtml(m.content) : '';
            out.push(
                '<div class="chat-msg chat-msg-assistant">' +
                    '<div class="chat-msg-avatar chat-avatar-ai">AI</div>' +
                    '<div class="chat-msg-bubble chat-bubble-assistant">' +
                        '<div class="chat-msg-text chat-msg-markdown">' +
                            bodyHtml +
                        '</div>' +
                        '<div class="chat-msg-time">' + ts + '</div>' +
                    '</div>' +
                '</div>'
            );
        }
        return out.join('');
    }

    /**
     * Very small / safe HTML escaper used by chat rendering helpers.
     * We don't use regex; pure indexOf / split-join, no backtick literal
     * references anywhere.
     */
    private escapeAttrTiny(s: string): string {
        if (!s) return '';
        let r = String(s);
        const pairs: Array<[string, string]> = [
            ['&', '&amp;'],
            ['<', '&lt;'],
            ['>', '&gt;'],
            ['"', '&quot;'],
            ["'", '&#39;'],
            ['/', '&#47;']
        ];
        for (const [n, rep] of pairs) {
            if (r.indexOf(n) !== -1) r = r.split(n).join(rep);
        }
        return r;
    }

    /** Format an ISO-8601 timestamp to a compact HH:MM (local) string. */
    private formatTime(iso: string | undefined): string {
        if (!iso) return '';
        try {
            const d = new Date(iso);
            if (isNaN(d.getTime())) return '';
            const hh = String(d.getHours()).padStart(2, '0');
            const mm = String(d.getMinutes()).padStart(2, '0');
            return `${hh}:${mm}`;
        } catch {
            return '';
        }
    }

    /**
     * Handle the webview sending "chatSendMessage" with raw text.
     * Calls ChatService.sendUserMessage(), which appends both the user
     * message and a pending assistant placeholder. Then immediately pushes
     * the "sending" state to the webview so the user sees their own bubble
     * + "Thinking..." while waiting. Once the async response comes back,
     * ChatService replaces the pending bubble with the real response and
     * bumps the conversation.generation; we push the final state again.
     *
     * The request is fully race-guarded via the shared SidebarProvider
     * stateGeneration monotonic counter; if two async responses somehow
     * overlap, the newest generation wins.
     */
    private async handleChatSend(rawText: string): Promise<void> {
        if (!this.chatService) {
            vscode.window.showWarningMessage('No active chat. Start Chat Discussion first by selecting code.');
            return;
        }
        const text = typeof rawText === 'string' ? rawText : '';
        if (!text || !text.trim()) return;

        const conv = this.chatService.getConversation();
        if (conv && conv.status === 'sending') {
            vscode.window.showInformationMessage('Still thinking — please wait for the previous response.');
            return;
        }

        // Kick off turn (synchronous: appends user + pending, returns updated
        // conv before awaiting provider). Then push the "sending" snapshot.
        let intermediate: ChatConversation | undefined;
        try {
            // Append user + pending synchronously — sendUserMessage does this
            // as the first two steps. We get a promise here; we push the
            // "sending" view by reading a copy of getConversation() after
            // the synchronous portion has run (it runs as a microtask before
            // the first await inside sendUserMessage).
            const promise = this.chatService.sendUserMessage(text, this.currentUiLanguage);
            // Immediately take a sending snapshot (append was done sync)
            const afterAppend = this.chatService.getConversation();
            if (afterAppend) {
                intermediate = afterAppend;
                const st = this.chatConversationToState(afterAppend, this.currentState.action || 'Chat Discussion');
                st.uiLanguage = getUiLanguageConfig();
                const g = ++this.stateGeneration;
                this.currentState = st;
                this.updateView(st, g);
                setTimeout(() => {
                    if (this.currentState === st && this.view) {
                        this.updateView(st, g);
                    }
                }, 20);
            }
            const result = await promise;
            const stFinal = this.chatConversationToState(result, this.currentState.action || 'Chat Discussion');
            stFinal.uiLanguage = getUiLanguageConfig();
            const gFinal = ++this.stateGeneration;
            this.currentState = stFinal;
            this.updateView(stFinal, gFinal);
            setTimeout(() => {
                if (this.currentState === stFinal && this.view) {
                    this.updateView(stFinal, gFinal);
                }
            }, 20);
        } catch (err: any) {
            logger.error('[Chat UI] handleChatSend outer error.', err);
            const after = this.chatService.getConversation();
            if (after) {
                const st = this.chatConversationToState(after, this.currentState.action || 'Chat Discussion');
                st.uiLanguage = getUiLanguageConfig();
                const g = ++this.stateGeneration;
                this.currentState = st;
                this.updateView(st, g);
            }
        }
    }

    /**
     * Open the native VS Code file-save dialog and write `content` to the
     * user-chosen location. If the user cancels, nothing is written.
     * SECURITY: We never silently write files; the user must approve.
     */
    private async saveTextToUserFile(content: string, suggestedName: string): Promise<void> {
        try {
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(suggestedName),
                filters: {
                    'Markdown': ['md', 'markdown'],
                    'Text': ['txt'],
                    'All Files': ['*']
                }
            });
            if (!uri) return;
            const data = Buffer.from(content, 'utf8');
            await vscode.workspace.fs.writeFile(uri, data);
            vscode.window.showInformationMessage(`Saved to ${uri.fsPath}`);
            logger.info(`Saved AI response to user file: ${uri.fsPath} (${content.length} chars)`);
        } catch (err) {
            logger.error('Failed to save file.', err);
            vscode.window.showErrorMessage(`Save failed: ${(err as Error)?.message || err}`);
        }
    }

    /**
     * Update the webview with new state.
     * The `generation` parameter is a monotonically increasing counter that
     * the webview JS uses to reject stale/raced messages. A message with a
     * lower generation than the last one the webview processed is ignored.
     */
    private updateView(state: SidebarState, generation: number): void {
        if (!this.view) {
            logger.info(
                `[UI DIAG] updateView SKIPPED | this.view is undefined` +
                ` | state.status=${state.status} | generation=${generation}`
            );
            return;
        }

        logger.info(
            `[UI DIAG] updateView re-setting HTML` +
            ` | generation=${generation}` +
            ` | state.status=${state.status}` +
            (state.status === 'success' ? ` | responseLength=${(state.response ?? '').length}` : '')
        );

        // Directly embed state in fresh HTML — most reliable approach in VS Code webviews.
        // postMessage can be dropped if the webview script hasn't fully started yet.
        this.view.webview.html = this.getHtmlContent(state, this.currentUiLanguage);
    }

    /**
     * Reveal the AI Assistant sidebar and ensure it is focused.
     *
     * Uses `aiAssistant.sidebar.focus` command (auto-registered by VS Code
     * from package.json `views`). This works even when the AI Assistant
     * container in the Activity Bar is collapsed: it expands the container
     * and forces resolveWebviewView to run, assigning this.view.
     *
     * The old `this.view?.show(true)` approach silently failed if the
     * view was never resolved (before any manual user click).
     */
    private async reveal(): Promise<void> {
        try {
            await vscode.commands.executeCommand('aiAssistant.sidebar.focus');
        } catch (e) {
            logger.warn(`Could not focus aiAssistant.sidebar: ${(e as Error)?.message || e}`);
        }

        // The above focus command triggers resolveWebviewView, which sets
        // this.view asynchronously. Give VS Code ~2 frames to complete that
        // before the caller re-pushes state.
        await new Promise<void>(r => setTimeout(r, 60));
    }

    /**
     * Copy text to clipboard
     */
    private async translateExistingResponse(targetLang: string): Promise<void> {
        if (!this.currentState.response || this.currentState.status !== 'success' || !this.extensionContext) { return; }
        // Re-entrant guard: only one translation in flight at a time
        if (this._translating) { return; }
        this._translating = true;

        // Snapshot everything we need NOW before any await changes state
        const snapshotResponse = this.currentState.response;
        const snapshotSelection = this.currentState.selection;
        const previousAction = this.currentState.action;
        const previousState = { ...this.currentState };

        try {
            // Show loading spinner while translating
            this.currentState.status = 'loading';
            this.currentState.action = `Translating to ${PromptService.getLanguageName(targetLang)}...`;
            const gLoad = ++this.stateGeneration;
            this.updateView(this.currentState, gLoad);

            const aiService = new AIService(this.extensionContext);
            const langName = PromptService.getLanguageName(targetLang);

            // Build a strong, structured translation prompt using the snapshot
            const prompt = [
                `You are translating an AI code analysis result into ${langName}.`,
                ``,
                `RULES:`,
                `1. Translate ALL explanatory prose, headings, bullet points, and descriptions into ${langName}.`,
                `2. Keep ALL code blocks exactly as-is — do NOT translate code.`,
                `3. Keep ALL inline code references in English (e.g. \`items[i].price\`, \`Array.reduce\`).`,
                `4. Keep ALL variable names, function names, and keywords in English.`,
                `5. Do NOT add comments in ${langName} inside code blocks.`,
                `6. Preserve all markdown formatting (###, **, -, \`\`\`language blocks, etc.).`,
                ``,
                `CORRECT example output in ${langName === 'Hindi' ? 'Hindi' : langName}:`,
                `"यह \`reduce()\` function \`items\` array को iterate करता है।"`,
                ``,
                `WRONG example:`,
                `"यह रिड्यूस फंक्शन आइटम्स को iterate करता है।" ← Never translate code identifiers.`,
                ``,
                `TEXT TO TRANSLATE:`,
                `---`,
                snapshotResponse,
                `---`,
                ``,
                `Now provide the full translated text in ${langName}, preserving all markdown and code blocks:`
            ].join('\n');

            const resp = await aiService.generate({
                prompt,
                temperature: 0.2,
                maxTokens: 4096
            });

            // Check if the language was changed again while we were awaiting
            // If so, discard this stale result — the newer request will arrive
            if (this.currentUiLanguage !== targetLang) {
                logger.info(`[UI DIAG] Translation for '${targetLang}' discarded — language changed to '${this.currentUiLanguage}' while in flight`);
                return;
            }

            if (resp && resp.content && resp.content.trim().length > 0) {
                const renderedHtml = this.renderMarkdownToSafeHtml(resp.content);
                this.currentState.status = 'success';
                this.currentState.action = previousAction;
                this.currentState.response = resp.content;
                this.currentState.uiLanguage = targetLang;
                (this.currentState as any).responseHtml = renderedHtml;
                const g = ++this.stateGeneration;
                this.updateView(this.currentState, g);
                logger.info(`[UI DIAG] Translation to '${targetLang}' complete, ${resp.content.length} chars`);
            } else {
                throw new Error('Empty response from provider');
            }
        } catch (err: any) {
            logger.warn(`[UI DIAG] Translation failed: ${err?.message || err}`);
            vscode.window.showErrorMessage(`Translation to ${PromptService.getLanguageName(targetLang)} failed: ${err?.message || 'Unknown error'}`);
            // Restore previous success state cleanly
            this.currentState = { ...previousState };
            this.currentState.uiLanguage = targetLang; // keep the dropdown on the chosen lang
            const g = ++this.stateGeneration;
            this.updateView(this.currentState, g);
        } finally {
            this._translating = false;
        }
    }

private async copyToClipboard(text: string): Promise<void> {
        try {
            await vscode.env.clipboard.writeText(text);
            vscode.window.showInformationMessage('Copied to clipboard!');
            logger.info('Response copied to clipboard');
        } catch (error) {
            logger.error('Failed to copy to clipboard', error);
            vscode.window.showErrorMessage('Failed to copy to clipboard');
        }
    }

    /**
     * Insert text at cursor position
     */
    private async insertAtCursor(text: string): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        try {
            await editor.edit(editBuilder => {
                editBuilder.insert(editor.selection.active, text);
            });
            vscode.window.showInformationMessage('Inserted at cursor!');
            logger.info('Response inserted at cursor');
        } catch (error) {
            logger.error('Failed to insert at cursor', error);
            vscode.window.showErrorMessage('Failed to insert text');
        }
    }

    /**
     * Strips reasoning-trace blocks (`<think>…</think>`) that some models
     * (e.g. DeepSeek-R1, gpt-oss reasoning variants) emit before the answer.
     */
    private stripReasoningTrace(text: string): string {
        return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    }

    /**
     * Render markdown → safe HTML using `marked` (full GFM parser) +
     * `DOMPurify` (sanitiser). Replaces the previous hand-rolled parser so
     * nested lists, tables, code fences, inline code, etc. all render
     * correctly. Reasoning traces are stripped before parsing.
     */
    private renderMarkdownToSafeHtml(raw: string | undefined | null): string {
        if (raw == null) return '';
        let text = String(raw);

        // Strip <think>…</think> reasoning traces (applied uniformly)
        text = this.stripReasoningTrace(text);

        if (!text) return '';

        // Parse markdown to HTML (synchronous mode)
        const rawHtml = marked.parse(text, { async: false }) as string;

        // Sanitize the HTML for safe insertion into the webview
        let safeHtml = DOMPurify.sanitize(rawHtml, {
            ALLOWED_TAGS: [
                'b', 'i', 'em', 'strong', 'a', 'p',
                'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                'ul', 'ol', 'li',
                'code', 'pre', 'blockquote',
                'br', 'hr', 'div', 'span',
                'table', 'thead', 'tbody', 'tr', 'th', 'td',
                'del', 'ins', 'sub', 'sup'
            ],
            ALLOWED_ATTR: ['href', 'title', 'class', 'target', 'rel', 'onclick']
        });

        // Wrap code blocks in styled containers with Copy buttons
        safeHtml = this.wrapCodeBlocks(safeHtml);

        return safeHtml;
    }

    /**
     * Wrap code blocks with enhanced UI: header with language + Copy button.
     * Ensures no markdown fence artifacts leak into the rendered code.
     */
    private wrapCodeBlocks(html: string): string {
        // Match <pre><code class="language-xyz">...</code></pre> blocks
        return html.replace(
            /<pre><code(?:\s+class="language-([^"]*)")?>([\s\S]*?)<\/code><\/pre>/g,
            (match, lang, code) => {
                const langDisplay = lang ? lang.toUpperCase() : 'CODE';
                // Decode HTML entities in code to get plain text
                const decoded = code
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&amp;/g, '&')
                    .replace(/&quot;/g, '"')
                    .replace(/&#39;/g, "'");
                
                // Re-encode for safe display
                const safeCode = decoded
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');
                
                return `<div class="code-block">` +
                    `<div class="code-header">` +
                        `<span class="code-lang">${langDisplay}</span>` +
                        `<button class="copy-btn" onclick="copyCodeBlock(this)">📋 Copy</button>` +
                    `</div>` +
                    `<pre><code>${safeCode}</code></pre>` +
                `</div>`;
            }
        );
    }

    /**
     * Generate HTML content for the sidebar
     */
    
    private getHtmlContent(state?: SidebarState, uiLang?: string): string {
        const langCode = uiLang || 'en';
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:;">
    <title>AI Assistant</title>
    <style>
        /* Theme Variables - Dark (default) */
        :root {
            --bg: #0d1117;
            --bg-secondary: #161b22;
            --text: #e6edf3;
            --text-secondary: #8b949e;
            --border: #30363d;
            --accent: #2f81f7;
            --accent-hover: #1f6feb;
            
            /* Code Colors */
            --code-bg: #0d1117;
            --code-border: #30363d;
            --code-text: #4ade80;
            --code-header-bg: #161b22;
            --copy-btn-bg: #238636;
            --copy-btn-hover: #2ea043;
            --copy-btn-text: #ffffff;
            
            /* Chat Bubbles */
            --user-bubble-bg: #c084fc;
            --user-bubble-text: #ffffff;
            --ai-bubble-bg: #161b22;
            --ai-bubble-text: #e6edf3;
            --ai-bubble-border: #30363d;
            
            /* Buttons */
            --btn-bg: #21262d;
            --btn-hover: #30363d;
            --btn-text: #c9d1d9;
        }

        /* Theme Variables - Light */
        body.light {
            --bg: #ffffff;
            --bg-secondary: #f6f8fa;
            --text: #1f2328;
            --text-secondary: #656d76;
            --border: #d0d7de;
            --accent: #0969da;
            --accent-hover: #0550ae;
            
            /* Code Colors - Light */
            --code-bg: #f6f8fa;
            --code-border: #d0d7de;
            --code-text: #1a7f37;
            --code-header-bg: #ffffff;
            --copy-btn-bg: #1a7f37;
            --copy-btn-hover: #2da44e;
            --copy-btn-text: #ffffff;
            
            /* Chat Bubbles - Light */
            --user-bubble-bg: #a855f7;
            --user-bubble-text: #ffffff;
            --ai-bubble-bg: #f6f8fa;
            --ai-bubble-text: #1f2328;
            --ai-bubble-border: #d0d7de;
            
            /* Buttons - Light */
            --btn-bg: #f6f8fa;
            --btn-hover: #eaeef2;
            --btn-text: #1f2328;
        }

        *, *::before, *::after {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Segoe UI Variable", Helvetica, Arial, sans-serif;
            color: var(--text);
            background: var(--bg);
            line-height: 1.6;
            overflow-y: auto;
            font-size: 14px;
            min-width: 320px;
        }

        #app {
            display: flex;
            flex-direction: column;
            min-height: 100vh;
            width: 100%;
        }

        /* Header Styles */
        .header {
            padding: 16px;
            border-bottom: 1px solid var(--border);
            background: var(--bg-secondary);
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 12px;
        }

        .header-title {
            font-size: 18px;
            font-weight: 700;
            color: var(--text);
        }

        .header-actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }

        .btn {
            background: var(--btn-bg);
            border: 1px solid var(--border);
            color: var(--btn-text);
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 12px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.15s ease;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            white-space: nowrap;
        }

        .btn:hover {
            background: var(--btn-hover);
            border-color: var(--accent);
        }

        .btn:active {
            transform: scale(0.97);
        }

        /* Language Selector */
        .lang-selector {
            padding: 12px 16px;
            border-bottom: 1px solid var(--border);
            background: var(--bg);
        }

        .lang-select {
            width: 100%;
            background: var(--bg-secondary);
            color: var(--text);
            border: 1px solid var(--border);
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 13px;
            cursor: pointer;
            outline: none;
        }

        .lang-select:focus {
            border-color: var(--accent);
            box-shadow: 0 0 0 2px rgba(47, 129, 247, 0.1);
        }

        /* Content Area */
        .content {
            flex: 1;
            padding: 16px;
            overflow-y: auto;
            overflow-x: hidden;
        }

        /* Response Styles */
        .resp {
            font-size: 14px;
            line-height: 1.7;
            color: var(--text);
            word-wrap: break-word;
            overflow-wrap: break-word;
        }

        .resp p {
            margin: 0 0 14px;
        }

        .resp h1, .resp h2, .resp h3, .resp h4 {
            margin: 20px 0 10px;
            color: var(--text);
            font-weight: 700;
        }

        .resp h1 { font-size: 24px; }
        .resp h2 { font-size: 20px; }
        .resp h3 { font-size: 18px; }

        .resp ul, .resp ol {
            padding-left: 24px;
            margin: 0 0 14px;
        }

        .resp li {
            margin-bottom: 6px;
            color: var(--text);
        }

        .resp strong {
            font-weight: 700;
            color: var(--text);
        }

        /* Inline Code */
        .resp code:not(pre code) {
            background: var(--code-header-bg);
            border: 1px solid var(--code-border);
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 13px;
            color: var(--code-text);
            font-weight: 600;
        }

        /* Code Block Container */
        .code-block {
            margin: 20px 0;
            border: 2px solid var(--code-border);
            border-radius: 10px;
            overflow: hidden;
            background: var(--code-bg);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .code-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 16px;
            background: var(--code-header-bg);
            border-bottom: 2px solid var(--code-border);
        }

        .code-lang {
            font-size: 12px;
            font-weight: 700;
            color: var(--text-secondary);
            font-family: 'Consolas', 'Monaco', monospace;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .copy-btn {
            background: var(--copy-btn-bg);
            border: none;
            color: var(--copy-btn-text);
            padding: 6px 14px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }

        .copy-btn:hover {
            background: var(--copy-btn-hover);
            transform: translateY(-1px);
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
        }

        .copy-btn:active {
            transform: translateY(0);
        }

        .copy-btn.copied {
            background: #2ea043;
        }

        .code-block pre {
            margin: 0 !important;
            padding: 18px !important;
            overflow-x: auto !important;
            background: var(--code-bg) !important;
            font-size: 13px !important;
            line-height: 1.6 !important;
        }

        .code-block pre::-webkit-scrollbar {
            height: 8px;
        }

        .code-block pre::-webkit-scrollbar-track {
            background: var(--code-header-bg);
        }

        .code-block pre::-webkit-scrollbar-thumb {
            background: var(--border);
            border-radius: 4px;
        }

        .code-block code {
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace !important;
            font-size: 13px !important;
            color: var(--code-text) !important;
            background: transparent !important;
            white-space: pre !important;
            display: block !important;
            line-height: 1.6 !important;
            font-weight: 500 !important;
        }

        /* Chat Container - ChatGPT Style */
        .chat-container {
            display: flex;
            flex-direction: column;
            gap: 16px;
            padding: 8px 0;
        }

        /* Chat Message Wrapper */
        .chat-msg {
            display: flex;
            gap: 12px;
            width: 100%;
            animation: slideIn 0.3s ease;
        }

        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateY(10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        /* User Message - Right Side with Purple */
        .chat-msg-user {
            justify-content: flex-end;
        }

        .chat-msg-user .chat-msg-bubble {
            background: var(--user-bubble-bg);
            color: var(--user-bubble-text);
            border: none;
            max-width: 80%;
            margin-left: auto;
        }

        /* AI Message - Left Side with Gray */
        .chat-msg-assistant {
            justify-content: flex-start;
        }

        .chat-msg-assistant .chat-msg-bubble {
            background: var(--ai-bubble-bg);
            color: var(--ai-bubble-text);
            border: 1px solid var(--ai-bubble-border);
            max-width: 85%;
        }

        .chat-msg-bubble {
            padding: 14px 16px;
            border-radius: 12px;
            font-size: 14px;
            line-height: 1.6;
            word-wrap: break-word;
            overflow-wrap: break-word;
        }

        .chat-msg-text {
            margin-bottom: 6px;
        }

        .chat-msg-time {
            font-size: 11px;
            opacity: 0.7;
            margin-top: 6px;
        }

        /* Error Messages */
        .chat-msg-error-title {
            font-weight: 700;
            color: #f87171;
            margin-bottom: 6px;
        }

        .chat-msg-error-text {
            color: #fca5a5;
            font-size: 13px;
        }

        .chat-bubble-error {
            background: #2d1515 !important;
            border: 1px solid #f87171 !important;
        }

        /* Chat Input Box */
        .chat-input-box {
            display: flex;
            gap: 10px;
            padding: 14px 16px;
            border-top: 2px solid var(--border);
            background: var(--bg-secondary);
            position: sticky;
            bottom: 0;
            margin-top: auto;
        }

        .chat-input {
            flex: 1;
            background: var(--bg);
            color: var(--text);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 10px 14px;
            font-size: 14px;
            outline: none;
            resize: none;
            min-height: 42px;
            max-height: 120px;
            font-family: inherit;
            line-height: 1.5;
        }

        .chat-input:focus {
            border-color: var(--accent);
            box-shadow: 0 0 0 2px rgba(47, 129, 247, 0.1);
        }

        .chat-input::placeholder {
            color: var(--text-secondary);
        }

        .chat-send-btn {
            background: var(--accent);
            border: none;
            color: #ffffff;
            padding: 10px 20px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            align-self: flex-end;
            height: 42px;
            transition: all 0.2s ease;
            white-space: nowrap;
        }

        .chat-send-btn:hover {
            background: var(--accent-hover);
            transform: translateY(-1px);
            box-shadow: 0 2px 6px rgba(47, 129, 247, 0.3);
        }

        .chat-send-btn:active {
            transform: translateY(0);
        }

        .chat-send-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        /* Empty State */
        .empty {
            padding: 48px 20px;
            text-align: center;
            color: var(--text-secondary);
        }

        .empty-icon {
            font-size: 48px;
            margin-bottom: 16px;
            opacity: 0.5;
        }

        .empty-text {
            font-size: 14px;
            line-height: 1.5;
        }

        /* Loading State */
        .loading {
            padding: 48px 20px;
            text-align: center;
        }

        .spinner {
            width: 40px;
            height: 40px;
            border: 3px solid var(--border);
            border-top-color: var(--accent);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            margin: 0 auto 16px;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .loading-text {
            color: var(--text-secondary);
            font-size: 13px;
        }

        /* Error State */
        .error {
            background: #2d1515;
            border: 2px solid #f87171;
            color: #fca5a5;
            border-radius: 8px;
            padding: 16px;
            margin: 16px;
            font-size: 14px;
            line-height: 1.6;
        }

        body.light .error {
            background: #fee2e2;
            border-color: #f87171;
            color: #b91c1c;
        }

        /* Footer */
        .footer {
            padding: 12px 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-top: 1px solid var(--border);
            background: var(--bg-secondary);
            font-size: 11px;
            color: var(--text-secondary);
        }

        /* Responsive Design */
        @media (max-width: 400px) {
            .header {
                flex-direction: column;
                align-items: stretch;
            }

            .header-actions {
                flex-direction: column;
            }

            .btn {
                width: 100%;
                justify-content: center;
            }

            .chat-msg-bubble {
                max-width: 90% !important;
            }

            .code-block {
                margin: 16px -8px;
                border-radius: 6px;
            }
        }

        /* Smooth transitions for theme */
        body, .header, .content, .footer, .chat-input-box,
        .code-block, .chat-msg-bubble, .btn {
            transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
        }
    </style>
</head>
<body>
${this.buildBodyHtml(state, langCode)}
<script>
    const vscode = acquireVsCodeApi();
    var lang = '${langCode}';
    var ttsOn = false;
    var isLight = false;

    const LANG_VOICE = { hi:'hi-IN', bn:'bn-IN', te:'te-IN', mr:'mr-IN', ta:'ta-IN', gu:'gu-IN', kn:'kn-IN', ml:'ml-IN', pa:'pa-IN', or:'or-IN', en:'en-US' };

    function openSettings() {
        vscode.postMessage({ command: 'openSettings' });
    }

    function toggleTheme() {
        isLight = !isLight;
        document.body.classList.toggle('light', isLight);
        var btn = document.getElementById('theme-btn');
        if (btn) btn.textContent = isLight ? '🌙 Night' : '☀️ Day';
    }

    function onLangChange(code) {
        lang = code;
        vscode.postMessage({ command: 'setUiLanguage', code: code });
    }

    function toggleListen() {
        if (!window.speechSynthesis) return;
        if (ttsOn) { window.speechSynthesis.cancel(); ttsOn = false; updateListenBtn(); return; }
        var el = document.getElementById('resp-text');
        if (!el) return;
        
        // Clone to remove code blocks before reading
        var clone = el.cloneNode(true);
        var codeBlocks = clone.querySelectorAll('.code-block');
        for (var i = 0; i < codeBlocks.length; i++) {
            codeBlocks[i].parentNode.removeChild(codeBlocks[i]);
        }
        
        var text = clone.innerText || clone.textContent || '';
        if (!text.trim()) return;
        
        var clean = text.replace(/[*#_\`]/g, '');
        var utt = new SpeechSynthesisUtterance(clean);
        var lc = LANG_VOICE[lang] || 'en-US';
        utt.lang = lc;
        
        var vs = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
        var matchVoice = null;
        var fallbackVoice = null;
        var langPrefix = lc.split('-')[0];
        // First pass: find female voice matching language
        for (var j = 0; j < vs.length; j++) {
            if (vs[j].lang && vs[j].lang.startsWith(langPrefix)) {
                var name = vs[j].name.toLowerCase();
                // Common female voice identifiers across platforms
                var femaleKeywords = ['female', 'woman', 'girl', 'zira', 'samantha', 'victoria', 'alice', 'fiona', 'karen', 'moira', 'tessa', 'veena', 'google हिन्दी', 'microsoft heera', 'lekha', 'shruti', 'kyoko', 'siri female'];
                var isFemale = femaleKeywords.some(function(kw){ return name.indexOf(kw) > -1; });
                if (isFemale) {
                    matchVoice = vs[j];
                    break;
                }
                // Store as fallback if we haven't found a female voice yet
                if (!fallbackVoice) fallbackVoice = vs[j];
            }
        }
        // If no female voice found, try any available female voice (any language)
        if (!matchVoice) {
            for (var k = 0; k < vs.length; k++) {
                var nm = vs[k].name.toLowerCase();
                var femKeywords = ['female', 'woman', 'girl', 'zira', 'samantha', 'victoria'];
                var isFem = femKeywords.some(function(kw){ return nm.indexOf(kw) > -1; });
                if (isFem) {
                    matchVoice = vs[k];
                    break;
                }
            }
        }
        // Use matched female voice, or fallback, or system default
        if (matchVoice) utt.voice = matchVoice;
        else if (fallbackVoice) utt.voice = fallbackVoice;
        
        utt.onend = function(){ ttsOn = false; updateListenBtn(); };
        utt.onerror = function(){ ttsOn = false; updateListenBtn(); };
        ttsOn = true;
        window.speechSynthesis.speak(utt);
        updateListenBtn();
    }

    function updateListenBtn() {
        var btn = document.getElementById('listen-btn');
        if (btn) btn.textContent = ttsOn ? '⏹ Stop' : '🔊 Listen';
    }

    function saveResponse() {
        var el = document.getElementById('resp-text');
        var text = el ? (el.innerText || el.textContent || '') : '';
        vscode.postMessage({ command: 'chatSaveLastAssistant', text: text });
    }

    function copyCodeBlock(btn) {
        try {
            var block = btn.closest('.code-block');
            var code = block ? block.querySelector('code') : null;
            if (!code) return;
            var text = code.innerText || code.textContent || '';
            vscode.postMessage({ command: 'copyResponse', text: text });
            try {
                var ta = document.createElement('textarea');
                ta.value = text; ta.style.position = 'fixed'; ta.style.top = '-9999px';
                document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
            } catch(_) {}
            if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).catch(function(){}); }
            btn.textContent = '✔ Copied!'; btn.style.color = '#7ee787';
            setTimeout(function(){ btn.textContent = '📋 Copy'; btn.style.color = ''; }, 2000);
        } catch(e) {}
    }

    function sendChat() {
        var inp = document.getElementById('chat-input');
        if (!inp) return;
        var text = (inp.value || '').trim();
        if (!text) return;
        inp.value = ''; inp.style.height = '';
        vscode.postMessage({ command: 'chatSendMessage', text: text });
    }

    function onChatKey(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
    }

    // Auto-resize chat input
    var chatInput = document.getElementById('chat-input');
    if (chatInput) {
        chatInput.addEventListener('input', function(){ this.style.height=''; this.style.height=Math.min(this.scrollHeight,120)+'px'; });
    }
</script>
</body>
</html>`;
    }

    /** Pre-render the full body HTML on the TypeScript side. No JS render loop needed. */
    private buildBodyHtml(state: SidebarState | undefined, langCode: string): string {
        const s = state || { mode: 'analyze', status: 'idle' } as SidebarState;
        const esc = (t: string | undefined | null) => String(t || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

        const action = (s as any).action || (s.mode === 'chat' ? 'Chat Discussion' : 'Debug & Fix');
        const brand = 'Chaubey Ji';

        const LANGS = [
            { code:'en', flag:'🇬🇧', name:'English' },
            { code:'hi', flag:'🇮🇳', name:'Hindi (हिन्दी)' },
            { code:'bn', flag:'🇮🇳', name:'Bengali (বাংলা)' },
            { code:'te', flag:'🇮🇳', name:'Telugu (తెలుగు)' },
            { code:'mr', flag:'🇮🇳', name:'Marathi (मराठी)' },
            { code:'ta', flag:'🇮🇳', name:'Tamil (தமிழ்)' },
            { code:'gu', flag:'🇮🇳', name:'Gujarati (ગુજરાતી)' },
            { code:'kn', flag:'🇮🇳', name:'Kannada (ಕನ್ನಡ)' },
            { code:'ml', flag:'🇮🇳', name:'Malayalam (മലയാളം)' },
            { code:'pa', flag:'🇮🇳', name:'Punjabi (ਪੰਜਾਬੀ)' },
            { code:'or', flag:'🇮🇳', name:'Odia (ଓଡ଼ିଆ)' }
        ];
        const currentLangObj = LANGS.find(l => l.code === langCode) || LANGS[0];
        const langOpts = LANGS.map(l =>
            `<option value="${esc(l.code)}"${l.code === langCode ? ' selected' : ''}>${l.flag} ${esc(l.name)}</option>`
        ).join('');

        // Provide a more structured HTML response if it's the default response style
        let responseHtml = (s as any).responseHtml || `<pre><code>${esc((s as any).response)}</code></pre>`;
        
        // --- Header ---
        let html = `
<div id="app">
<div class="header">
  <div class="header-title">${esc(brand)} <span style="font-size:13px;font-weight:400;color:var(--text-secondary);">• ${esc(action)}</span></div>
  <div class="header-actions">
    <button class="btn" onclick="openSettings()">⚙️ Setup API</button>
    <button class="btn" id="theme-btn" onclick="toggleTheme()">☀️ Day</button>
  </div>
</div>
<div class="lang-selector">
  <select class="lang-select" onchange="onLangChange(this.value)">
    ${langOpts}
  </select>
</div>
<div class="toolbar-actions" style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;gap:8px;flex-wrap:wrap;">
  <button class="btn" id="listen-btn" onclick="toggleListen()">🔊 Listen</button>
  <button class="btn" onclick="saveResponse()">📥 Save</button>
</div>`;
        // --- Main content ---
        if (s.mode === 'chat') {
            html += this.buildChatBodyHtml(s, esc);
        } else if (s.status === 'loading') {
            html += `<div class="content"><div class="loading"><div class="spinner"></div><div style="color:var(--muted)">Generating ${esc(action)}...</div></div></div>`;
        } else if (s.status === 'error') {
            html += `<div class="content"><div class="error">❌ ${esc((s as any).error || 'An error occurred.')}</div></div>`;
        } else if (s.status === 'success') {
            const charCount = ((s as any).response || '').length;
            html += `
<div class="content">
  <div class="card-title">📄 ${esc(action)}</div>
  <div class="resp" id="resp-text">${responseHtml}</div>
</div>
<div class="footer">
  <div>✨ Powered by ${esc(brand)} AI</div>
  <div>${charCount} characters</div>
</div>`;
        } else {
            // idle setup instructions
            html += `
<div class="content">
  <div class="empty">
    <div style="font-size:16px;font-weight:700;color:#ffffff;margin-bottom:12px;">Welcome to ${esc(brand)}!</div>
    <div style="color:var(--muted);text-align:left;line-height:1.6;font-size:13px;padding:0 10px;">
      <p>Before you begin, you need to configure your API key.</p>
      <p><strong>Setup Instructions:</strong></p>
      <ol style="padding-left:24px;">
        <li>Click the <strong>⚙️ Setup API</strong> button in the top right.</li>
        <li>This opens the settings. Find <em>"Ai Assistant: Default Provider"</em> and choose Groq, Gemini, Anthropic, or OpenAI.</li>
        <li>Scroll down to your provider's API Key setting (e.g. <em>"Ai Assistant › Api Key: Groq"</em>) and paste your secret key.</li>
      </ol>
      <p>Once set up, just highlight any code, right-click, and choose an AI action!</p>
    </div>
  </div>
</div>`;
        }

        return html;
    }

    private buildChatBodyHtml(s: SidebarState, esc: (t: string | undefined | null) => string): string {
        let html = `<div class="content"><div class="card-title">💬 Chat Discussion</div><div class="chat-container" id="resp-text">`;
        
        // If no messages yet, show selection preview in a clean card
        if (s.chatMessageCount === 0 && s.chatCodeContext && s.chatCodeContext.fileName) {
            const ctx = s.chatCodeContext;
            html += `<div class="chat-card">`;
            html += `<div style="color:var(--muted);font-weight:600;margin-bottom:8px;font-size:12px;">📎 ${esc(ctx.fileName)} (${esc(ctx.languageName||ctx.languageId)}, ${ctx.lineCount} lines)</div>`;
            if (ctx.selectedCodePreviewHtml) {
                html += ctx.selectedCodePreviewHtml;
            }
            html += `<div style="color:var(--muted);margin-top:10px;font-size:12.5px;">Ask anything about the selected code below.</div>`;
            html += `</div>`;
        }

        if (s.chatMessagesHtml) {
            html += s.chatMessagesHtml;
        }

        if (s.status === 'loading' || s.chatStatus === 'sending') {
            html += `<div class="chat-card"><div style="color:var(--muted);font-style:italic">⏳ Thinking...</div></div>`;
        }
        
        html += `</div></div>
<div class="chat-input-box">
  <textarea id="chat-input" class="chat-input" placeholder="Type your message..." onkeydown="onChatKey(event)" rows="1"></textarea>
  <button class="chat-send-btn" onclick="sendChat()">Send</button>
</div>`;
        return html;
    }

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}
