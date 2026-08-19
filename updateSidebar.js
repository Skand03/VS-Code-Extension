const fs = require('fs');
const content = fs.readFileSync('src/ui/SidebarProvider.ts', 'utf8');

const prefix = 'private getHtmlContent(): string {';
const suffix = 'private getNonce(): string {';

const startIndex = content.indexOf(prefix);
const endIndex = content.indexOf(suffix);

if (startIndex === -1 || endIndex === -1) {
    console.error('Markers not found');
    process.exit(1);
}

const htmlCode = `
    private getHtmlContent(): string {
        const nonce = this.getNonce();
        return \`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-\${nonce}'; script-src 'nonce-\${nonce}';">
    <title>AI Assistant</title>
    <style nonce="\${nonce}">
        /* ===== Base ===== */
        *, *::before, *::after { box-sizing: border-box; }
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            padding: 8px 10px 12px 10px;
            margin: 0;
            line-height: 1.6;
            overflow-y: auto;
        }
        #app { max-width: 100%; }
        /* ===== Shared Buttons ===== */
        button {
            padding: 6px 12px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-family: var(--vscode-font-family);
            font-size: 12px;
            font-weight: 500;
        }
        button:hover { background-color: var(--vscode-button-hoverBackground); }
        button:active { opacity: 0.8; }
        button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        button.secondary:hover { background-color: var(--vscode-button-secondaryHoverBackground); }
        button.btn-sm {
            padding: 4px 10px;
            font-size: 11px;
        }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
        .button-group { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
        /* ===== Analyze Code Cards ===== */
        .ai-header-card {
            padding: 14px 14px 12px 14px;
            margin: 6px 0 12px 0;
            border-radius: 10px;
            background: linear-gradient(135deg,
                color-mix(in srgb, var(--vscode-button-background, #0e639c) 18%, transparent),
                color-mix(in srgb, var(--vscode-panel-background, #1e1e1e) 92%, transparent));
            border: 1px solid color-mix(in srgb, var(--vscode-button-background, #0e639c) 40%, var(--vscode-panel-border, #3c3c3c));
        }
        .ai-header-title { font-size: 15px; font-weight: 700; display: flex; align-items: center; gap: 8px; letter-spacing: .15px; }
        .ai-icon { font-size: 18px; }
        .ai-subtitle { margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap; }
        .provider-chip, .model-chip {
            display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px;
            font-size: 11px; font-weight: 600;
            background: var(--vscode-badge-background, #4d4d4d);
            color: var(--vscode-badge-foreground, #fff);
        }
        .model-chip {
            background: color-mix(in srgb, var(--vscode-textLink-foreground, #3794ff) 18%, transparent);
            color: var(--vscode-foreground);
            border: 1px solid color-mix(in srgb, var(--vscode-textLink-foreground, #3794ff) 35%, transparent);
        }
        .ai-meta-card {
            padding: 10px 12px; margin: 0 0 12px 0; border-radius: 8px;
            background: color-mix(in srgb, var(--vscode-sideBar-background, #252526) 55%, transparent);
            border: 1px solid var(--vscode-panel-border, #3c3c3c);
        }
        .ai-meta-row { display: flex; justify-content: space-between; gap: 10px; padding: 3px 0; font-size: 12px; }
        .ai-meta-label { color: var(--vscode-descriptionForeground); font-weight: 500; white-space: nowrap; }
        .ai-meta-value { color: var(--vscode-foreground); font-weight: 600; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70%; }
        .ai-response-card {
            padding: 14px 14px 12px 14px; margin: 0 0 12px 0; border-radius: 10px;
            background: var(--vscode-editor-background, #1e1e1e);
            border: 1px solid var(--vscode-panel-border, #3c3c3c);
            box-shadow: 0 1px 0 rgba(0,0,0,.25);
        }
        .ai-response-label {
            font-size: 11px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase;
            color: var(--vscode-textLink-foreground, #3794ff);
            padding-bottom: 8px; margin-bottom: 10px;
            border-bottom: 1px solid var(--vscode-panel-border, #3c3c3c);
        }
        .ai-response-body { font-size: 13px; line-height: 1.65; word-wrap: break-word; overflow-wrap: break-word; }
        .ai-paragraph { margin: 0 0 12px 0; }
        .ai-paragraph:last-child { margin-bottom: 0; }
        .ai-h1 { font-size: 17px; font-weight: 700; margin: 18px 0 10px 0; padding-bottom: 6px; border-bottom: 1px solid var(--vscode-panel-border, #3c3c3c); }
        .ai-h2 { font-size: 15px; font-weight: 700; margin: 16px 0 8px 0; }
        .ai-h3 { font-size: 13.5px; font-weight: 700; margin: 14px 0 6px 0; }
        .ai-num-section { display: flex; align-items: flex-start; gap: 10px; margin: 14px 0 8px 0; padding: 10px 12px; border-radius: 8px; background: color-mix(in srgb, var(--vscode-textLink-foreground, #3794ff) 10%, transparent); border-left: 3px solid var(--vscode-textLink-foreground, #3794ff); }
        .ai-num { flex: 0 0 auto; width: 22px; height: 22px; border-radius: 50%; background: var(--vscode-textLink-foreground, #3794ff); color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }
        .ai-num-title { font-weight: 700; font-size: 13px; line-height: 22px; }
        .ai-ul, .ai-ol { margin: 8px 0 12px 0; padding-left: 22px; }
        .ai-ul li, .ai-ol li { margin: 4px 0; line-height: 1.55; }
        .ai-code-block { margin: 12px 0; border-radius: 8px; overflow: hidden; background: var(--vscode-textCodeBlock-background, #2d2d2d); border: 1px solid var(--vscode-panel-border, #3c3c3c); }
        .ai-code-lang { padding: 4px 10px; font-size: 10.5px; font-weight: 700; letter-spacing: .4px; text-transform: uppercase; background: color-mix(in srgb, var(--vscode-panel-border, #3c3c3c) 60%, var(--vscode-textCodeBlock-background, #2d2d2d)); color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--vscode-panel-border, #3c3c3c); }
        .ai-code-block pre { margin: 0; padding: 10px 12px; overflow-x: auto; max-height: 420px; overflow-y: auto; }
        .ai-code-block code { background: none !important; padding: 0 !important; font-family: var(--vscode-editor-font-family); font-size: 12px; line-height: 1.55; color: var(--vscode-editor-foreground); white-space: pre; }
        .ai-response-body code { background: var(--vscode-textCodeBlock-background, #2d2d2d); padding: 1.5px 5px; border-radius: 4px; font-family: var(--vscode-editor-font-family); font-size: 12px; }
        .ai-response-body strong { color: var(--vscode-foreground); font-weight: 700; }
        .ai-footer-card { padding: 10px 12px 12px 12px; border-radius: 8px; border: 1px solid var(--vscode-panel-border, #3c3c3c); background: color-mix(in srgb, var(--vscode-statusBar-background, #007acc) 8%, transparent); }
        .ai-char-count { font-size: 10.5px; color: var(--vscode-descriptionForeground); margin-bottom: 6px; font-weight: 500; }
        .ai-actions { margin-top: 2px; }
        .ai-actions button { flex: 1 1 0; padding: 7px 10px; font-size: 12px; font-weight: 600; }
        /* ===== Loading / Error / Empty ===== */
        .loading { padding: 20px 14px; text-align: center; }
        .loading .spinner { font-size: 40px; display: inline-block; animation: spin 1.2s linear infinite; }
        .loading-text { margin-top: 12px; font-size: 14px; color: var(--vscode-descriptionForeground); }
        @keyframes spin { 0% { transform: rotate(0deg); opacity: .6; } 50% { opacity: 1; } 100% { transform: rotate(360deg); opacity: .6; } }
        .error-card { padding: 12px; background-color: var(--vscode-inputValidation-errorBackground); border: 1px solid var(--vscode-inputValidation-errorBorder); border-radius: 6px; color: var(--vscode-errorForeground); margin-bottom: 12px; }
        .error-title { font-weight: 600; margin-bottom: 6px; }
        .empty-state { text-align: center; padding: 40px 20px; color: var(--vscode-descriptionForeground); }
        .empty-state-icon { font-size: 48px; margin-bottom: 16px; }
        .empty-state-text { font-size: 14px; line-height: 1.6; }
        .section { margin-bottom: 16px; padding: 12px; background-color: var(--vscode-editor-inactiveSelectionBackground); border-radius: 4px; border: 1px solid var(--vscode-panel-border); }
        .meta { font-size: 12px; color: var(--vscode-descriptionForeground); margin: 4px 0; }
        .meta strong { color: var(--vscode-foreground); }
        /* ===== Chat: Container Layout ===== */
        .chat-root { display: flex; flex-direction: column; gap: 0; }
        /* ===== Chat: Header card ===== */
        .chat-header-card {
            padding: 12px 14px 10px 14px;
            margin-bottom: 10px;
            border-radius: 10px;
            background: linear-gradient(135deg,
                color-mix(in srgb, var(--vscode-button-background, #0e639c) 18%, transparent),
                color-mix(in srgb, var(--vscode-panel-background, #1e1e1e) 92%, transparent));
            border: 1px solid color-mix(in srgb, var(--vscode-button-background, #0e639c) 40%, var(--vscode-panel-border, #3c3c3c));
        }
        .chat-header-top { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
        .chat-header-title { font-size: 15px; font-weight: 700; display: flex; align-items: center; gap: 7px; }
        .chat-header-actions { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
        .chat-header-chips { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 8px; align-items: center; }
        /* ===== Chat: Language selector ===== */
        .lang-selector {
            padding: 2px 6px;
            background: var(--vscode-dropdown-background, #3c3c3c);
            color: var(--vscode-dropdown-foreground, #cccccc);
            border: 1px solid var(--vscode-dropdown-border, #555);
            border-radius: 4px;
            font-family: var(--vscode-font-family);
            font-size: 11px;
            cursor: pointer;
            outline: none;
        }
        .lang-selector:focus { outline: 1px solid var(--vscode-focusBorder); }
        /* ===== Chat: Listen/Save/Clear buttons ===== */
        .btn-action {
            padding: 3px 9px;
            font-size: 11px;
            font-weight: 600;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-panel-border, #3c3c3c);
            border-radius: 5px;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 3px;
            white-space: nowrap;
        }
        .btn-action:hover { background: var(--vscode-button-secondaryHoverBackground); }
        .btn-action.active { background: color-mix(in srgb, var(--vscode-textLink-foreground, #3794ff) 20%, transparent); border-color: var(--vscode-textLink-foreground, #3794ff); }
        /* ===== Chat: Code context card ===== */
        .chat-ctx-card {
            margin-bottom: 10px;
            padding: 10px 12px;
            border-radius: 8px;
            background: color-mix(in srgb, var(--vscode-textCodeBlock-background, #2d2d2d) 55%, transparent);
            border: 1px solid var(--vscode-panel-border, #3c3c3c);
        }
        .chat-ctx-header { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; font-size: 11px; font-weight: 700; color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: .4px; }
        .chat-ctx-meta { display: flex; gap: 10px; flex-wrap: wrap; font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 6px; }
        .chat-ctx-meta span { display: inline-flex; align-items: center; gap: 3px; }
        .chat-ctx-meta strong { color: var(--vscode-foreground); }
        .chat-ctx-code-wrap { margin-top: 4px; }
        /* ===== Chat: Messages scroll area ===== */
        .chat-messages-area {
            min-height: 80px;
            max-height: 380px;
            overflow-y: auto;
            margin-bottom: 10px;
            padding: 4px 2px;
            scroll-behavior: smooth;
        }
        .chat-empty-hint {
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
            padding: 20px 8px;
            opacity: 0.8;
        }
        /* ===== Chat: Message bubbles ===== */
        .chat-msg { display: flex; gap: 8px; margin-bottom: 12px; align-items: flex-start; }
        .chat-msg-user { flex-direction: row-reverse; }
        .chat-msg-assistant { flex-direction: row; }
        .chat-msg-avatar {
            flex: 0 0 auto;
            width: 26px; height: 26px;
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            font-size: 10px; font-weight: 700;
            margin-top: 2px;
        }
        .chat-avatar-user {
            background: var(--vscode-button-background, #0e639c);
            color: var(--vscode-button-foreground, #fff);
        }
        .chat-avatar-ai {
            background: color-mix(in srgb, var(--vscode-textLink-foreground, #3794ff) 25%, transparent);
            color: var(--vscode-textLink-foreground, #3794ff);
            border: 1px solid color-mix(in srgb, var(--vscode-textLink-foreground, #3794ff) 40%, transparent);
            font-size: 9px;
        }
        .chat-msg-bubble {
            max-width: 84%;
            padding: 8px 12px;
            border-radius: 12px;
            font-size: 13px;
            line-height: 1.55;
            word-wrap: break-word;
            overflow-wrap: break-word;
        }
        .chat-bubble-user {
            background: var(--vscode-button-background, #0e639c);
            color: var(--vscode-button-foreground, #fff);
            border-radius: 12px 4px 12px 12px;
        }
        .chat-bubble-assistant {
            background: var(--vscode-editor-inactiveSelectionBackground, #2a2a2a);
            border: 1px solid var(--vscode-panel-border, #3c3c3c);
            border-radius: 4px 12px 12px 12px;
        }
        .chat-bubble-error {
            background: color-mix(in srgb, var(--vscode-inputValidation-errorBackground, #5a1d1d) 60%, transparent) !important;
            border-color: var(--vscode-inputValidation-errorBorder, #be1100) !important;
        }
        .chat-msg-error-title { font-weight: 700; font-size: 12px; color: var(--vscode-errorForeground, #f48771); margin-bottom: 4px; }
        .chat-msg-error-text { font-size: 12px; }
        .chat-msg-text { white-space: pre-wrap; word-break: break-word; }
        .chat-msg-markdown { white-space: normal; }
        .chat-msg-time { font-size: 10px; opacity: 0.55; margin-top: 5px; text-align: right; }
        /* ===== Chat: Thinking animation ===== */
        .chat-thinking { display: flex; align-items: center; gap: 5px; padding: 2px 0; }
        .chat-thinking-dot {
            width: 7px; height: 7px; border-radius: 50%;
            background: var(--vscode-textLink-foreground, #3794ff);
            animation: chat-bounce 1.2s infinite ease-in-out;
            opacity: 0.7;
        }
        .chat-thinking-dot:nth-child(2) { animation-delay: 0.2s; }
        .chat-thinking-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes chat-bounce { 0%, 80%, 100% { transform: scale(0.7); opacity: 0.5; } 40% { transform: scale(1); opacity: 1; } }
        .chat-thinking-text { font-size: 12px; color: var(--vscode-descriptionForeground); margin-left: 4px; }
        /* ===== Chat: Input area ===== */
        .chat-input-area {
            display: flex;
            flex-direction: column;
            gap: 7px;
            padding: 10px 12px;
            background: var(--vscode-editor-inactiveSelectionBackground, #2a2a2a);
            border: 1px solid var(--vscode-panel-border, #3c3c3c);
            border-radius: 10px;
        }
        .chat-input-row { display: flex; gap: 7px; align-items: flex-end; }
        .chat-textarea {
            flex: 1;
            min-height: 36px;
            max-height: 120px;
            resize: none;
            padding: 7px 10px;
            background: var(--vscode-input-background, #3c3c3c);
            color: var(--vscode-input-foreground, #cccccc);
            border: 1px solid var(--vscode-input-border, #555);
            border-radius: 6px;
            font-family: var(--vscode-font-family);
            font-size: 13px;
            line-height: 1.45;
            outline: none;
            overflow-y: auto;
        }
        .chat-textarea:focus { border-color: var(--vscode-focusBorder, #007fd4); }
        .chat-textarea::placeholder { color: var(--vscode-input-placeholderForeground, #888); opacity: 0.8; }
        .chat-send-btn {
            flex: 0 0 auto;
            width: 36px; height: 36px;
            border-radius: 8px;
            padding: 0;
            display: flex; align-items: center; justify-content: center;
            font-size: 16px;
            background: var(--vscode-button-background, #0e639c);
            color: var(--vscode-button-foreground, #fff);
            border: none;
            cursor: pointer;
            transition: background 0.15s;
        }
        .chat-send-btn:hover:not(:disabled) { background: var(--vscode-button-hoverBackground, #1177bb); }
        .chat-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .chat-hint { font-size: 10.5px; color: var(--vscode-descriptionForeground); opacity: 0.7; }
        .chat-footer-actions { display: flex; gap: 6px; flex-wrap: wrap; }
    </style>
</head>
<body>
    <div id="app">
        <!-- Content injected by JavaScript -->
    </div>
    <script nonce="\${nonce}">
        const vscode = acquireVsCodeApi();
        let currentState = { status: 'idle', mode: 'analyze' };
        let lastProcessedGeneration = 0;
        let availableLanguages = [];
        let currentLanguage = 'en';
        let ttsActive = false;
        let ttsUtterance = null;
        // ---- Notify extension that webview is ready ----
        (function() {
            try { vscode.postMessage({ command: 'ready' }); }
            catch (e) { /* ignore */ }
        })();
        // ---- Message listener ----
        window.addEventListener('message', function(event) {
            try {
                var message = event.data;
                if (message.command === 'updateState') {
                    var gen = typeof message.generation === 'number' ? message.generation : 0;
                    var accepted = gen > lastProcessedGeneration;
                    var stateStatus = (message.state && message.state.status) ? message.state.status : 'n/a';
                    try {
                        vscode.postMessage({
                            command: 'webviewReceivedUpdateState',
                            generation: gen,
                            stateStatus: stateStatus,
                            accepted: accepted
                        });
                    } catch (_) {}
                    if (!accepted) { return; }
                    lastProcessedGeneration = gen;
                    currentState = message.state;
                    try {
                        render();
                    } catch (renderErr) {
                        console.error('[AI Assistant Sidebar] render() threw:', renderErr);
                        try {
                            var app = document.getElementById('app');
                            if (app) { app.innerHTML = renderSuccessFallback(renderErr && renderErr.message ? renderErr.message : String(renderErr)); }
                        } catch (_) {}
                        try {
                            vscode.postMessage({ command: 'webviewRenderError', generation: gen, message: renderErr && renderErr.message ? renderErr.message : String(renderErr) });
                        } catch (__) {}
                        return;
                    }
                    try {
                        vscode.postMessage({ command: 'webviewRendered', status: currentState.status, generation: gen, mode: currentState.mode });
                    } catch (_) {}
                }
                if (message.command === 'languagesLoaded') {
                    availableLanguages = message.languages || [];
                    currentLanguage = message.currentLanguage || 'en';
                    // Re-render to refresh language selector if needed
                    try { render(); } catch (_) {}
                }
                if (message.command === 'uiLanguageChanged') {
                    currentLanguage = message.code || 'en';
                }
            } catch (topErr) {
                try {
                    vscode.postMessage({ command: 'webviewTopLevelError', message: topErr && topErr.message ? topErr.message : String(topErr) });
                } catch (__) {}
            }
        });
        // ================================================================
        // RENDER DISPATCHER
        // ================================================================
        function render() {
            var app = document.getElementById('app');
            if (!app) { throw new Error('Sidebar: #app element not found'); }
            if (currentState.mode === 'chat') {
                app.innerHTML = renderChat();
                afterRenderChat();
            } else {
                // Analyze Code mode
                switch (currentState.status) {
                    case 'idle':    app.innerHTML = renderEmptyState(); break;
                    case 'loading': app.innerHTML = renderLoading(); break;
                    case 'success': app.innerHTML = renderSuccess(); break;
                    case 'error':   app.innerHTML = renderError(); break;
                    default:        app.innerHTML = renderEmptyState(); break;
                }
            }
        }
        // ================================================================
        // ANALYZE CODE RENDERERS (Phase 1 — unchanged)
        // ================================================================
        function renderEmptyState() {
            return '<div class="empty-state">' +
                '<div class="empty-state-icon">&#x1F916;</div>' +
                '<div class="empty-state-text">' +
                    '<p><strong>AI Assistant</strong></p>' +
                    '<p>Select some code and choose an action from the right-click menu to get started.</p>' +
                    '<div class="button-group" style="margin-top:16px;justify-content:center;">' +
                        '<button onclick="openSettings()" class="secondary">&#x2699;&#xFE0F; Open Settings</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        }
        function renderLoading() {
            var selHtml = '';
            if (currentState.selection) {
                selHtml = '<div class="section" style="margin-top:16px;text-align:left;">' +
                    '<div class="meta"><strong>File:</strong> ' + escapeAttr(currentState.selection.fileName || '') + '</div>' +
                    '<div class="meta"><strong>Language:</strong> ' + escapeAttr(currentState.selection.languageId || '') + '</div>' +
                    '<div class="meta"><strong>Lines:</strong> ' + String(currentState.selection.lineCount || 0) + '</div>' +
                '</div>';
            }
            return '<div class="loading">' +
                '<div class="spinner">&#x23F3;</div>' +
                '<div class="loading-text"><strong>' + escapeAttr(currentState.action || 'Analyze Code') + '</strong><br>Analyzing your code...</div>' +
                selHtml +
            '</div>';
        }
        function renderSuccess() {
            var responseText = currentState.response ? String(currentState.response) : '';
            var charCount = typeof currentState.charCount === 'number' ? currentState.charCount : responseText.length;
            var preRendered = (typeof currentState.responseHtml === 'string' && currentState.responseHtml.length > 0) ? currentState.responseHtml : null;
            var bodyHtml = preRendered ? preRendered :
                '<pre style="white-space:pre-wrap;word-wrap:break-word;margin:0;">' + escapeAttr(responseText) + '</pre>';
            var selHtml = '';
            if (currentState.selection) {
                selHtml = '<div class="ai-meta-card">' +
                    '<div class="ai-meta-row"><span class="ai-meta-label">&#x1F4C4; File</span><span class="ai-meta-value">' + escapeAttr(currentState.selection.fileName || '') + '</span></div>' +
                    '<div class="ai-meta-row"><span class="ai-meta-label">&#x1F524; Language</span><span class="ai-meta-value">' + escapeAttr(currentState.selection.languageId || '') + '</span></div>' +
                    '<div class="ai-meta-row"><span class="ai-meta-label">&#x1F4CF; Lines</span><span class="ai-meta-value">' + String(currentState.selection.lineCount || 0) + '</span></div>' +
                '</div>';
            }
            return '<div class="ai-header-card">' +
                    '<div class="ai-header-title"><span class="ai-icon">&#x2728;</span><span>' + escapeAttr(currentState.action || 'AI Response') + '</span></div>' +
                    '<div class="ai-subtitle">' +
                        '<span class="provider-chip">' + escapeAttr(currentState.provider || 'AI') + '</span>' +
                        '<span class="model-chip">' + escapeAttr(currentState.model || '') + '</span>' +
                    '</div>' +
                '</div>' +
                selHtml +
                '<div class="ai-response-card">' +
                    '<div class="ai-response-label">&#x1F4A1; AI Analysis</div>' +
                    '<div class="ai-response-body">' + bodyHtml + '</div>' +
                '</div>' +
                '<div class="ai-footer-card">' +
                    '<div class="ai-char-count">' + String(charCount) + ' characters</div>' +
                    '<div class="button-group ai-actions">' +
                        '<button onclick="copyResponse()" title="Copy full response">&#x1F4CB; Copy</button>' +
                        '<button onclick="insertAtCursor()" class="secondary" title="Insert response at cursor">&#x2795; Insert</button>' +
                    '</div>' +
                '</div>';
        }
        function renderSuccessFallback(reason) {
            var responseText = currentState.response ? String(currentState.response) : '';
            return '<div class="ai-header-card">' +
                    '<div class="ai-header-title"><span class="ai-icon">&#x26A0;&#xFE0F;</span><span>' + escapeAttr(currentState.action || 'AI Response') + '</span></div>' +
                    '<div style="font-size:11px;opacity:.75;margin-top:4px;">Fallback view: ' + escapeAttr(String(reason || '').slice(0, 80)) + '</div>' +
                '</div>' +
                '<div class="ai-response-card">' +
                    '<div class="ai-response-label">&#x1F4A1; AI Analysis (plain text)</div>' +
                    '<pre style="white-space:pre-wrap;word-wrap:break-word;margin:0;font:inherit;">' + escapeAttr(responseText) + '</pre>' +
                '</div>' +
                '<div class="ai-footer-card">' +
                    '<div class="button-group ai-actions">' +
                        '<button onclick="copyResponse()">&#x1F4CB; Copy</button>' +
                        '<button onclick="insertAtCursor()" class="secondary">&#x2795; Insert</button>' +
                    '</div>' +
                '</div>';
        }
        function renderError() {
            return '<div class="error-card">' +
                    '<div class="error-title">&#x274C; Error</div>' +
                    '<div>' + escapeAttr(currentState.error || '') + '</div>' +
                '</div>' +
                '<div class="button-group">' +
                    '<button onclick="openSettings()" class="secondary">&#x2699;&#xFE0F; Open Settings</button>' +
                '</div>';
        }
        // ================================================================
        // CHAT DISCUSSION RENDERER (Phase 2)
        // ================================================================
        function renderChat() {
            var html = '<div class="chat-root">';
            // ---- Header card ----
            var langSelectorHtml = buildLangSelector();
            html += '<div class="chat-header-card">' +
                '<div class="chat-header-top">' +
                    '<div class="chat-header-title">' +
                        '<span style="font-size:17px;">&#x1F4AC;</span>' +
                        '<span>Chat Discussion</span>' +
                    '</div>' +
                    '<div class="chat-header-actions">' +
                        '<button class="btn-action" id="btn-listen" onclick="toggleListen()" title="Listen to last AI response">&#x1F50A; Listen</button>' +
                        '<button class="btn-action" onclick="chatSave()" title="Save last AI response">&#x1F4BE; Save</button>' +
                        '<button class="btn-action" onclick="chatClear()" title="Clear conversation">&#x1F5D1; Clear</button>' +
                    '</div>' +
                '</div>' +
                '<div class="chat-header-chips">' +
                    '<span class="provider-chip">' + escapeAttr(currentState.provider || 'AI') + '</span>' +
                    '<span class="model-chip">' + escapeAttr(currentState.model || '') + '</span>' +
                    (langSelectorHtml ? '<span style="margin-left:auto;">' + langSelectorHtml + '</span>' : '') +
                '</div>' +
            '</div>';
            // ---- Code context card ----
            if (currentState.chatCodeContext) {
                var ctx = currentState.chatCodeContext;
                html += '<div class="chat-ctx-card">' +
                    '<div class="chat-ctx-header">&#x1F4C4; Selected Code Context</div>' +
                    '<div class="chat-ctx-meta">' +
                        '<span>&#x1F4C1; <strong>' + escapeAttr(ctx.fileName || '') + '</strong></span>' +
                        '<span>&#x1F524; <strong>' + escapeAttr(ctx.languageName || ctx.languageId || '') + '</strong></span>' +
                        '<span>&#x1F4CF; <strong>' + String(ctx.lineCount || 0) + ' lines</strong></span>' +
                    '</div>' +
                    '<div class="chat-ctx-code-wrap">' + (ctx.selectedCodePreviewHtml || '') + '</div>' +
                '</div>';
            }
            // ---- Messages area ----
            var messagesHtml = typeof currentState.chatMessagesHtml === 'string'
                ? currentState.chatMessagesHtml
                : '<div class="chat-empty-hint">Ask your first question about the selected code above.</div>';
            html += '<div class="chat-messages-area" id="chat-messages-area">' + messagesHtml + '</div>';
            // ---- Input area ----
            var isSending = currentState.chatStatus === 'sending';
            var disabledAttr = isSending ? ' disabled' : '';
            html += '<div class="chat-input-area">' +
                '<div class="chat-input-row">' +
                    '<textarea id="chat-input" class="chat-textarea" placeholder="Type your message... (Enter to send, Shift+Enter for newline)"' + disabledAttr + ' rows="1" aria-label="Chat message input"></textarea>' +
                    '<button id="chat-send-btn" class="chat-send-btn" onclick="chatSend()"' + disabledAttr + ' title="Send message" aria-label="Send message">&#x27A4;</button>' +
                '</div>' +
                '<div class="chat-hint">Enter to send &nbsp;&#x2022;&nbsp; Shift+Enter for new line</div>' +
            '</div>';
            html += '</div>'; // end chat-root
            return html;
        }
        function afterRenderChat() {
            // Auto-scroll messages to bottom
            var area = document.getElementById('chat-messages-area');
            if (area) { area.scrollTop = area.scrollHeight; }
            // Attach Enter/Shift+Enter handler on the textarea
            var ta = document.getElementById('chat-input');
            if (ta) {
                ta.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        chatSend();
                    }
                });
                // Auto-resize textarea
                ta.addEventListener('input', function() {
                    this.style.height = 'auto';
                    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
                });
                // Focus input if not sending
                if (currentState.chatStatus !== 'sending') {
                    setTimeout(function() { try { ta.focus(); } catch(_) {} }, 50);
                }
            }
            // Update listen button state
            updateListenBtn();
        }
        function buildLangSelector() {
            if (!availableLanguages || availableLanguages.length === 0) { return ''; }
            var opts = '';
            for (var i = 0; i < availableLanguages.length; i++) {
                var l = availableLanguages[i];
                var sel = l.code === currentLanguage ? ' selected' : '';
                opts += '<option value="' + escapeAttr(l.code) + '"' + sel + '>' + escapeAttr(l.native) + '</option>';
            }
            return '<select class="lang-selector" id="lang-selector" onchange="onLangChange(this.value)" aria-label="UI Language">' + opts + '</select>';
        }
        // ================================================================
        // CHAT ACTIONS
        // ================================================================
        function chatSend() {
            var ta = document.getElementById('chat-input');
            if (!ta) { return; }
            var text = ta.value;
            if (!text || !text.trim()) { return; }
            ta.value = '';
            ta.style.height = 'auto';
            try {
                vscode.postMessage({ command: 'chatSendMessage', text: text });
            } catch (_) {}
        }
        function chatClear() {
            try { vscode.postMessage({ command: 'chatClearConversation' }); } catch (_) {}
        }
        function chatSave() {
            try { vscode.postMessage({ command: 'chatSaveLastAssistant' }); } catch (_) {}
        }
        // ================================================================
        // TEXT-TO-SPEECH (Listen)
        // ================================================================
        function toggleListen() {
            if (ttsActive) {
                stopTts();
            } else {
                startTts();
            }
        }
        function startTts() {
            if (!window.speechSynthesis) {
                alert('Text-to-speech is not supported in this environment.');
                return;
            }
            var text = (typeof currentState.chatLastAssistantContent === 'string')
                ? currentState.chatLastAssistantContent
                : (currentState.response || '');
            if (!text || !text.trim()) {
                alert('Nothing to read yet. Ask a question first.');
                return;
            }
            stopTts();
            ttsUtterance = new SpeechSynthesisUtterance(text);
            ttsUtterance.onend = function() { ttsActive = false; updateListenBtn(); };
            ttsUtterance.onerror = function() { ttsActive = false; updateListenBtn(); };
            ttsActive = true;
            window.speechSynthesis.speak(ttsUtterance);
            updateListenBtn();
        }
        function stopTts() {
            if (window.speechSynthesis) { window.speechSynthesis.cancel(); }
            ttsActive = false;
            ttsUtterance = null;
            updateListenBtn();
        }
        function updateListenBtn() {
            var btn = document.getElementById('btn-listen');
            if (!btn) { return; }
            if (ttsActive) {
                btn.textContent = '\u23F9 Stop';
                btn.classList.add('active');
            } else {
                btn.innerHTML = '&#x1F50A; Listen';
                btn.classList.remove('active');
            }
        }
        // ================================================================
        // LANGUAGE SELECTOR
        // ================================================================
        function onLangChange(code) {
            currentLanguage = code;
            try { vscode.postMessage({ command: 'setUiLanguage', code: code }); } catch (_) {}
        }
        // ================================================================
        // ANALYZE CODE ACTIONS
        // ================================================================
        function copyResponse() {
            try { vscode.postMessage({ command: 'copyResponse', text: currentState.response }); } catch (_) {}
        }
        function insertAtCursor() {
            try { vscode.postMessage({ command: 'insertAtCursor', text: currentState.response }); } catch (_) {}
        }
        function openSettings() {
            try { vscode.postMessage({ command: 'openSettings' }); } catch (_) {}
        }
        // ================================================================
        // ESCAPE HELPER (safe, no-regex, no backtick)
        // ================================================================
        function escapeAttr(s) {
            if (s == null) { return ''; }
            var result = String(s);
            var pairs = [
                ['&',  '&amp;'],
                ['<',  '&lt;'],
                ['>',  '&gt;'],
                ['"',  '&quot;'],
                ["'",  '&#39;'],
                ['/',  '&#47;']
            ];
            for (var p = 0; p < pairs.length; p++) {
                var needle = pairs[p][0];
                var repl   = pairs[p][1];
                if (result.indexOf(needle) === -1) { continue; }
                result = result.split(needle).join(repl);
            }
            return result;
        }
        // Initial render
        render();
    </script>
</body>
</html>\`;
    }
`;

const newContent = content.substring(0, startIndex) + htmlCode + "\n    " + content.substring(endIndex);

fs.writeFileSync('src/ui/SidebarProvider.ts', newContent, 'utf8');
console.log('SidebarProvider.ts updated successfully');
