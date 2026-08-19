# Diagnostic Steps to Find the Connection Error

## What I Did

I added comprehensive diagnostic logging throughout the entire connection flow:

1. **GeminiProvider.generate()** - logs every detail of the HTTP request and response
2. **SettingsService.getApiKey()** - logs API key retrieval status (not the key itself)
3. **SettingsService.setApiKey()** - logs API key storage status
4. **AIService.testConnection()** - logs the full test flow
5. **SettingsViewProvider.saveSettings()** - logs the save operation

## What to Do Now

### Step 1: Reload the Extension
Press `Ctrl+R` in the **Extension Development Host** window

### Step 2: Open the Output Panel
1. Press `Ctrl+Shift+U` or go to **View → Output**
2. In the dropdown at the top right, select **"AI Assistant"**

### Step 3: Save Your API Key
1. Open Settings (Command Palette → "AI Assistant: Open AI Assistant Settings")
2. Enter your API key
3. Click **Save Settings**
4. Watch the Output panel - you'll see:
   ```
   [DIAGNOSTIC] ===== SAVE SETTINGS START =====
   [DIAGNOSTIC] Received from webview:
   [DIAGNOSTIC]   Provider: gemini
   [DIAGNOSTIC]   Model: gemini-3.6-flash
   [DIAGNOSTIC]   API key received: YES
   [DIAGNOSTIC]   API key length: 39
   [DIAGNOSTIC] Storing API key for provider: gemini
   [DIAGNOSTIC] Secret key name: aiAssistant.apiKey.gemini
   [DIAGNOSTIC] API key provided: YES
   [DIAGNOSTIC] API key length: 39
   [DIAGNOSTIC] API key stored successfully for provider: gemini
   [DIAGNOSTIC] Settings saved successfully
   [DIAGNOSTIC] ===== SAVE SETTINGS END =====
   ```

### Step 4: Test Connection
1. Click **Test Connection** button
2. Watch the Output panel - you'll see a detailed trace:
   ```
   [DIAGNOSTIC] ===== TEST CONNECTION START =====
   [DIAGNOSTIC] Settings retrieved:
   [DIAGNOSTIC]   Provider: gemini
   [DIAGNOSTIC]   Model: gemini-3.6-flash
   [DIAGNOSTIC]   Has API key: YES
   [DIAGNOSTIC]   API key length: 39
   [DIAGNOSTIC] Getting API key for provider: gemini
   [DIAGNOSTIC] Secret key name: aiAssistant.apiKey.gemini
   [DIAGNOSTIC] API key retrieved: YES
   [DIAGNOSTIC] API key length: 39
   [DIAGNOSTIC] Provider found: Google Gemini
   [DIAGNOSTIC] Available models: gemini-2.5-pro, gemini-2.5-flash, ...
   [DIAGNOSTIC] Using model: gemini-3.6-flash
   [DIAGNOSTIC] Calling provider.testConnection...
   [DIAGNOSTIC] Testing connection to Gemini API with model: gemini-3.6-flash
   [DIAGNOSTIC] Gemini API Request
   [DIAGNOSTIC] Model: gemini-3.6-flash
   [DIAGNOSTIC] URL: https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent
   [DIAGNOSTIC] Method: POST
   [DIAGNOSTIC] Has API key: YES
   [DIAGNOSTIC] API key length: 39
   [DIAGNOSTIC] Request body: {
     "contents": [...],
     "generationConfig": {
       "temperature": 0.7,
       "maxOutputTokens": 200
     }
   }
   [DIAGNOSTIC] HTTP Status: 400 (or whatever the actual status is)
   [DIAGNOSTIC] Status Text: Bad Request
   [DIAGNOSTIC] Error response body: {"error": {"code": 400, "message": "..."}}
   ```

### Step 5: Send Me the Logs

**Copy the ENTIRE OUTPUT from the Output panel** and send it to me.

The logs will show me:
- ✅ Whether the API key is being saved correctly
- ✅ Whether the API key is being retrieved correctly
- ✅ The exact URL being called
- ✅ The exact request body
- ✅ The HTTP status code from Google
- ✅ The exact error message from Google

## Common Issues to Look For

Based on the logs, I'll be able to identify:

1. **API Key Issues**
   - Wrong API key format
   - Expired API key
   - API key for wrong project

2. **Model Issues**
   - Model name typo
   - Model not available in your region
   - Model requires special access

3. **Request Issues**
   - Wrong request format
   - Missing required fields
   - Invalid parameters

4. **Authentication Issues**
   - API key not being sent in header
   - Wrong header name
   - API key truncated or corrupted

5. **Quota/Billing Issues**
   - Free tier limit exceeded
   - Billing not enabled
   - Rate limit hit

## Security Note

The diagnostic logs **NEVER** show your actual API key. They only show:
- Whether a key exists (YES/NO)
- The length of the key (e.g., 39 characters)
- The secret storage key name (e.g., "aiAssistant.apiKey.gemini")

This is safe to share with me.
