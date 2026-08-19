
    const vscode = acquireVsCodeApi();
    let S = { status: 'idle', mode: 'analyze' };
    let lastGen = 0;
    let lang = 'en';
    let isLight = false;
    let ttsOn = false;

    const LANGS = [
        { code:'en',  flag:'🇬🇧', name:'English' },
        { code:'hi',  flag:'🇮🇳', name:'Hindi (हिन्दी)' },
        { code:'bn',  flag:'🇮🇳', name:'Bengali (বাংলা)' },
        { code:'te',  flag:'🇮🇳', name:'Telugu (తెలుగు)' },
        { code:'mr',  flag:'🇮🇳', name:'Marathi (मराठी)' },
        { code:'ta',  flag:'🇮🇳', name:'Tamil (தமிழ்)' },
        { code:'gu',  flag:'🇮🇳', name:'Gujarati (ગુજરાતી)' },
        { code:'kn',  flag:'🇮🇳', name:'Kannada (ಕನ್ನಡ)' },
        { code:'ml',  flag:'🇮🇳', name:'Malayalam (മലയാളം)' },
        { code:'pa',  flag:'🇮🇳', name:'Punjabi (ਪੰਜਾਬੀ)' },
        { code:'or',  flag:'🇮🇳', name:'Odia (ଓଡ଼ିଆ)' }
    ];

    const LANG_VOICE_CODES = {
        hi: 'hi-IN', bn: 'bn-IN', te: 'te-IN', mr: 'mr-IN',
        ta: 'ta-IN', gu: 'gu-IN', kn: 'kn-IN', ml: 'ml-IN',
        pa: 'pa-IN', or: 'or-IN', en: 'en-US'
    };

    window.addEventListener('message', function(ev) {
        try {
            var m = ev.data;
            if (m.command === 'updateState') {
                var g = typeof m.generation === 'number' ? m.generation : 0;
                if (g <= lastGen) return;
                lastGen = g;
                S = m.state;
                render();
                try { vscode.postMessage({ command: 'webviewReceivedUpdateState', generation: g }); } catch(_){}
            }
            if (m.command === 'uiLanguageChanged') {
                lang = m.code || 'en';
                render();
            }
        } catch(e){}
    });

    // ---- helpers ----
    function esc(s) {
        return (s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
    }
    function getLang() { return LANGS.find(l=>l.code===lang) || LANGS[0]; }

    function toggleTheme() {
        isLight = !isLight;
        if (isLight) {
            document.body.classList.add('light');
        } else {
            document.body.classList.remove('light');
        }
        render();
    }

    function toggleListen() {
        if (!window.speechSynthesis) return;
        if (ttsOn) {
            window.speechSynthesis.cancel();
            ttsOn = false;
            render();
            return;
        }
        var text = '';
        if (S.mode === 'chat') {
            if (S.chatMessages && S.chatMessages.length > 0) {
                var last = S.chatMessages[S.chatMessages.length - 1];
                text = last.content || '';
            } else if (S.chatLastAssistantContent) {
                text = S.chatLastAssistantContent;
            }
        } else {
            text = S.response || '';
        }
        if (!text.trim()) return;

        var cleanText = text.replace(/\`\`\`[\s\S]*?\`\`\`/g, ' Code snippet omitted. ').replace(/[*#_\`]/g, '');
        var utt = new SpeechSynthesisUtterance(cleanText);
        var targetLangCode = LANG_VOICE_CODES[lang] || 'en-US';
        utt.lang = targetLangCode;

        // Try to pick matching voice
        var voices = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
        if (voices && voices.length) {
            var match = voices.find(v => v.lang && v.lang.startsWith(targetLangCode.split('-')[0]));
            if (match) utt.voice = match;
        }

        utt.onend = function(){ ttsOn = false; render(); };
        utt.onerror = function(){ ttsOn = false; render(); };
        ttsOn = true;
        window.speechSynthesis.speak(utt);
        render();
    }

    function saveResponse() {
        var text = '';
        if (S.mode === 'chat') {
            if (S.chatMessages && S.chatMessages.length > 0) {
                text = S.chatMessages.map(m => (m.role==='user'?'**User:** ':'**AI Assistant:** ') + m.content).join('\n\n');
            } else if (S.chatLastAssistantContent) {
                text = S.chatLastAssistantContent;
            }
        } else {
            text = S.response || '';
        }
        vscode.postMessage({ command: 'chatSaveLastAssistant', text: text });
    }

    function onLangChange(code) {
        lang = code;
        vscode.postMessage({ command: 'setUiLanguage', code: code });
    }

    function copyCodeBlock(btn) {
        try {
            var block = btn.closest ? btn.closest('.code-block') : btn.parentElement.parentElement;
            var codeEl = block ? block.querySelector('code') : null;
            if (!codeEl) return;
            var text = codeEl.innerText || codeEl.textContent || '';
            var orig = btn.innerHTML;
            function showDone() {
                btn.innerHTML = '✔ Copied!';
                btn.style.color = '#7ee787';
                setTimeout(function(){
                    btn.innerHTML = orig;
                    btn.style.color = '';
                }, 2000);
            }

            // Method 1: Extension host clipboard write (guaranteed in VS Code)
            vscode.postMessage({ command: 'copyResponse', text: text });

            // Method 2: execCommand fallback
            try {
                var ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.top = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            } catch(_){}

            // Method 3: clipboard API fallback
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).catch(function(){});
            }

            showDone();
        } catch(e) {}
    }

    function sendChat() {
        var inp = document.getElementById('chat-input');
        if (!inp) return;
        var text = (inp.value || '').trim();
        if (!text) return;
        inp.value = '';
        inp.style.height = '';
        vscode.postMessage({ command: 'chatSendMessage', text: text });
    }

    function onChatKey(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
    }

    // ---- render ----
    function render() {
        try {
            var app = document.getElementById('app');
            if (!app) return;

            // Ensure body light class matches state
            if (isLight) { document.body.classList.add('light'); }
            else { document.body.classList.remove('light'); }

            var action = S.action || (S.mode === 'chat' ? 'Chat Discussion' : 'AI Assistant');
            var provider = S.providerName || 'Siddhi';
            var brand = 'Siddhi';
            var curLang = getLang();
            var themeLabel = isLight ? '🌙 Night' : '☀️ Day';
            var listenLabel = ttsOn ? '⏹ Stop' : '🔊 Listen';

            var langOpts = LANGS.map(function(l){
                return '<option value="'+l.code+'"'+(l.code===lang?' selected':'')+'>'+l.flag+' '+l.name+'</option>';
            }).join('');

            var html =
                '<div class="sh">' +
                    '<div><div class="sh-logo">'+esc(brand)+'</div><div class="sh-sub">'+esc(action)+'</div></div>' +
                    '<button class="btn" onclick="toggleTheme()">'+themeLabel+'</button>' +
                '</div>' +
                '<div class="toolbar">' +
                    '<div class="toolbar-row">' +
                        '<span class="toolbar-label">🌐 Language</span>' +
                        '<div class="toolbar-actions">' +
                            '<span class="btn">'+curLang.flag+' '+curLang.name+'</span>' +
                            '<button class="btn'+(ttsOn?' active':'')+'" onclick="toggleListen()">'+listenLabel+'</button>' +
                            '<button class="btn" onclick="saveResponse()">📥 Save</button>' +
                        '</div>' +
                    '</div>' +
                    '<select class="lang-select" onchange="onLangChange(this.value)">'+langOpts+'</select>' +
                '</div>';

            // Main content
            if (S.mode === 'chat') {
                html += renderChat();
            } else if (S.status === 'idle') {
                html += '<div class="content"><div class="empty"><div class="empty-icon">🤖</div>Select some code and right-click to choose an AI action.</div></div>';
            } else if (S.status === 'loading') {
                html += '<div class="content"><div class="loading"><div class="spinner"></div><div style="color:var(--muted);">Generating '+esc(action)+' response...</div></div></div>';
            } else if (S.status === 'error') {
                html += '<div class="content"><div class="error">❌ '+esc(S.error||'An error occurred.')+'</div></div>';
            } else if (S.status === 'success') {
                html += '<div class="content">';
                html += '<div class="card-title">📄 '+esc(action)+'</div>';
                html += '<div class="resp">'+(S.responseHtml || '<pre><code>'+esc(S.response)+'</code></pre>')+'</div>';
                html += '</div>';
            }

            // Footer
            var charCount = 0;
            if (S.mode === 'chat' && S.chatMessages) {
                charCount = S.chatMessages.reduce((sum, m) => sum + (m.content ? m.content.length : 0), 0);
            } else {
                charCount = (S.response || '').length;
            }

            html +=
                '<div class="footer">' +
                    '<div class="footer-brand">✨ Powered by '+esc(brand)+' AI</div>' +
                    '<div>'+charCount+' characters</div>' +
                '</div>';

            app.innerHTML = html;

            // Re-attach textarea auto-resize
            var inp = document.getElementById('chat-input');
            if (inp) {
                inp.addEventListener('input', function(){ this.style.height=''; this.style.height=Math.min(this.scrollHeight,120)+'px'; });
            }
        } catch(e) {
            document.getElementById('app').innerHTML = '<div style="color:red;padding:20px">Render error: '+e.message+'</div>';
        }
    }

    function renderChat() {
        var msgs = S.chatMessages || [];
        var html = '<div class="content"><div class="card-title">💬 Chat Discussion</div>';
        html += '<div class="chat-container">';

        // If no messages yet, show selection preview in a clean card
        if (msgs.length === 0 && S.chatCodeContext && S.chatCodeContext.fileName) {
            var ctx = S.chatCodeContext;
            html += '<div class="chat-card">';
            html += '<div style="color:var(--muted);font-weight:600;margin-bottom:8px;font-size:12px;">📎 ' + esc(ctx.fileName) + ' (' + esc(ctx.languageName||ctx.languageId) + ', ' + ctx.lineCount + ' lines)</div>';
            if (ctx.selectedCodePreviewHtml) {
                html += ctx.selectedCodePreviewHtml;
            }
            html += '<div style="color:var(--muted);margin-top:10px;font-size:12.5px;">Ask anything about the selected code below.</div>';
            html += '</div>';
        }

        // Messages list
        for (var i = 0; i < msgs.length; i++) {
            var msg = msgs[i];
            if (msg.role === 'user') {
                html += '<div class="chat-card-user">' + esc(msg.content) + '</div>';
            } else {
                html += '<div class="chat-card"><div class="resp">' + (msg.renderedHtml || esc(msg.content)) + '</div></div>';
            }
        }

        if (S.status === 'loading') {
            html += '<div class="chat-card"><div style="color:var(--muted);font-style:italic;">⏳ Thinking...</div></div>';
        }

        html += '</div></div>'; // .chat-container, .content

        // Sticky chat input
        html +=
            '<div class="chat-input-box">' +
                '<textarea id="chat-input" class="chat-input" placeholder="Type your message..." onkeydown="onChatKey(event)" rows="1"></textarea>' +
                '<button class="chat-send-btn" onclick="sendChat()">Send</button>' +
            '</div>';

        return html;
    }

    try { vscode.postMessage({ command: 'ready' }); } catch(e) {}
    render();
