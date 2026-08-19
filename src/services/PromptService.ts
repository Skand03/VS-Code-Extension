import { SelectionInfo } from './SelectionService';
import { generateAnalyzeCodePrompt } from '../prompts/analyzeCodePrompt';
import { generateDebugAndFixPrompt } from '../prompts/debugAndFixPrompt';
import { generateExplainCodePrompt } from '../prompts/explainCodePrompt';
import { generateConvertCodePrompt } from '../prompts/convertCodePrompt';
import { generateSummarizePrompt } from '../prompts/summarizePrompt';
import { generateGenerateDocsPrompt } from '../prompts/generateDocsPrompt';
import { generateImproveCodePrompt } from '../prompts/improveCodePrompt';
import { generateGenerateTestsPrompt } from '../prompts/generateTestsPrompt';
import { generateGrammarFixerPrompt } from '../prompts/grammarFixerPrompt';
import { generateFactCheckPrompt } from '../prompts/factCheckPrompt';
import { generateCreateFollowupPrompt } from '../prompts/createFollowupPrompt';
import { generateLetsTalkAboutThisPrompt } from '../prompts/letsTalkAboutThisPrompt';

/**
 * Available AI actions
 */
export enum AIAction {
    ANALYZE_CODE = 'analyzeCode',
    EXPLAIN_CODE = 'explainCode',
    DEBUG_AND_FIX = 'debugAndFix',
    SUMMARIZE = 'summarize',
    CONVERT_CODE = 'convertCode',
    GENERATE_DOCS = 'generateDocs',
    IMPROVE_CODE = 'improveCode',
    GENERATE_TESTS = 'generateTests',
    GRAMMAR_FIXER = 'grammarFixer',
    FACT_CHECK = 'factCheck',
    CREATE_FOLLOWUP = 'createFollowup',
    LETS_TALK = 'letsTalkAboutThis'
}

/**
 * Service for generating AI prompts based on actions
 */
export class PromptService {
    /**
     * Generate a prompt for the given action and selection
     */
    static generatePrompt(action: AIAction, selection: SelectionInfo, additionalContext?: string, targetLanguage?: string): string {
        const langDirective = targetLanguage && targetLanguage !== 'en'
            ? `\n\n---\n**CRITICAL LANGUAGE INSTRUCTION - READ CAREFULLY:**\n\n` +
              `1. Write ALL explanatory text and descriptions in ${PromptService.getLanguageName(targetLanguage)} language.\n` +
              `2. Keep ALL code identifiers in English - this includes:\n` +
              `   - Variable names: items, total, price, quantity, etc.\n` +
              `   - Function names: reduce, map, filter, Array.prototype.reduce, etc.\n` +
              `   - Keywords: null, undefined, NaN, true, false, etc.\n` +
              `   - Class names: Array, Object, String, Number, etc.\n` +
              `   - Property names: .length, .price, .quantity, .size(), etc.\n` +
              `   - Method names: .push(), .pop(), .get(), .set(), etc.\n` +
              `3. When mentioning code in explanations, wrap them in backticks (\`code\`) and keep in English.\n` +
              `4. Do NOT translate inline code mentions like \`items[i].price\` or \`Array.prototype.reduce\`.\n` +
              `5. Do NOT add ${PromptService.getLanguageName(targetLanguage)} comments inside code blocks.\n\n` +
              `CORRECT EXAMPLE in ${PromptService.getLanguageName(targetLanguage)}:\n` +
              `"यह function \`items\` array को iterate करता है और \`total\` calculate करता है।"\n\n` +
              `WRONG EXAMPLE:\n` +
              `"यह function आइटम्स array को iterate करता है और कुल calculate करता है।" (DON'T DO THIS!)\n\n` +
              `Remember: Code identifiers = English. Explanation text = ${PromptService.getLanguageName(targetLanguage)}.`
            : '';
        switch (action) {
            case AIAction.ANALYZE_CODE:
                return generateAnalyzeCodePrompt(selection) + langDirective;
            case AIAction.EXPLAIN_CODE:
                return generateExplainCodePrompt(selection) + langDirective;
            case AIAction.DEBUG_AND_FIX:
                return generateDebugAndFixPrompt(selection) + langDirective;
            case AIAction.CONVERT_CODE:
                return generateConvertCodePrompt(selection, additionalContext || 'another language') + langDirective;
            
            case AIAction.SUMMARIZE:
                return generateSummarizePrompt(selection) + langDirective;
            case AIAction.GENERATE_DOCS:
                return generateGenerateDocsPrompt(selection) + langDirective;
            case AIAction.IMPROVE_CODE:
                return generateImproveCodePrompt(selection) + langDirective;
            case AIAction.GENERATE_TESTS:
                return generateGenerateTestsPrompt(selection) + langDirective;
            case AIAction.GRAMMAR_FIXER:
                return generateGrammarFixerPrompt(selection) + langDirective;
            case AIAction.FACT_CHECK:
                return generateFactCheckPrompt(selection) + langDirective;
            case AIAction.CREATE_FOLLOWUP:
                return generateCreateFollowupPrompt(selection) + langDirective;
            case AIAction.LETS_TALK:
                return generateLetsTalkAboutThisPrompt(selection) + langDirective;

            default:
                throw new Error(`Unknown action: ${action}`);
        }
    }

    /**
     * Get display name for an action
     */
    static getLanguageName(code: string): string {
        const map: Record<string, string> = {
            hi: 'Hindi', bn: 'Bengali', te: 'Telugu', mr: 'Marathi',
            ta: 'Tamil', gu: 'Gujarati', kn: 'Kannada', ml: 'Malayalam',
            pa: 'Punjabi', or: 'Odia', en: 'English'
        };
        return map[code] || 'English';
    }

    static getActionDisplayName(action: AIAction): string {
        const displayNames: Record<AIAction, string> = {
            [AIAction.ANALYZE_CODE]: 'Analyze Code',
            [AIAction.EXPLAIN_CODE]: 'Explain Code',
            [AIAction.DEBUG_AND_FIX]: 'Debug & Fix',
            [AIAction.SUMMARIZE]: 'Summarize',
            [AIAction.CONVERT_CODE]: 'Convert Code',
            [AIAction.GENERATE_DOCS]: 'Generate Documentation',
            [AIAction.IMPROVE_CODE]: 'Improve Code',
            [AIAction.GENERATE_TESTS]: 'Generate Tests',
            [AIAction.GRAMMAR_FIXER]: 'Grammar Fixer',
            [AIAction.FACT_CHECK]: 'Fact Check',
            [AIAction.CREATE_FOLLOWUP]: 'Create Follow-up',
            [AIAction.LETS_TALK]: "Let's Talk About This"
        };

        return displayNames[action] || action;
    }

    /**
     * Get icon for an action (using VS Code codicons)
     */
    static getActionIcon(action: AIAction): string {
        const icons: Record<AIAction, string> = {
            [AIAction.ANALYZE_CODE]: 'search',
            [AIAction.EXPLAIN_CODE]: 'book',
            [AIAction.DEBUG_AND_FIX]: 'bug',
            [AIAction.SUMMARIZE]: 'list-unordered',
            [AIAction.CONVERT_CODE]: 'symbol-namespace',
            [AIAction.GENERATE_DOCS]: 'note',
            [AIAction.IMPROVE_CODE]: 'lightbulb',
            [AIAction.GENERATE_TESTS]: 'beaker',
            [AIAction.GRAMMAR_FIXER]: 'symbol-text',
            [AIAction.FACT_CHECK]: 'verified',
            [AIAction.CREATE_FOLLOWUP]: 'comment-discussion',
            [AIAction.LETS_TALK]: 'comment'
        };

        return icons[action] || 'symbol-misc';
    }
}
