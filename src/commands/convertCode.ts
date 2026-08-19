import * as vscode from 'vscode';
import { SelectionService } from '../services/SelectionService';
import { AIService } from '../services/AIService';
import { PromptService, AIAction } from '../services/PromptService';
import { SidebarProvider } from '../ui/SidebarProvider';
import { logger } from '../utils/logger';
import { formatErrorForUser } from '../utils/errors';

export async function convertCodeCommand(
    context: vscode.ExtensionContext,
    sidebarProvider: SidebarProvider
): Promise<void> {
    const actionName = PromptService.getActionDisplayName(AIAction.CONVERT_CODE);

    try {
        logger.info('Convert Code command triggered');

        const selection = SelectionService.getSelection();
        logger.info(`Selection obtained: ${selection.fileName}, ${selection.lineCount} lines`);

        // Ask for the target language
        const targetLanguage = await vscode.window.showQuickPick([
            'JavaScript', 'TypeScript', 'Python', 'Java', 'C#', 
            'C++', 'C', 'Go', 'Rust', 'PHP', 'Ruby', 'Swift', 'Kotlin'
        ], {
            placeHolder: 'Select target language for conversion'
        });

        if (!targetLanguage) {
            // User cancelled
            return;
        }

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

        const prompt = PromptService.generatePrompt(AIAction.CONVERT_CODE, selection, targetLanguage);
        logger.debug('Prompt generated for Convert Code');

        const response = await aiService.generate({
            prompt,
            temperature: 0.7,
            maxTokens: 2048
        });

        logger.info('AI response received successfully');

        sidebarProvider.showResponse(actionName, selection, response);
        vscode.window.showInformationMessage('AI Assistant: Code conversion complete.');

    } catch (error: any) {
        logger.error('Convert Code command failed', error);

        const errorMessage = formatErrorForUser(error);

        sidebarProvider.showError(actionName, errorMessage);
        vscode.window.showErrorMessage(`AI Assistant: ${errorMessage}`);
    }
}
