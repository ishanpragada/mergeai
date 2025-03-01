import * as vscode from 'vscode';

/**
 * Data for a single merge conflict chunk.
 */
export interface ConflictChunk {
    original: string;
    current: string;
    incoming: string;
    startIndex: number;  // start offset in the main file
    endIndex: number;    // end offset in the main file
}

/**
 * CodeLensProvider for ephemeral documents (the "Original" and "Incoming" docs).
 * It checks the document content and adds CodeLens buttons (X and ✓)
 * so the user can choose to accept or ignore each side.
 */
export class ConflictCodeLensProvider implements vscode.CodeLensProvider {
    constructor(
        private mainDocUri: vscode.Uri, // The URI of the main (current) document.
        private conflict: ConflictChunk // The parsed conflict chunk.
    ) {}

    public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const lenses: vscode.CodeLens[] = [];

        // We'll place the CodeLens at line 0 for simplicity
        const topRange = new vscode.Range(0, 0, 0, 0);

        // Determine if this ephemeral doc is the Original or Incoming code
        const docText = document.getText();

        if (docText === this.conflict.original) {
            // Left panel (Original/base code) CodeLenses:
            lenses.push(
                new vscode.CodeLens(topRange, {
                    title: '$(x) Ignore Original',
                    command: 'mergeai.ignoreOriginal'
                }),
                new vscode.CodeLens(topRange, {
                    title: '$(check) Accept Original',
                    command: 'mergeai.acceptOriginal'
                })
            );
        } else if (docText === this.conflict.incoming) {
            // Right panel (Incoming changes) CodeLenses:
            lenses.push(
                new vscode.CodeLens(topRange, {
                    title: '$(x) Ignore Incoming',
                    command: 'mergeai.ignoreIncoming'
                }),
                new vscode.CodeLens(topRange, {
                    title: '$(check) Accept Incoming',
                    command: 'mergeai.acceptIncoming'
                })
            );
        }

        return lenses;
    }
}
