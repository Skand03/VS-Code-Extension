import * as vscode from 'vscode';
import { SettingsViewProvider } from '../ui/SettingsViewProvider';
import { logger } from '../utils/logger';

/**
 * Command to open the AI Assistant settings panel
 */
export async function openSettingsCommand(
    context: vscode.ExtensionContext,
    settingsProvider: SettingsViewProvider
): Promise<void> {
    try {
        logger.info('Opening AI Assistant settings');
        await settingsProvider.show();
    } catch (error: any) {
        logger.error('Failed to open settings', error);
        vscode.window.showErrorMessage('Failed to open AI Assistant settings');
    }
}
