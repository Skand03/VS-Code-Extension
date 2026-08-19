import * as vscode from 'vscode';
import { SelectionService, SelectionInfo } from '../services/SelectionService';
import { AIService } from '../services/AIService';
import { ChatService } from '../services/ChatService';
import { SidebarProvider } from '../ui/SidebarProvider';
import { logger } from '../utils/logger';
import { formatErrorForUser } from '../utils/errors';

/**
 * Command handler: AI Assistant → Chat Discussion
 *
 * Opens the sidebar in CHAT mode, initializes a ChatService conversation
 * with the currently selected code as the primary context. The actual
 * message-sending happens via the webview's chat input → handleMessage
 * flow in SidebarProvider (this command only initializes the conversation
 * and shows the initial chat UI with the code-context card).
 */
export async function chatDiscussionCommand(
    context: vscode.ExtensionContext,
    sidebarProvider: SidebarProvider
): Promise<void> {
    const ACTION_NAME = 'Chat Discussion';

    try {
        logger.info('Chat Discussion command triggered');

        // Step 1: Selection required (otherwise there's no code to discuss)
        let selection: SelectionInfo;
        try {
            selection = SelectionService.getSelection();
        } catch (e: any) {
            // SelectionService throws if no editor or no selection.
            // Surface the user-friendly version directly in error toast + sidebar.
            const userMsg = formatErrorForUser(e);
            sidebarProvider.showError(ACTION_NAME, userMsg);
            vscode.window.showErrorMessage(`AI Assistant: ${userMsg}`);
            return;
        }
        logger.info(`Chat Discussion selection: ${selection.fileName}, ${selection.lineCount} lines`);

        // Step 2: Resolve provider/model snapshot BEFORE showing the chat
        // so the sidebar header can display provider + model chips immediately.
        const aiService = new AIService(context);
        const settingsService = aiService.getSettingsService();
        const providerName = settingsService.getProvider();
        const providerInst = aiService.getProvider(providerName);
        if (!providerInst) {
            throw new Error(
                'No AI provider configured. Please open AI Assistant Settings to configure a provider.'
            );
        }
        const providerDisplayName = providerInst.displayName;
        const modelSetting = settingsService.getModel(providerName);
        const currentModel = modelSetting || providerInst.availableModels[0] || '';

        // Step 3: Create/reuse the ChatService for this conversation.
        // SidebarProvider will retain a reference to the conversation through
        // its chat-show-state method.
        const chatService = sidebarProvider.getOrCreateChatService(context);
        const conversation = chatService.startConversation(
            selection,
            providerName,
            providerDisplayName,
            currentModel
        );

        // Step 4: Show chat UI (selection context card + empty conversation +
        // input box). Pass the full conversation reference.
        sidebarProvider.showChatConversation(
            ACTION_NAME,
            selection,
            providerDisplayName,
            currentModel,
            conversation
        );

        logger.info('Chat Discussion initialized successfully');

    } catch (error: any) {
        logger.error('Chat Discussion command failed', error);
        const errorMessage = formatErrorForUser(error);
        sidebarProvider.showError(ACTION_NAME, errorMessage);
        vscode.window.showErrorMessage(`AI Assistant: ${errorMessage}`);
    }
}
