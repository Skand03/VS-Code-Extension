import { SelectionInfo } from '../services/SelectionService';

export function generateAnalyzeCodePrompt(selection: SelectionInfo): string {
    const { selectedText, languageId, fileName } = selection;
    return `You are a principal software engineer and code auditor.
Perform a comprehensive deep analysis of the following code.

**File:** ${fileName}
**Language:** ${languageId}

**Code:**
\`\`\`${languageId}
${selectedText}
\`\`\`

Give a direct, clear analysis. Use section headers only if the code has multiple distinct aspects worth separating — for simple or trivial code, a short direct assessment is better than forcing empty sections.

When sections are warranted, consider covering: architecture & design patterns, time/space complexity, edge cases & pitfalls, actionable recommendations, and an overall quality score (1–10).`;
}
