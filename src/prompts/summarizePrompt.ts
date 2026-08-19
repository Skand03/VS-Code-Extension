import { SelectionInfo } from '../services/SelectionService';

export function generateSummarizePrompt(selection: SelectionInfo): string {
    const { selectedText, languageId, fileName } = selection;
    return `You are a technical documentation lead.
Summarize the following code concisely and accurately.

**File:** ${fileName}
**Language:** ${languageId}

**Code:**
\`\`\`${languageId}
${selectedText}
\`\`\`

Structure your response with:
### 📌 Executive Summary
A 2-3 sentence overview of what the code achieves.

### 🔑 Key Components & Responsibilities
| Component / Function | Responsibility | Key Inputs / Outputs |
| :--- | :--- | :--- |

### 📥 Inputs, 📤 Outputs & Side-Effects
- **Inputs:** Parameters, data types, assumptions
- **Outputs:** Return values, exceptions thrown
- **Side-Effects:** Mutations, I/O, API calls`;
}
