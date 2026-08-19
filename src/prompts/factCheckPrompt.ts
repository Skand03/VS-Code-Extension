import { SelectionInfo } from '../services/SelectionService';

export function generateFactCheckPrompt(selection: SelectionInfo): string {
    const { selectedText, languageId, fileName } = selection;
    return `You are a security auditor and algorithmic correctness verifier.
Fact-check and verify the technical validity of the following code.

**File:** ${fileName}
**Language:** ${languageId}

**Code:**
\`\`\`${languageId}
${selectedText}
\`\`\`

Give a direct, clear answer. Use section headers only if the code has multiple distinct things worth separating (e.g. a real security issue AND a real logic bug). For simple or trivial code, a short direct verdict is better than forcing unused sections.

When sections are warranted, consider covering: algorithmic correctness, API/library validity, security vulnerabilities, and a final verdict (**Verified Safe** / **Needs Attention** / **Critical Vulnerability**).`;
}
