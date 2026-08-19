import { SelectionInfo } from '../services/SelectionService';

export function generateConvertCodePrompt(selection: SelectionInfo, targetLanguage: string): string {
    const { selectedText, languageId, fileName } = selection;
    return `You are a polyglot programmer and migration engineer.
Convert the following ${languageId} code into idiomatic ${targetLanguage}.

**File:** ${fileName}
**Source Language:** ${languageId}
**Target Language:** ${targetLanguage}

**Source Code:**
\`\`\`${languageId}
${selectedText}
\`\`\`

Structure your response with:
### 🔄 Converted ${targetLanguage} Code
Provide the complete, converted, idiomatic code inside a markdown code block.

### 📋 Key Language Differences & Mapping
Explain how source idioms and libraries map to ${targetLanguage}.

### ⚠️ Migration Caveats & Gotchas
Important platform or runtime differences to be aware of.`;
}
