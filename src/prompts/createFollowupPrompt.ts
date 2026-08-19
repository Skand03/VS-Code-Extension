import { SelectionInfo } from '../services/SelectionService';

export function generateCreateFollowupPrompt(selection: SelectionInfo): string {
    const { selectedText, languageId, fileName } = selection;
    return `You are a technical product manager and software architect.
Create a structured list of follow-up engineering tasks, next steps, and enhancements for this code.

**File:** ${fileName}
**Language:** ${languageId}

**Code:**
\`\`\`${languageId}
${selectedText}
\`\`\`

Give a direct, clear answer. Use section headers only if the code has multiple distinct areas worth separating — for simple or trivial code, a short list of next steps is better than forcing empty sections.

When sections are warranted, consider covering: implementation roadmap, feature enhancements, and scalability/maintenance tasks.`;
}
