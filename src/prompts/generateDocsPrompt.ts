import { SelectionInfo } from '../services/SelectionService';

export function generateGenerateDocsPrompt(selection: SelectionInfo): string {
    const { selectedText, languageId, fileName } = selection;
    return `You are a technical documentation writer.
Generate comprehensive documentation for the following code.

**File:** ${fileName}
**Language:** ${languageId}

**Code:**
\`\`\`${languageId}
${selectedText}
\`\`\`

Structure your response with:
### 📝 Fully Documented Code
Provide the code with complete JSDoc / docstrings / type annotations inside a code block.

### 📖 API Reference & Usage Guide
- **Description:** Clear summary of functionality
- **Parameters & Types:** Detailed parameter descriptions
- **Return Value:** Description of return type
- **Usage Example:** Realistic code snippet demonstrating how to call this`;
}
