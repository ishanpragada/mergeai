import * as vscode from 'vscode';
import { ConflictCodeLensProvider, ConflictChunk } from './conflictProvider';

export function activate(context: vscode.ExtensionContext) {
    // Register the main command to resolve the conflict with a 3-panel UI
    const resolveConflictCmd = vscode.commands.registerCommand('mergeai.resolveConflictWith3PanelUI', async () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        }

        // Parse the active document for a three-way conflict
        const text = activeEditor.document.getText();
        const conflict = parseThreeWayConflict(text);
        if (!conflict) {
            vscode.window.showErrorMessage('No three-way conflict found in the active file.');
            return;
        }

        // Close all editors so we can open a fresh 3-panel layout
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');

        // Left panel: Original (base) code
        const originalDoc = await vscode.workspace.openTextDocument({
            content: conflict.original,
            language: activeEditor.document.languageId
        });
        await vscode.window.showTextDocument(originalDoc, vscode.ViewColumn.One);

        // Center panel: The current file (with conflict markers)
        await vscode.window.showTextDocument(activeEditor.document, vscode.ViewColumn.Two);

        // Right panel: Incoming changes
        const incomingDoc = await vscode.workspace.openTextDocument({
            content: conflict.incoming,
            language: activeEditor.document.languageId
        });
        await vscode.window.showTextDocument(incomingDoc, vscode.ViewColumn.Three);

        // Register the CodeLens provider for ephemeral docs
        const provider = new ConflictCodeLensProvider(activeEditor.document.uri, conflict);
        context.subscriptions.push(
            vscode.languages.registerCodeLensProvider({ scheme: 'untitled' }, provider)
        );

        // Register commands for the CodeLens actions
        context.subscriptions.push(
            vscode.commands.registerCommand('mergeai.ignoreOriginal', () => {
                vscode.window.showInformationMessage('Original change ignored.');
            }),
            vscode.commands.registerCommand('mergeai.acceptOriginal', () => {
                replaceConflictInMainDoc('original', conflict, activeEditor.document.uri);
            }),
            vscode.commands.registerCommand('mergeai.ignoreIncoming', () => {
                vscode.window.showInformationMessage('Incoming change ignored.');
            }),
            vscode.commands.registerCommand('mergeai.acceptIncoming', () => {
                replaceConflictInMainDoc('incoming', conflict, activeEditor.document.uri);
            })
        );
    });

    context.subscriptions.push(resolveConflictCmd);
}

/**
 * Parses a single three‑way conflict from the provided text.
 * Expects markers:
 *   <<<<<<< HEAD
 *       [current (local) code]
 *   ||||||| original
 *       [original (base) code]
 *   =======
 *       [incoming code]
 *   >>>>>>> branch-name
 */
function parseThreeWayConflict(text: string): ConflictChunk | null {
    const startMarker = '<<<<<<< HEAD';
    const baseMarker = '|||||||';
    const sepMarker = '=======';
    const endMarker = '>>>>>>>';
    
    const startIndex = text.indexOf(startMarker);
    if (startIndex === -1) {
        return null;
    }
    
    const baseIndex = text.indexOf(baseMarker, startIndex);
    const sepIndex = text.indexOf(sepMarker, baseIndex);
    const endIndex = text.indexOf(endMarker, sepIndex);
    if (baseIndex === -1 || sepIndex === -1 || endIndex === -1) {
        return null;
    }
    
    // Extract the three sections (trim to remove extra whitespace)
    const currentCode = text.substring(startIndex + startMarker.length, baseIndex).trim();
    const originalCode = text.substring(baseIndex + baseMarker.length, sepIndex).trim();
    const incomingCode = text.substring(sepIndex + sepMarker.length, endIndex).trim();
    
    return {
        original: originalCode,
        current: currentCode,
        incoming: incomingCode,
        startIndex,
        endIndex: endIndex + endMarker.length
    };
}

/**
 * Replaces the conflict region in the main (current) document with either the Original or Incoming text.
 */
async function replaceConflictInMainDoc(which: 'original' | 'incoming', conflict: ConflictChunk, mainDocUri: vscode.Uri) {
    const mainDoc = await vscode.workspace.openTextDocument(mainDocUri);
    const editor = await vscode.window.showTextDocument(mainDoc, vscode.ViewColumn.Two);

    const newText = (which === 'original') ? conflict.original : conflict.incoming;

    await editor.edit((editBuilder) => {
        const startPos = mainDoc.positionAt(conflict.startIndex);
        const endPos = mainDoc.positionAt(conflict.endIndex);
        editBuilder.replace(new vscode.Range(startPos, endPos), newText);
    });

    vscode.window.showInformationMessage(`Conflict replaced with ${which} code.`);
}

export function deactivate() {
    // Clean up if needed
}
