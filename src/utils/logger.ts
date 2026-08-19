import * as vscode from 'vscode';

/**
 * Output-channel logger for the AI Assistant extension.
 * The channel is created EAGERLY in the constructor (not lazily) so that
 * it immediately appears in View → Output → "AI Assistant" as soon as the
 * Logger singleton is imported during extension activation.
 */
class Logger {
    private readonly outputChannel: vscode.OutputChannel;

    constructor() {
        // Eagerly create the output channel on logger construction.
        // This guarantees the "AI Assistant" entry appears in the
        // Output panel dropdown even before the first log line is written.
        this.outputChannel = vscode.window.createOutputChannel('AI Assistant');
    }

    info(message: string): void {
        this.outputChannel.appendLine(`[INFO  ${this.timestamp()}] ${message}`);
    }

    error(message: string, error?: unknown): void {
        this.outputChannel.appendLine(`[ERROR ${this.timestamp()}] ${message}`);
        if (error) {
            const err = error as any;
            // Never log raw objects that might contain API key fragments
            this.outputChannel.appendLine(err.stack ?? err.toString());
        }
    }

    warn(message: string): void {
        this.outputChannel.appendLine(`[WARN  ${this.timestamp()}] ${message}`);
    }

    debug(message: string): void {
        this.outputChannel.appendLine(`[DEBUG ${this.timestamp()}] ${message}`);
    }

    show(): void {
        this.outputChannel.show();
    }

    private timestamp(): string {
        return new Date().toISOString();
    }
}

export const logger = new Logger();
