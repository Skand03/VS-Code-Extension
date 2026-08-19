import { SelectionInfo } from '../services/SelectionService';

export function generateDebugAndFixPrompt(selection: SelectionInfo): string {
    const { selectedText, languageId, fileName } = selection;
    return `You are an expert debugger and senior software engineer.
Analyze the following code, find all bugs, logical flaws, syntax errors, edge cases, and naming inconsistencies, then provide a fix.

**File:** ${fileName}
**Language:** ${languageId}

**Code to Debug:**
\`\`\`${languageId}
${selectedText}
\`\`\`

You MUST structure your response with the following sections:

**Issue Found:**
Explain the exact bug, logical flaw, or naming issue found in the code snippet.

**CORRECTED CODE:**
Provide the complete, corrected, and working code inside a single markdown code block.

**What Was Fixed:**
- Bullet point describing the exact changes made
- Explanation of why each change was necessary

**Prevention Tips:**
- Concrete best practices and tips to avoid similar bugs in the future`;
}
