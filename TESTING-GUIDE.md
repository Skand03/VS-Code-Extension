# Testing Guide - AI Assistant Extension (Phase 1)

## Prerequisites

Before testing, ensure you have:
- ✅ Compiled the extension (`npm run compile`)
- ✅ A Google Gemini API key ([Get one here](https://makersuite.google.com/app/apikey))

## Step-by-Step Testing Instructions

### Step 1: Launch Extension Development Host

1. Open this project in VS Code
2. Press `F5` or go to **Run and Debug** → Click **Run Extension**
3. A new VS Code window will open (Extension Development Host)
4. Look for the **AI Assistant** icon in the Activity Bar (left sidebar)

**Expected Result**: Extension loads without errors, AI Assistant sidebar appears.

---

### Step 2: Configure Gemini API Key

In the **Extension Development Host** window:

1. Press `Ctrl+Shift+P` to open Command Palette
2. Type: `AI Assistant: Open AI Assistant Settings`
3. In the Settings panel:
   - **Provider**: Should show "Google Gemini" (selected by default)
   - **Model**: Select `gemini-1.5-flash` (or another model)
   - **API Key**: Enter your Gemini API key
   - Click **Save Settings**

**Expected Result**: 
- "Settings saved successfully!" message appears
- API key status shows "✓ API key is configured"

---

### Step 3: Test Connection (Optional)

1. In the Settings panel, click **Test Connection**
2. Wait for the test to complete

**Expected Result**: 
- "Connection successful!" message if API key is valid
- Error message if API key is invalid

---

### Step 4: Test Analyze Code Feature

#### Test Case 1: Basic Code Analysis

1. In the Extension Development Host, open the file: `test-example.js`
2. Select the `calculateTotal` function (lines 6-12)
3. Right-click on the selection
4. Choose **AI Assistant → Analyze Code**

**Expected Result**:
- Sidebar opens automatically
- Loading spinner appears with "Analyzing your code..."
- After a few seconds, AI response appears with:
  - Purpose of the function
  - How it works
  - Potential issues
  - Suggestions for improvement
  - Complexity analysis

#### Test Case 2: Copy Response

1. After receiving an AI response, click the **📋 Copy** button
2. Paste the content somewhere (Ctrl+V)

**Expected Result**: 
- "Copied to clipboard!" notification
- Response is successfully copied

#### Test Case 3: Insert at Cursor

1. Place your cursor at the end of the file
2. In the sidebar with an AI response, click **➕ Insert**

**Expected Result**:
- "Inserted at cursor!" notification
- Response text appears at cursor position

#### Test Case 4: Multiple Analyses

1. Select the `findMaxValue` function
2. Right-click → **AI Assistant → Analyze Code**
3. Observe the new analysis

**Expected Result**:
- Previous response is replaced
- New analysis appears for the selected function

---

### Step 5: Test Error Handling

#### Test Case 5: No Selection

1. Click in the editor without selecting any text
2. Right-click → **AI Assistant → Analyze Code**

**Expected Result**:
- Error message: "Please select some code or text first."
- Sidebar shows error state

#### Test Case 6: No API Key

1. Open Settings
2. Click **Clear API Key**
3. Try to analyze some code

**Expected Result**:
- Error message about missing API key
- Link to settings

#### Test Case 7: Invalid API Key

1. Open Settings
2. Enter an invalid API key (e.g., "invalid-key")
3. Click **Save Settings**
4. Try to analyze some code

**Expected Result**:
- Error about invalid API key
- Sidebar shows error state

---

### Step 6: Test Phase 2 Actions

1. Select some code
2. Right-click → **AI Assistant**
3. Try clicking: **Explain Code**, **Debug & Fix**, or any other action

**Expected Result**:
- Notification: "explainCode will be available in Phase 2. Currently only 'Analyze Code' is functional."

---

### Step 7: Test UI States

#### Idle State
1. Open AI Assistant sidebar (click icon in Activity Bar)
2. Observe the empty state

**Expected Result**:
- Shows robot icon 🤖
- Message: "Select some code and choose an action from the right-click menu to get started."
- "Open Settings" button

#### Loading State
1. Select code and trigger analysis
2. Observe immediately

**Expected Result**:
- Loading spinner ⏳
- "Analyzing your code..." text
- File information displayed

#### Success State
1. Wait for analysis to complete

**Expected Result**:
- Response displays in formatted view
- Metadata shows: Action, File info, Provider/Model
- Copy and Insert buttons available

#### Error State
1. Trigger an error (e.g., clear API key and try analysis)

**Expected Result**:
- Red error box with ❌ icon
- Clear error message
- "Open Settings" button

---

### Step 8: Test Different Languages

Try analyzing code in different languages:

1. **Python**:
```python
def factorial(n):
    if n == 0:
        return 1
    return n * factorial(n-1)
```

2. **Java**:
```java
public class Calculator {
    public int add(int a, int b) {
        return a + b;
    }
}
```

3. **TypeScript**:
```typescript
interface User {
    name: string;
    age: number;
}

function greet(user: User): string {
    return `Hello, ${user.name}!`;
}
```

**Expected Result**: AI Assistant correctly identifies and analyzes code in each language.

---

## Troubleshooting

### Extension doesn't activate
- Check Output panel → "AI Assistant"
- Ensure `npm run compile` completed successfully
- Restart Extension Development Host (close and press F5 again)

### "Cannot find module" errors
- Run `npm install` again
- Run `npm run compile` again

### API requests fail
- Verify API key is correct
- Check internet connection
- Try Test Connection in Settings

### Context menu doesn't show
- Ensure text is selected
- Try restarting Extension Development Host

### Sidebar doesn't update
- Check browser console in webview (Help → Toggle Developer Tools)
- Check Output panel for errors

---

## Success Criteria

Phase 1 is successful if:

- ✅ Extension activates without errors
- ✅ Settings UI opens and saves configuration
- ✅ API key is stored securely (not visible in settings.json)
- ✅ Context menu shows "AI Assistant" submenu
- ✅ **Analyze Code** generates AI response from Gemini
- ✅ Sidebar displays response with proper formatting
- ✅ Copy and Insert buttons work
- ✅ Error handling works for all error cases
- ✅ Phase 2 actions show "Coming Soon" message

---

## Next Steps

After successful testing:

1. **Verify all features work** using this checklist
2. **Test with real code** from your projects
3. **Check logs** in Output panel for any warnings
4. **Note any issues** or improvements for Phase 2

---

## Phase 2 Preparation

This architecture is ready for Phase 2:
- Adding OpenAI: Implement `AIProvider` interface
- Adding Groq: Implement `AIProvider` interface
- Adding more actions: Add prompts to `prompts/` folder
- Extending UI: Modify WebviewProviders

---

**Phase 1 Testing Complete!** 🎉

If all tests pass, you're ready to move to Phase 2 or use the extension for real code analysis with Gemini!
