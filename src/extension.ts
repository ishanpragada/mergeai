import * as vscode from 'vscode';
import { MergeConflictHandler } from './mergeHandler';

export function activate(context: vscode.ExtensionContext) {
    const mergeHandler = new MergeConflictHandler(context);

    let resolveCommand = vscode.commands.registerCommand('mergeai.resolveMergeConflict', () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            mergeHandler.handleMergeConflict(activeEditor);
        } else {
            vscode.window.showErrorMessage('Please open a file with merge conflicts first.');
        }
    });

    let openHandler = vscode.workspace.onDidOpenTextDocument(document => {
        if (document.getText().includes('<<<<<<<')) {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document === document) {
                vscode.window.showInformationMessage(
                    'Merge conflicts detected. Would you like to resolve them?',
                    'Yes', 'No'
                ).then(selection => {
                    if (selection === 'Yes') {
                        mergeHandler.handleMergeConflict(editor);
                    }
                });
            }
        }
    });

    context.subscriptions.push(resolveCommand, openHandler);
}

export function deactivate() {}