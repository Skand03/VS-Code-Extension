import * as vscode from 'vscode';
import { analyzeCodeCommand } from './commands/analyzeCode';
import { chatDiscussionCommand } from './commands/chatDiscussion';
import { explainCodeCommand } from './commands/explainCode';
import { debugAndFixCommand } from './commands/debugAndFix';
import { convertCodeCommand } from './commands/convertCode';
import { summarizeCommand } from './commands/summarize';
import { generateDocsCommand } from './commands/generateDocs';
import { improveCodeCommand } from './commands/improveCode';
import { generateTestsCommand } from './commands/generateTests';
import { grammarFixerCommand } from './commands/grammarFixer';
import { factCheckCommand } from './commands/factCheck';
import { createFollowupCommand } from './commands/createFollowup';
import { letsTalkAboutThisCommand } from './commands/letsTalkAboutThis';
import { openSettingsCommand } from './commands/openSettings';
import { SidebarProvider } from './ui/SidebarProvider';
import { SettingsViewProvider } from './ui/SettingsViewProvider';
import { logger } from './utils/logger';

/** Human-readable names for Phase 2 actions, keyed by command suffix. */
const PHASE2_ACTION_NAMES: Record<string, string> = {};

export function activate(context: vscode.ExtensionContext) {
    // Force early touch of logger singleton so the Output channel is
    // registered in the Output panel dropdown from the very first moment.
    logger.info('AI Assistant extension is activating...');
    logger.info('AI Assistant extension activated');

    // Initialize sidebar provider
    const sidebarProvider = new SidebarProvider(context.extensionUri, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'aiAssistant.sidebar',
            sidebarProvider
        )
    );

    // Initialize settings view provider
    const settingsProvider = new SettingsViewProvider(context);

    // Register commands
    
    // Analyze Code - FUNCTIONAL
    context.subscriptions.push(
        vscode.commands.registerCommand('aiAssistant.analyzeCode', () => 
            analyzeCodeCommand(context, sidebarProvider)
        )
    );

    // Chat Discussion - FUNCTIONAL (Phase 2)
    context.subscriptions.push(
        vscode.commands.registerCommand('aiAssistant.chatDiscussion', () =>
            chatDiscussionCommand(context, sidebarProvider)
        )
    );

    // Explain Code - FUNCTIONAL
    context.subscriptions.push(
        vscode.commands.registerCommand('aiAssistant.explainCode', () =>
            explainCodeCommand(context, sidebarProvider)
        )
    );

    // Debug & Fix - FUNCTIONAL
    context.subscriptions.push(
        vscode.commands.registerCommand('aiAssistant.debugAndFix', () =>
            debugAndFixCommand(context, sidebarProvider)
        )
    );

    // Convert Code - FUNCTIONAL
    context.subscriptions.push(
        vscode.commands.registerCommand('aiAssistant.convertCode', () =>
            convertCodeCommand(context, sidebarProvider)
        )
    );

    // Settings
    context.subscriptions.push(
        vscode.commands.registerCommand('aiAssistant.openSettings', () => 
            openSettingsCommand(context, settingsProvider)
        )
    );

    // Open Sidebar
    context.subscriptions.push(
        vscode.commands.registerCommand('aiAssistant.openSidebar', () => {
            vscode.commands.executeCommand('aiAssistant.sidebar.focus');
        })
    );

    // summarize - FUNCTIONAL
    context.subscriptions.push(
        vscode.commands.registerCommand('aiAssistant.summarize', () =>
            summarizeCommand(context, sidebarProvider)
        )
    );

    // generateDocs - FUNCTIONAL
    context.subscriptions.push(
        vscode.commands.registerCommand('aiAssistant.generateDocs', () =>
            generateDocsCommand(context, sidebarProvider)
        )
    );

    // improveCode - FUNCTIONAL
    context.subscriptions.push(
        vscode.commands.registerCommand('aiAssistant.improveCode', () =>
            improveCodeCommand(context, sidebarProvider)
        )
    );

    // generateTests - FUNCTIONAL
    context.subscriptions.push(
        vscode.commands.registerCommand('aiAssistant.generateTests', () =>
            generateTestsCommand(context, sidebarProvider)
        )
    );

    // grammarFixer - FUNCTIONAL
    context.subscriptions.push(
        vscode.commands.registerCommand('aiAssistant.grammarFixer', () =>
            grammarFixerCommand(context, sidebarProvider)
        )
    );

    // factCheck - FUNCTIONAL
    context.subscriptions.push(
        vscode.commands.registerCommand('aiAssistant.factCheck', () =>
            factCheckCommand(context, sidebarProvider)
        )
    );

    // createFollowup - FUNCTIONAL
    context.subscriptions.push(
        vscode.commands.registerCommand('aiAssistant.createFollowup', () =>
            createFollowupCommand(context, sidebarProvider)
        )
    );

    // letsTalkAboutThis - FUNCTIONAL
    context.subscriptions.push(
        vscode.commands.registerCommand('aiAssistant.letsTalkAboutThis', () =>
            letsTalkAboutThisCommand(context, sidebarProvider)
        )
    );

    // Phase 2 Commands - Show "Coming Soon" message with proper display names
    Object.entries(PHASE2_ACTION_NAMES).forEach(([cmd, displayName]) => {
        context.subscriptions.push(
            vscode.commands.registerCommand(`aiAssistant.${cmd}`, () => {
                vscode.window.showInformationMessage(
                    `"${displayName}" is coming in Phase 2. Currently only "Analyze Code" is functional.`
                );
            })
        );
    });

    logger.info('AI Assistant extension activated successfully');
}

export function deactivate() {
    logger.info('AI Assistant extension deactivated');
}
