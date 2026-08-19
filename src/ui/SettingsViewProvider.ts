import * as vscode from 'vscode';
import { SettingsService } from '../services/SettingsService';
import { AIService } from '../services/AIService';
import { logger } from '../utils/logger';

/**
 * Settings Webview — V2: Multi-provider support
 * Supports 6 providers: Groq, Gemini, OpenAI, DeepSeek, Together, Localhost
 * 
 * Each provider has:
 * - Independent API key storage
 * - Provider-specific models
 * - Provider-specific help text
 */
export class SettingsViewProvider {
    private panel: vscode.WebviewPanel | undefined;
    private context: vscode.ExtensionContext;
    private settingsService: SettingsService;
    private aiService: AIService;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.settingsService = new SettingsService(context);
        this.aiService = new AIService(context);
    }

    async show(): Promise<void> {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'chaubeyJiSettings',
            'Chaubey Ji — Settings',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [this.context.extensionUri]
            }
        );

        this.panel.webview.html = await this.getHtmlContent();

        this.panel.webview.onDidReceiveMessage(
            async (message) => { await this.handleMessage(message); },
            undefined,
            this.context.subscriptions
        );

        this.panel.onDidDispose(
            () => { this.panel = undefined; },
            undefined,
            this.context.subscriptions
        );

        await this.sendCurrentSettings();
    }

    private async handleMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'saveSettings':
                await this.saveSettings(message.data);
                break;
            case 'testConnection':
                await this.testConnection(message.data);
                break;
            case 'clearApiKey':
                await this.clearApiKey();
                break;
            case 'providerChanged':
                await this.handleProviderChange(message.provider);
                break;
            case 'refreshModels':
                await this.refreshModels(message.provider);
                break;
            case 'ready':
                await this.sendCurrentSettings();
                break;
        }
    }

    private async saveSettings(data: any): Promise<void> {
        try {
            await this.settingsService.saveSettings({
                provider: data.provider,
                model: data.model,
                apiKey: data.apiKey
            });

            this.panel?.webview.postMessage({
                command: 'settingsSaved',
                success: true,
                message: `✅ Settings saved successfully for ${data.provider}!`
            });

            await this.sendCurrentSettings();
        } catch (error: any) {
            this.panel?.webview.postMessage({
                command: 'settingsSaved',
                success: false,
                message: `❌ Failed to save: ${error.message}`
            });
        }
    }

    private async testConnection(data: any): Promise<void> {
        try {
            const provider = this.aiService.getProvider(data.provider);
            if (!provider) {
                throw new Error(`Provider ${data.provider} not found`);
            }
            const providerName = provider.displayName || data.provider;

            // Only test with the currently selected key in UI. If it's the masked default, we must fetch the real one.
            let apiKeyToTest = data.apiKey;
            if (apiKeyToTest === '••••••••••••••••••••••••••••••••••••••••••••••••') {
                apiKeyToTest = await this.settingsService.getApiKey(data.provider);
            }

            if (!apiKeyToTest && provider.name !== 'localhost') {
                throw new Error('No API key provided.');
            }

            const success = await provider.testConnection({
                apiKey: apiKeyToTest,
                model: data.model
            });
            
            this.panel?.webview.postMessage({
                command: 'connectionTested',
                success,
                message: success
                    ? `✅ Connection successful! ${providerName} is working.`
                    : `❌ Connection failed. Please check your ${providerName} API key.`
            });
        } catch (error: any) {
            this.panel?.webview.postMessage({
                command: 'connectionTested',
                success: false,
                message: `❌ Connection failed: ${error.message}`
            });
        }
    }

    private async clearApiKey(): Promise<void> {
        try {
            const settings = await this.settingsService.getSettings();
            await this.settingsService.deleteApiKey(settings.provider);
            
            const provider = this.aiService.getProvider(settings.provider);
            const providerName = provider?.displayName || settings.provider;

            this.panel?.webview.postMessage({
                command: 'apiKeyCleared',
                success: true,
                message: `✅ ${providerName} API key cleared successfully`
            });
            // No need to call sendCurrentSettings() - the webview handler already clears the field
        } catch (error: any) {
            this.panel?.webview.postMessage({
                command: 'apiKeyCleared',
                success: false,
                message: `❌ Failed to clear: ${error.message}`
            });
        }
    }

    private async handleProviderChange(newProvider: string): Promise<void> {
        try {
            const provider = this.aiService.getProvider(newProvider);
            if (!provider) {
                logger.error(`Provider ${newProvider} not found`);
                return;
            }

            this.panel?.webview.postMessage({ command: 'showModelLoading' });

            const apiKey = await this.settingsService.getApiKey(newProvider);
            
            // Fetch live models (returns defaults if no key or error)
            const models = await this.aiService.discoverModels(newProvider);

            const currentModel = this.settingsService.getModel(newProvider);
            const modelExists = models.includes(currentModel);
            const selectedModel = modelExists ? currentModel : models[0];

            this.panel?.webview.postMessage({
                command: 'providerChanged',
                provider: newProvider,
                models: models,
                selectedModel: selectedModel,
                hasApiKey: apiKey.length > 0
            });
        } catch (error: any) {
            logger.error(`Failed to handle provider change: ${error.message}`);
        }
    }

    private async refreshModels(providerName: string): Promise<void> {
        try {
            this.panel?.webview.postMessage({ command: 'showModelLoading' });
            
            const models = await this.aiService.discoverModels(providerName);
            const currentModel = this.settingsService.getModel(providerName);
            const modelExists = models.includes(currentModel);
            const selectedModel = modelExists ? currentModel : models[0];

            this.panel?.webview.postMessage({
                command: 'modelsRefreshed',
                models: models,
                selectedModel: selectedModel
            });
        } catch (error: any) {
            logger.error(`Failed to refresh models: ${error.message}`);
        }
    }

    private async sendCurrentSettings(): Promise<void> {
        const settings = await this.settingsService.getSettings();
        const provider = this.aiService.getProvider(settings.provider);
        
        if (!provider) {
            logger.error(`Provider ${settings.provider} not found`);
            return;
        }

        // Fetch live models if possible
        const models = await this.aiService.discoverModels(settings.provider);

        // Use current model if it exists in provider, otherwise use provider's default
        const currentModel = this.settingsService.getModel(settings.provider);
        const modelExists = currentModel && models.includes(currentModel);
        const selectedModel = modelExists ? currentModel : models[0];

        this.panel?.webview.postMessage({
            command: 'loadSettings',
            settings: {
                provider: settings.provider,
                model: selectedModel,
                hasApiKey: settings.apiKey.length > 0
            },
            providers: this.getAllProvidersConfig(),
            models: models
        });
    }

    private getAllProvidersConfig() {
        return [
            {
                id: 'groq',
                name: 'Groq',
                description: 'Fast, free AI inference with latest production models',
                free: true,
                keyPlaceholder: 'Paste your Groq API key here (gsk_...)',
                helpUrl: 'https://console.groq.com',
                setupSteps: [
                    'Go to console.groq.com and sign up for a free account',
                    'Click "API Keys" in the left sidebar',
                    'Create a new API key and copy it (starts with gsk_)',
                    'Paste the key below and click Save Settings'
                ]
            },
            {
                id: 'gemini',
                name: 'Google Gemini',
                description: 'Google AI models with advanced reasoning and vision',
                free: true,
                keyPlaceholder: 'Paste your Gemini API key here (AIza...)',
                helpUrl: 'https://makersuite.google.com/app/apikey',
                setupSteps: [
                    'Go to makersuite.google.com/app/apikey',
                    'Sign in with your Google account',
                    'Click "Create API Key" and copy it (starts with AIza)',
                    'Paste the key below and click Save Settings'
                ]
            },
            {
                id: 'openai',
                name: 'OpenAI',
                description: 'GPT-4, GPT-4o, and reasoning models (o-series)',
                free: false,
                keyPlaceholder: 'Paste your OpenAI API key here (sk-...)',
                helpUrl: 'https://platform.openai.com/api-keys',
                setupSteps: [
                    'Go to platform.openai.com/api-keys',
                    'Sign in to your OpenAI account',
                    'Click "Create new secret key" and copy it (starts with sk-)',
                    'Paste the key below and click Save Settings'
                ]
            },
            {
                id: 'deepseek',
                name: 'DeepSeek',
                description: 'Advanced reasoning models with 1M context (V4)',
                free: false,
                keyPlaceholder: 'Paste your DeepSeek API key here',
                helpUrl: 'https://platform.deepseek.com',
                setupSteps: [
                    'Go to platform.deepseek.com',
                    'Sign up or sign in to your account',
                    'Navigate to API Keys section',
                    'Create a new API key and copy it',
                    'Paste the key below and click Save Settings'
                ]
            },
            {
                id: 'cerebras',
                name: 'Cerebras',
                description: 'Ultra-fast inference (Free Tier: 1M tokens/day)',
                free: true,
                keyPlaceholder: 'Paste your Cerebras API key here',
                helpUrl: 'https://cloud.cerebras.ai',
                setupSteps: [
                    'Go to cloud.cerebras.ai',
                    'Sign in with your email or GitHub',
                    'Go to the API Keys section',
                    'Create a new API key and copy it',
                    'Paste the key below and click Save Settings'
                ]
            },
            {
                id: 'openrouter',
                name: 'OpenRouter',
                description: 'Access 100+ free models (No credit card required)',
                free: true,
                keyPlaceholder: 'Paste your OpenRouter API key here',
                helpUrl: 'https://openrouter.ai/keys',
                setupSteps: [
                    'Go to openrouter.ai/keys',
                    'Sign in with your email, Google, or GitHub',
                    'Click "Create Key" and copy it',
                    'Paste the key below and click Save Settings'
                ]
            },
            {
                id: 'localhost',
                name: 'Localhost',
                description: 'Local Ollama or LM Studio server with dynamic model discovery',
                free: true,
                keyPlaceholder: 'Optional: Auth token if your local server requires one',
                helpUrl: 'https://ollama.com',
                setupSteps: [
                    '📦 Install Ollama (ollama.com) or LM Studio (lmstudio.ai)',
                    '🔷 Ollama runs at localhost:11434 | LM Studio at localhost:1234',
                    '▶️  Start your local server',
                    '📥 For Ollama: run "ollama pull qwen3.5:4b" (or any model)',
                    '🔄 Click "Refresh Models" to discover your installed models',
                    '✅ Select a model and click "Save Settings"',
                    '⚠️  API key is optional for Ollama'
                ]
            }
        ];
    }

    private async getHtmlContent(): Promise<string> {
        const nonce = this.getNonce();
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
    <title>Chaubey Ji — Settings</title>
    <style nonce="${nonce}">
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #0d1117;
            color: #e6edf3;
            margin: 0;
            padding: 0;
            min-height: 100vh;
        }
        .header {
            background: linear-gradient(135deg, #1a2332 0%, #0d1117 100%);
            border-bottom: 1px solid #21262d;
            padding: 24px 32px;
            display: flex;
            align-items: center;
            gap: 16px;
        }
        .header-icon {
            width: 48px; height: 48px;
            background: linear-gradient(135deg, #f6c549, #e8970d);
            border-radius: 12px;
            display: flex; align-items: center; justify-content: center;
            font-size: 24px;
        }
        .header-title { font-size: 22px; font-weight: 700; color: #fff; }
        .header-sub { font-size: 13px; color: #8b949e; margin-top: 2px; }

        .container { max-width: 640px; margin: 32px auto; padding: 0 24px 48px; }

        .card {
            background: #161b22;
            border: 1px solid #21262d;
            border-radius: 12px;
            margin-bottom: 20px;
            overflow: hidden;
        }
        .card-header {
            padding: 18px 24px 14px;
            border-bottom: 1px solid #21262d;
            display: flex; align-items: center; gap: 10px;
        }
        .card-header-icon { font-size: 18px; }
        .card-header-title { font-size: 16px; font-weight: 600; color: #fff; }
        .card-body { padding: 20px 24px; }

        .badge {
            display: inline-flex; align-items: center; gap: 6px;
            background: #1f6feb22;
            border: 1px solid #1f6feb66;
            color: #58a6ff;
            font-size: 12px;
            font-weight: 600;
            padding: 4px 10px;
            border-radius: 20px;
            margin-left: auto;
        }
        .badge.free { background: #238636;  border-color: #2ea04366; color: #3fb950; }

        .form-group { margin-bottom: 18px; }
        .form-group:last-child { margin-bottom: 0; }
        label { display: block; font-size: 13px; font-weight: 600; color: #c9d1d9; margin-bottom: 8px; }
        .help-text { font-size: 12px; color: #8b949e; margin-top: 6px; line-height: 1.5; }

        input[type="password"], select {
            width: 100%;
            background: #0d1117;
            color: #e6edf3;
            border: 1px solid #30363d;
            border-radius: 8px;
            padding: 10px 14px;
            font-size: 14px;
            font-family: inherit;
            outline: none;
            transition: border-color 0.2s;
        }
        input[type="password"]:focus, select:focus { border-color: #58a6ff; box-shadow: 0 0 0 3px #1f6feb22; }
        select option { background: #161b22; color: #e6edf3; }

        .key-status {
            display: flex; align-items: center; gap: 8px;
            margin-top: 8px; font-size: 13px; font-weight: 500;
        }
        .key-status.has-key { color: #3fb950; }
        .key-status.no-key { color: #f85149; }

        .btn-group { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
        button {
            padding: 9px 18px; border-radius: 8px; font-size: 13px; font-weight: 600;
            cursor: pointer; border: none; transition: all 0.15s; font-family: inherit;
            display: inline-flex; align-items: center; gap: 6px;
        }
        .btn-primary { background: #238636; color: #fff; }
        .btn-primary:hover { background: #2ea043; }
        .btn-secondary { background: #21262d; color: #c9d1d9; border: 1px solid #30363d; }
        .btn-secondary:hover { background: #30363d; color: #e6edf3; }
        .btn-danger { background: #da3633; color: #fff; }
        .btn-danger:hover { background: #f85149; }
        button:disabled { opacity: 0.5; cursor: not-allowed; }

        .message {
            padding: 12px 16px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 500;
            margin-bottom: 20px;
            display: none;
            line-height: 1.4;
        }
        .message.success { background: #1f4429; border: 1px solid #2ea043; color: #3fb950; }
        .message.error { background: #3d1212; border: 1px solid #da3633; color: #f85149; }
        .message.info { background: #1f3a5f; border: 1px solid #1f6feb; color: #58a6ff; }

        .steps { list-style: none; padding: 0; margin: 0; }
        .steps li {
            display: flex; gap: 12px; align-items: flex-start;
            padding: 10px 0; border-bottom: 1px solid #21262d;
            font-size: 13px; color: #c9d1d9; line-height: 1.5;
        }
        .steps li:last-child { border-bottom: none; }
        .step-num {
            flex-shrink: 0; width: 24px; height: 24px;
            background: #1f6feb; border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            font-size: 11px; font-weight: 700; color: #fff;
        }
        a { color: #58a6ff; text-decoration: none; }
        a:hover { text-decoration: underline; }
        code {
            background: #21262d; color: #e6edf3; padding: 2px 6px;
            border-radius: 4px; font-size: 12px;
        }
        .loading { animation: spin 1s linear infinite; display: inline-block; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        
        .provider-desc { font-size: 13px; color: #8b949e; margin-top: 4px; }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-icon">🤖</div>
        <div>
            <div class="header-title">Chaubey Ji — Settings</div>
            <div class="header-sub">Configure your AI provider and API key</div>
        </div>
    </div>

    <div class="container">
        <div id="message" class="message"></div>

        <!-- Provider Selection -->
        <div class="card">
            <div class="card-header">
                <span class="card-header-icon">🔌</span>
                <span class="card-header-title">AI Provider</span>
            </div>
            <div class="card-body">
                <div class="form-group">
                    <label for="provider">Select Provider</label>
                    <select id="provider">
                        <!-- Populated by JS -->
                    </select>
                    <div id="providerDesc" class="provider-desc"></div>
                </div>
            </div>
        </div>

        <!-- Setup Guide (dynamic per provider) -->
        <div class="card" id="setupCard">
            <div class="card-header">
                <span class="card-header-icon">📋</span>
                <span class="card-header-title" id="setupTitle">How to Get Your API Key</span>
                <span class="badge" id="setupBadge">🆓 Free</span>
            </div>
            <div class="card-body">
                <ol class="steps" id="setupSteps">
                    <!-- Populated by JS -->
                </ol>
            </div>
        </div>

        <!-- Model Selection -->
        <div class="card">
            <div class="card-header">
                <span class="card-header-icon">🧠</span>
                <span class="card-header-title">AI Model</span>
                <button id="refreshModelsBtn" class="btn-secondary" style="margin-left: auto; padding: 4px 10px; font-size: 12px;">🔄 Refresh</button>
            </div>
            <div class="card-body">
                <div class="form-group">
                    <label for="model">Select Model</label>
                    <select id="model">
                        <!-- Populated by JS -->
                    </select>
                    <div class="help-text" id="modelHelp">
                        Choose the AI model for your tasks
                    </div>
                </div>
            </div>
        </div>

        <!-- API Key -->
        <div class="card">
            <div class="card-header">
                <span class="card-header-icon">🔑</span>
                <span class="card-header-title" id="keyTitle">API Key</span>
            </div>
            <div class="card-body">
                <div class="form-group">
                    <label for="apiKey">API Key</label>
                    <input type="password" id="apiKey" placeholder="Paste your API key here">
                    <div id="keyStatus" class="key-status no-key">⚠️ No API key configured</div>
                    <div class="help-text">Your key is stored securely and never shared or logged.</div>
                </div>
                <div class="btn-group">
                    <button class="btn-danger" id="clearKeyBtn">🗑️ Clear API Key</button>
                </div>
            </div>
        </div>

        <!-- Save & Test -->
        <div class="btn-group">
            <button class="btn-primary" id="saveBtn">💾 Save Settings</button>
            <button class="btn-secondary" id="testBtn">🔌 Test Connection</button>
            <span id="loadingSpinner" style="display:none;color:#8b949e;font-size:13px;align-self:center;">
                <span class="loading">⏳</span> Please wait...
            </span>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        
        let providersConfig = [];
        let currentProvider = 'groq';

        vscode.postMessage({ command: 'ready' });

        window.addEventListener('message', event => {
            const msg = event.data;
            switch (msg.command) {
                case 'loadSettings':
                    loadSettings(msg.settings, msg.providers, msg.models);
                    break;
                case 'providerChanged':
                    updateProviderUI(msg.provider, msg.models, msg.selectedModel, msg.hasApiKey);
                    break;
                case 'modelsRefreshed':
                    hideLoading();
                    updateModelDropdown(msg.models, msg.selectedModel);
                    showMessage('success', 'Models refreshed successfully');
                    break;
                case 'showModelLoading':
                    showLoading();
                    break;
                case 'settingsSaved':
                    hideLoading();
                    showMessage(msg.success ? 'success' : 'error', msg.message);
                    break;
                case 'connectionTested':
                    hideLoading();
                    showMessage(msg.success ? 'success' : 'error', msg.message);
                    break;
                case 'apiKeyCleared':
                    hideLoading();
                    showMessage(msg.success ? 'success' : 'error', msg.message);
                    if (msg.success) {
                        document.getElementById('apiKey').value = '';
                        updateKeyStatus(false);
                    }
                    break;
            }
        });

        function loadSettings(settings, providers, models) {
            providersConfig = providers;
            currentProvider = settings.provider;

            // Populate provider dropdown
            const providerSelect = document.getElementById('provider');
            providerSelect.innerHTML = '';
            providers.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                opt.selected = p.id === settings.provider;
                providerSelect.appendChild(opt);
            });

            // Update UI for current provider
            updateProviderUI(settings.provider, models, settings.model, settings.hasApiKey);
        }

        function updateProviderUI(providerId, models, selectedModel, hasApiKey) {
            currentProvider = providerId;
            const providerConfig = providersConfig.find(p => p.id === providerId);
            if (!providerConfig) return;

            // Update provider description
            document.getElementById('providerDesc').textContent = providerConfig.description;

            // Update setup guide
            document.getElementById('setupTitle').textContent = \`How to Get Your \${providerConfig.name} API Key\`;
            const badge = document.getElementById('setupBadge');
            badge.textContent = providerConfig.free ? '🆓 Free' : '💳 Paid';
            badge.className = providerConfig.free ? 'badge free' : 'badge';

            const stepsContainer = document.getElementById('setupSteps');
            stepsContainer.innerHTML = '';
            providerConfig.setupSteps.forEach((step, i) => {
                const li = document.createElement('li');
                li.innerHTML = \`
                    <span class="step-num">\${i + 1}</span>
                    <span>\${step}</span>
                \`;
                stepsContainer.appendChild(li);
            });

            // Update model dropdown
            updateModelDropdown(models, selectedModel);

            // Update API key placeholder
            document.getElementById('apiKey').placeholder = providerConfig.keyPlaceholder;

            // Update API key title
            document.getElementById('keyTitle').textContent = \`\${providerConfig.name} API Key\`;

            // Update key status
            const apiInput = document.getElementById('apiKey');
            if (hasApiKey) {
                apiInput.value = '••••••••••••••••••••••••••••••••••••••••••••••••';
            } else {
                apiInput.value = '';
            }
            updateKeyStatus(hasApiKey);
            hideLoading();
        }

        function updateModelDropdown(models, selectedModel) {
            const modelSelect = document.getElementById('model');
            modelSelect.innerHTML = '';
            models.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m;
                opt.textContent = m;
                opt.selected = m === selectedModel;
                modelSelect.appendChild(opt);
            });
        }

        function updateKeyStatus(hasKey) {
            const el = document.getElementById('keyStatus');
            if (hasKey) {
                el.textContent = '✅ API key is configured';
                el.className = 'key-status has-key';
            } else {
                el.textContent = '⚠️ No API key configured';
                el.className = 'key-status no-key';
            }
        }

        function showMessage(type, text) {
            const el = document.getElementById('message');
            el.className = 'message ' + type;
            el.textContent = text;
            el.style.display = 'block';
            setTimeout(() => { el.style.display = 'none'; }, 6000);
        }

        function showLoading() {
            document.getElementById('loadingSpinner').style.display = 'inline-flex';
            document.getElementById('saveBtn').disabled = true;
            document.getElementById('testBtn').disabled = true;
        }

        function hideLoading() {
            document.getElementById('loadingSpinner').style.display = 'none';
            document.getElementById('saveBtn').disabled = false;
            document.getElementById('testBtn').disabled = false;
        }

        // Provider change handler
        document.getElementById('provider').addEventListener('change', (e) => {
            const newProvider = e.target.value;
            vscode.postMessage({ command: 'providerChanged', provider: newProvider });
        });

        // Save button
        document.getElementById('saveBtn').addEventListener('click', () => {
            showLoading();
            let key = document.getElementById('apiKey').value;
            if (key === '••••••••••••••••••••••••••••••••••••••••••••••••') {
                key = undefined;
            }
            vscode.postMessage({
                command: 'saveSettings',
                data: {
                    provider: document.getElementById('provider').value,
                    model: document.getElementById('model').value,
                    apiKey: key
                }
            });
        });

        // Test button
        document.getElementById('testBtn').addEventListener('click', () => {
            showLoading();
            let key = document.getElementById('apiKey').value;
            vscode.postMessage({ 
                command: 'testConnection',
                data: {
                    provider: document.getElementById('provider').value,
                    model: document.getElementById('model').value,
                    apiKey: key
                }
            });
        });

        // Refresh Models button
        document.getElementById('refreshModelsBtn').addEventListener('click', () => {
            showLoading();
            vscode.postMessage({ command: 'refreshModels', provider: currentProvider });
        });

        // Clear key button
        const clearKeyBtn = document.getElementById('clearKeyBtn');
        if (clearKeyBtn) {
            clearKeyBtn.addEventListener('click', () => {
                if (confirm('Clear your API key for this provider?')) {
                    showLoading();
                    vscode.postMessage({ command: 'clearApiKey' });
                }
            });
        }
    </script>
</body>
</html>`;
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
