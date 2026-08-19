
        const vscode = acquireVsCodeApi();
        let currentState = { status: 'idle', mode: 'analyze' };
        let lastProcessedGeneration = 0;
        let availableLanguages = [];
        let currentLanguage = 'en';
        let isLightMode = false;
        let ttsActive = false;
        let ttsUtterance = null;

        const langMap = [
            { code: 'en', native: 'GB English' },
            { code: 'hi', native: 'IN Hindi (हिन्दी)' },
            { code: 'bn', native: 'IN Bengali (বাংলা)' },
            { code: 'te', native: 'IN Telugu (తెలుగు)' },
            { code: 'mr', native: 'IN Marathi (मराठी)' },
            { code: 'ta', native: 'IN Tamil (தமிழ்)' },
            { code: 'gu', native: 'IN Gujarati (ગુજરાતી)' },
            { code: 'kn', native: 'IN Kannada (ಕನ್ನಡ)' },
            { code: 'ml', native: 'IN Malayalam (മലയാളം)' },
            { code: 'pa', native: 'IN Punjabi (ਪੰਜਾਬੀ)' },
            { code: 'or', native: 'IN Odia (ଓଡ଼ିଆ)' }
        ];

        (function() {
            try { vscode.postMessage({ command: 'ready' }); } catch(e){}
        })();

        window.addEventListener('message', function(event) {
            try {
                var message = event.data;
                if (message.command === 'updateState') {
                    var gen = typeof message.generation === 'number' ? message.generation : 0;
                    if (gen <= lastProcessedGeneration) return;
                    lastProcessedGeneration = gen;
                    currentState = message.state;
                    render();
                }
                if (message.command === 'languagesLoaded') {
                    // Ignore old lang command, we use our hardcoded map for UI accuracy
                }
                if (message.command === 'uiLanguageChanged') {
                    currentLanguage = message.code || 'en';
                    render();
                }
            } catch(e){}
        });

        function toggleTheme() {
            isLightMode = !isLightMode;
            if (isLightMode) {
                document.documentElement.classList.add('light-mode');
            } else {
                document.documentElement.classList.remove('light-mode');
            }
            render();
        }

        function toggleListen() {
            if (ttsActive) { stopTts(); return; }
            if (!window.speechSynthesis) return;
            var text = currentState.response || '';
            if (currentState.mode === 'chat' && currentState.chatLastAssistantContent) {
                text = currentState.chatLastAssistantContent;
            }
            if (!text.trim()) return;
            ttsUtterance = new SpeechSynthesisUtterance(text);
            ttsUtterance.onend = function() { ttsActive = false; render(); };
            ttsUtterance.onerror = function() { ttsActive = false; render(); };
            ttsActive = true;
            window.speechSynthesis.speak(ttsUtterance);
            render();
        }
        function stopTts() {
            if (window.speechSynthesis) window.speechSynthesis.cancel();
            ttsActive = false;
            ttsUtterance = null;
            render();
        }
        function saveResponse() {
            vscode.postMessage({ command: 'chatSaveLastAssistant' });
        }
        function onLangChange(code) {
            currentLanguage = code;
            vscode.postMessage({ command: 'setUiLanguage', code: code });
        }
        function copyCodeBlock(btn) {
            try {
                var codeEl = btn.parentElement.nextElementSibling.querySelector('code');
                if (codeEl) {
                    vscode.postMessage({ command: 'copyResponse', text: codeEl.innerText });
                    var orig = btn.innerHTML;
                    btn.innerHTML = '&#x2714; Copied';
                    setTimeout(function(){ btn.innerHTML = orig; }, 2000);
                }
            } catch(e){}
        }

        function render() {
            var app = document.getElementById('app');
            if (!app) return;

            var actionName = currentState.action || 'Analyze Code';
            var providerName = currentState.providerName || 'Siddhi';
            
            // Branding override based on request (Siddhi style)
            var brandingName = providerName;
            if (providerName.toLowerCase().includes('gemini') || providerName.toLowerCase() === 'ai') {
                brandingName = 'Siddhi'; 
            }

            // Options mapping
            var langOpts = langMap.map(l => 
                '<option value="' + l.code + '"' + (l.code === currentLanguage ? ' selected' : '') + '>' + l.native + '</option>'
            ).join('');

            var themeBtn = isLightMode 
                ? '<button class="siddhi-day-toggle" onclick="toggleTheme()">🌙 Night</button>'
                : '<button class="siddhi-day-toggle" onclick="toggleTheme()">☀️ Day</button>';
            
            var listenBtn = ttsActive
                ? '<button class="siddhi-btn" onclick="toggleListen()">⏹ Stop</button>'
                : '<button class="siddhi-btn" onclick="toggleListen()">🔊 Listen</button>';

            var html = "\n                <!-- Header -->\n                <div class=\"siddhi-header\">\n                    <div>\n                        <div class=\"siddhi-logo\">' + brandingName + '</div>\n                        <div class=\"siddhi-subtitle\">' + actionName + '</div>\n                    </div>\n                    ' + themeBtn + '\n                </div>\n\n                <!-- Toolbar -->\n                <div class=\"siddhi-toolbar\">\n                    <div class=\"siddhi-toolbar-top\">\n                        <div class=\"siddhi-toolbar-label\">🌐 Language</div>\n                        <div class=\"siddhi-toolbar-actions\">\n                            <span class=\"siddhi-btn\">GB English</span>\n                            ' + listenBtn + '\n                            <button class=\"siddhi-btn\" onclick=\"saveResponse()\">📥 Save</button>\n                        </div>\n                    </div>\n                    <select class=\"siddhi-lang-dropdown\" onchange=\"onLangChange(this.value)\">\n                        ' + langOpts + '\n                    </select>\n                </div>\n                \n                <!-- Main Content -->\n                <div class=\"siddhi-content\">\n            ";

            if (currentState.status === 'idle') {
                html += '<div class="empty-state">Select some code and right-click to choose an action.</div>';
            } else if (currentState.status === 'loading') {
                html += '<div class="loading"><div class="spinner">⏳</div><div style="margin-top:12px;">Generating response...</div></div>';
            } else if (currentState.status === 'error') {
                html += '<div class="error-card">❌ ' + (currentState.error || 'An error occurred.') + '</div>';
            } else if (currentState.status === 'success' || (currentState.mode === 'chat' && currentState.chatMessagesHtml)) {
                
                html += '<div class="siddhi-card-title">📄 ' + actionName + '</div>';
                html += '<div class="siddhi-response-body">';
                
                if (currentState.mode === 'chat') {
                    html += currentState.chatMessagesHtml || '';
                } else {
                    html += currentState.responseHtml || ('<pre>' + (currentState.response || '') + '</pre>');
                }

                html += '</div>';
            }

            html += "\n                </div>\n                <!-- Footer -->\n                <div class=\"siddhi-footer\">\n                    <div class=\"siddhi-footer-left\">\n                        <span class=\"siddhi-footer-icon\">✨</span>\n                        Powered by ' + brandingName + ' AI\n                    </div>\n                    <div>' + (currentState.response || '').length + ' characters</div>\n                </div>\n            ";

            app.innerHTML = html;
        }
        
        render();
    