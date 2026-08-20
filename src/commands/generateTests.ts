import * as vscode from 'vscode';
import { SelectionService } from '../services/SelectionService';
import { AIService } from '../services/AIService';
import { PromptService, AIAction } from '../services/PromptService';
import { SidebarProvider } from '../ui/SidebarProvider';
import { logger } from '../utils/logger';
import { formatErrorForUser } from '../utils/errors';

export async function generateTestsCommand(
    context: vscode.ExtensionContext,
    sidebarProvider: SidebarProvider
): Promise<void> {
    const actionName = PromptService.getActionDisplayName(AIAction.GENERATE_TESTS);

    try {
        logger.info('Generate Tests command triggered');

        const selection = SelectionService.getSelection();
        logger.info(`Selection obtained: ${selection.fileName}, ${selection.lineCount} lines`);

        const aiService = new AIService(context);

        const providerName = aiService.getSettingsService().getProvider();
        const currentProvider = aiService.getProvider(providerName);

        if (!currentProvider) {
            throw new Error(
                'No AI provider configured. Please open AI Assistant Settings to configure a provider.'
            );
        }

        const currentModel = aiService.getSettingsService().getModel(providerName);

        sidebarProvider.showLoading(actionName, selection, currentProvider.displayName, currentModel);

        const uiLang = sidebarProvider.getUiLanguage();
        logger.info('[LANG DIAG] generateTests | uiLang=' + JSON.stringify(uiLang) + ' | resolvedName=' + PromptService.getLanguageName(uiLang) + ' | provider=' + providerName + ' | model=' + (currentModel || '(default)'));
        const prompt = PromptService.generatePrompt(AIAction.GENERATE_TESTS, selection, undefined, uiLang);
        logger.info('[LANG DIAG] generateTests | promptTail=' + JSON.stringify(prompt.slice(-300)));

        const response = await aiService.generate({
            prompt,
            temperature: 0.7,
            maxTokens: 2048
        });

        logger.info('AI response received successfully');

        sidebarProvider.showResponse(actionName, selection, response);
        vscode.window.showInformationMessage('AI Assistant: Generate Tests complete.');

    } catch (error: any) {
        logger.error('Generate Tests command failed', error);

        const errorMessage = formatErrorForUser(error);

        sidebarProvider.showError(actionName, errorMessage);
        vscode.window.showErrorMessage(`AI Assistant: ${errorMessage}`);
    }
}
