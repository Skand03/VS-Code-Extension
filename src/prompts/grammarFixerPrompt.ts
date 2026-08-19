import { SelectionInfo } from '../services/SelectionService';

export function generateGrammarFixerPrompt(selection: SelectionInfo): string {
    const { selectedText, languageId, fileName } = selection;
    return `You are a technical copyeditor and code quality reviewer.
Fix all grammar, spelling, typography, docstring typos, string literal mistakes, and naming conventions in the following code.

**File:** ${fileName}
**Language:** ${languageId}

**Code:**
\`\`\`${languageId}
${selectedText}
\`\`\`

Structure your response with:
### ✏️ Corrected Code
Provide the corrected code with all typos and grammar fixed inside a code block.

### 📋 Corrections List
- List each spelling, grammar, or naming error found and how it was fixed.`;
}
