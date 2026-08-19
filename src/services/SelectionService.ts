import * as vscode from 'vscode';
import { NoSelectionError } from '../utils/errors';

/**
 * Information about the current editor selection
 */
export interface SelectionInfo {
    selectedText: string;
    languageId: string;
    fileName: string;
    range: vscode.Range;
    lineCount: number;
}

/**
 * Service for reading and managing editor selections
 */
export class SelectionService {
    /**
     * Get the current active editor selection
     * @throws NoSelectionError if no text is selected
     */
    static getSelection(): SelectionInfo {
        const editor = vscode.window.activeTextEditor;

        if (!editor) {
            throw new NoSelectionError();
        }

        const selection = editor.selection;
        const selectedText = editor.document.getText(selection);

        if (!selectedText || selectedText.trim().length === 0) {
            throw new NoSelectionError();
        }

        return {
            selectedText,
            languageId: editor.document.languageId,
            fileName: this.getFileName(editor.document.uri),
            range: selection,
            lineCount: selection.end.line - selection.start.line + 1
        };
    }

    /**
     * Check if there is an active selection
     */
    static hasSelection(): boolean {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return false;
        }

        const selection = editor.selection;
        const selectedText = editor.document.getText(selection);
        return selectedText.trim().length > 0;
    }

    /**
     * Get friendly file name from URI
     */
    private static getFileName(uri: vscode.Uri): string {
        const pathParts = uri.fsPath.split(/[\\/]/);
        return pathParts[pathParts.length - 1] || 'untitled';
    }

    /**
     * Get language display name from language ID
     */
    static getLanguageDisplayName(languageId: string): string {
        const languageMap: { [key: string]: string } = {
            'javascript': 'JavaScript',
            'typescript': 'TypeScript',
            'python': 'Python',
            'java': 'Java',
            'csharp': 'C#',
            'cpp': 'C++',
            'c': 'C',
            'go': 'Go',
            'rust': 'Rust',
            'php': 'PHP',
            'ruby': 'Ruby',
            'swift': 'Swift',
            'kotlin': 'Kotlin',
            'html': 'HTML',
            'css': 'CSS',
            'json': 'JSON',
            'yaml': 'YAML',
            'markdown': 'Markdown',
            'sql': 'SQL',
            'shellscript': 'Shell Script',
            'powershell': 'PowerShell'
        };

        return languageMap[languageId] || languageId;
    }

    /**
     * Insert text at cursor position
     */
    static async insertAtCursor(text: string): Promise<boolean> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return false;
        }

        return editor.edit(editBuilder => {
            editBuilder.insert(editor.selection.active, text);
        });
    }

    /**
     * Replace current selection with text
     */
    static async replaceSelection(text: string): Promise<boolean> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return false;
        }

        return editor.edit(editBuilder => {
            editBuilder.replace(editor.selection, text);
        });
    }
}
