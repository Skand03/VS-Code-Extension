import { SelectionInfo } from '../services/SelectionService';

export function generateGenerateTestsPrompt(selection: SelectionInfo): string {
    const { selectedText, languageId, fileName } = selection;
    return `You are a QA automation and test-driven development (TDD) expert.
Generate complete, production-ready unit tests for the following code.

**File:** ${fileName}
**Language:** ${languageId}

**Code Under Test:**
\`\`\`${languageId}
${selectedText}
\`\`\`

Structure your response with:
### 🧪 Unit Tests Suite
Provide complete, runnable unit test code (using standard framework like Jest/Mocha/PyTest/JUnit based on language) inside a code block.

### 📋 Test Coverage Matrix
- **Happy Path:** Standard expected inputs
- **Edge Cases:** Empty, boundary, maximum/minimum values
- **Error Cases:** Invalid arguments, type errors, exceptions`;
}
