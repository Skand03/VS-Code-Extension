import { SelectionInfo } from '../services/SelectionService';

export function generateExplainCodePrompt(selection: SelectionInfo): string {
    const { selectedText, languageId, fileName } = selection;
    return `You are a world-class coding mentor.
Explain the following code clearly and step-by-step.

**File:** ${fileName}
**Language:** ${languageId}

**Code:**
\`\`\`${languageId}
${selectedText}
\`\`\`

Give a direct, clear explanation. Use section headers only if the code has multiple distinct parts worth separating — for simple or trivial code, a short direct explanation is better than forcing empty sections.

When sections are warranted, consider covering: purpose & summary, step-by-step walkthrough, core concepts & syntax, and an example execution trace.`;
}
