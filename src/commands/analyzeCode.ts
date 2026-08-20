import * as vscode from 'vscode';
import { SelectionService } from '../services/SelectionService';
import { AIService } from '../services/AIService';
import { PromptService, AIAction } from '../services/PromptService';
import { SidebarProvider } from '../ui/SidebarProvider';
import { logger } from '../utils/logger';
import { formatErrorForUser } from '../utils/errors';

/**
 * Command to analyze selected code using AI.
 * Orchestrates the full Phase 1 workflow:
 *   SelectionService → PromptService → AIService → GeminiProvider → Gemini API → SidebarProvider
 */
export async function analyzeCodeCommand(
    context: vscode.ExtensionContext,
    sidebarProvider: SidebarProvider
): Promise<void> {
    const actionName = PromptService.getActionDisplayName(AIAction.ANALYZE_CODE);

    try {
        logger.info('Analyze Code command triggered');

        // Step 1: Get the current selection
        const selection = SelectionService.getSelection();
        logger.info(`Selection obtained: ${selection.fileName}, ${selection.lineCount} lines`);

        // Step 2: Build the AI service and verify a provider is configured before
        // showing loading state — avoids a confusing spinner then immediate error.
        const aiService = new AIService(context);

        // Lightweight synchronous checks (no SecretStorage read yet)
        const providerName = aiService.getSettingsService().getProvider();
        const currentProvider = aiService.getProvider(providerName);

        if (!currentProvider) {
            throw new Error(
                'No AI provider configured. Please open AI Assistant Settings to configure a provider.'
            );
        }

        const currentModel = aiService.getSettingsService().getModel(providerName);

        // Step 3: Show loading state immediately so the user has feedback
        sidebarProvider.showLoading(actionName, selection, currentProvider.displayName, currentModel);

        // Step 4: Generate the prompt
        const uiLang = sidebarProvider.getUiLanguage();
        const resolvedLangName = PromptService.getLanguageName(uiLang);
        logger.info(`[LANG DIAG] analyzeCode | uiLang='${uiLang}' | resolvedName='${resolvedLangName}' | provider=${providerName} | model=${currentModel || '(default)'}`);
        const prompt = PromptService.generatePrompt(AIAction.ANALYZE_CODE, selection, undefined, uiLang);
        logger.info(`[LANG DIAG] analyzeCode | promptTail=${JSON.stringify(prompt.slice(-300))}`);

        // Step 5: Call the AI service (routes through GeminiProvider → Gemini API)
        const response = await aiService.generate({
            prompt,
            temperature: 0.7,
            maxTokens: 2048
        });

        logger.info('AI response received successfully');

        // Step 6: Display response in sidebar
        sidebarProvider.showResponse(actionName, selection, response);

        vscode.window.showInformationMessage('AI Assistant: Code analysis complete.');

    } catch (error: any) {
        logger.error('Analyze Code command failed', error);

        const errorMessage = formatErrorForUser(error);

        sidebarProvider.showError(actionName, errorMessage);
        vscode.window.showErrorMessage(`AI Assistant: ${errorMessage}`);
    }
}
