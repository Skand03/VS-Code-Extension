import { SelectionInfo } from '../services/SelectionService';

export function generateLetsTalkAboutThisPrompt(selection: SelectionInfo): string {
    const { selectedText, languageId, fileName } = selection;
    return `You are a senior software architect and pair-programming partner.
Initiate an engaging, high-level technical discussion about the architecture, trade-offs, and design choices in this code.

**File:** ${fileName}
**Language:** ${languageId}

**Code:**
\`\`\`${languageId}
${selectedText}
\`\`\`

Structure your response with:
### 💬 Architecture & Design Discussion
A thoughtful review of the chosen approach.

### ⚖️ Trade-offs (Pros & Cons)
- **Strengths of Current Approach**
- **Downsides & Limitations**

### 🔀 Alternative Design Patterns
2-3 alternative approaches and when they would be preferable.

### 🤔 Thought-Provoking Questions
Questions for the developer to consider for future scaling.`;
}
