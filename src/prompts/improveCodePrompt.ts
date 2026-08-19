import { SelectionInfo } from '../services/SelectionService';

export function generateImproveCodePrompt(selection: SelectionInfo): string {
    const { selectedText, languageId, fileName } = selection;
    return `You are a senior refactoring and performance optimization specialist.
Improve and modernize the following code for production quality.

**File:** ${fileName}
**Language:** ${languageId}

**Original Code:**
\`\`\`${languageId}
${selectedText}
\`\`\`

Structure your response with:
### 🚀 Improved Production Code
Provide the fully refactored, modern, clean code inside a single markdown code block.

### 📈 Key Improvements Made
- **Performance:** Speed and memory optimizations
- **Readability & Clean Code:** Idiomatic patterns and naming
- **Robustness:** Error handling and safety checks`;
}
