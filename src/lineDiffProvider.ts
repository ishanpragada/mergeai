import * as vscode from 'vscode';

interface DiffLine {
    lineIndex: number;
    original: string;
    current: string;
    incoming: string;
    differsFromOriginal: boolean;
    differsFromIncoming: boolean;
}

/**
 * We create a line-based CodeLensProvider that also manages decorations.
 * The "center" doc is the real doc. We store line differences, create code lenses,
 * and handle acceptance of changes from original or incoming.
 */
export function createLineDiffProvider(
    originalText: string,
    currentText: string,
    incomingText: string,
    currentDocUri: vscode.Uri
): vscode.CodeLensProvider & { applyAllDecorations(editor: vscode.TextEditor): void } {
    
    // Split lines
    const originalLines = originalText.split('\n');
    const currentLines = currentText.split('\n');
    const incomingLines = incomingText.split('\n');
    const maxLines = Math.max(originalLines.length, currentLines.length, incomingLines.length);

    // Build an array describing each line
    const diffLines: DiffLine[] = [];
    for (let i = 0; i < maxLines; i++) {
        const orig = originalLines[i] ?? '';
        const curr = currentLines[i] ?? '';
        const inc = incomingLines[i] ?? '';
        diffLines.push({
            lineIndex: i,
            original: orig,
            current: curr,
            incoming: inc,
            differsFromOriginal: (curr !== orig),
            differsFromIncoming: (curr !== inc)
        });
    }

    // We'll define some decoration types for highlighting lines
    const decorationRed = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        backgroundColor: 'rgba(255,0,0,0.2)' // Light red
    });
    const decorationGreen = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        backgroundColor: 'rgba(0,255,0,0.2)' // Light green
    });

    // After acceptance from original, highlight that line in red
    // After acceptance from incoming, highlight that line in green
    // We'll store the editor so we can reapply decorations easily
    let currentEditor: vscode.TextEditor | undefined;

    // CodeLensProvider: for each line that differs from original or incoming,
    // we add code lenses with check (✓) and X icons (no text).
    const provider: vscode.CodeLensProvider & { applyAllDecorations(editor: vscode.TextEditor): void } = {
        // Called by VS Code to provide all CodeLens items
        provideCodeLenses(doc: vscode.TextDocument) {
            if (doc.uri.toString() !== currentDocUri.toString()) {
                return []; // Not our doc
            }

            const lenses: vscode.CodeLens[] = [];
            diffLines.forEach((line) => {
                // If it differs from original, show red highlight & place codelens
                if (line.differsFromOriginal) {
                    const range = new vscode.Range(line.lineIndex, 0, line.lineIndex, 0);
                    
                    // Accept from original (✓) or decline (X)
                    lenses.push(
                        new vscode.CodeLens(range, {
                            title: '$(check)', // check icon only
                            tooltip: 'Accept from Original',
                            command: 'mergeai.acceptLineChange',
                            arguments: [line.lineIndex, 'original', currentDocUri]
                        }),
                        new vscode.CodeLens(range, {
                            title: '$(x)', // x icon only
                            tooltip: 'Decline Original Change',
                            command: 'mergeai.declineLineChange',
                            arguments: [line.lineIndex, 'original']
                        })
                    );
                }

                // If it differs from incoming, show green highlight & place codelens
                if (line.differsFromIncoming) {
                    const range = new vscode.Range(line.lineIndex, 0, line.lineIndex, 0);
                    
                    lenses.push(
                        new vscode.CodeLens(range, {
                            title: '$(check)',
                            tooltip: 'Accept from Incoming',
                            command: 'mergeai.acceptLineChange',
                            arguments: [line.lineIndex, 'incoming', currentDocUri]
                        }),
                        new vscode.CodeLens(range, {
                            title: '$(x)',
                            tooltip: 'Decline Incoming Change',
                            command: 'mergeai.declineLineChange',
                            arguments: [line.lineIndex, 'incoming']
                        })
                    );
                }
            });
            return lenses;
        },

        // We’ll add a helper to apply all line highlights
        applyAllDecorations(editor: vscode.TextEditor) {
            currentEditor = editor;
            
            // Build arrays of ranges to highlight in red or green
            const redRanges: vscode.Range[] = [];
            const greenRanges: vscode.Range[] = [];

            diffLines.forEach((line) => {
                if (line.differsFromOriginal) {
                    redRanges.push(new vscode.Range(line.lineIndex, 0, line.lineIndex, Number.MAX_VALUE));
                }
                if (line.differsFromIncoming) {
                    greenRanges.push(new vscode.Range(line.lineIndex, 0, line.lineIndex, Number.MAX_VALUE));
                }
            });

            editor.setDecorations(decorationRed, redRanges);
            editor.setDecorations(decorationGreen, greenRanges);
        }
    };

    // Now we register commands for accepting/declining line changes
    // We'll do so at the extension level, but you can also do it in extension.ts
    vscode.commands.registerCommand('mergeai.acceptLineChange', async (lineIndex: number, side: 'original' | 'incoming', docUri: vscode.Uri) => {
        // Replace that line in the doc with the line from original or incoming
        const doc = await vscode.workspace.openTextDocument(docUri);
        const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.Two);

        const newLine = (side === 'original')
            ? originalLines[lineIndex] ?? ''
            : incomingLines[lineIndex] ?? '';

        // Edit just that line
        await editor.edit((editBuilder) => {
            const range = doc.lineAt(lineIndex).range; // the entire line
            editBuilder.replace(range, newLine);
        });

        // Update our diff data: now current line == accepted line
        diffLines[lineIndex].current = newLine;
        diffLines[lineIndex].differsFromOriginal = (newLine !== diffLines[lineIndex].original);
        diffLines[lineIndex].differsFromIncoming = (newLine !== diffLines[lineIndex].incoming);

        // Re-highlight that line in red if accepted from original, green if from incoming
        if (currentEditor) {
            // Clear old decorations for this line
            const singleLineRange = new vscode.Range(lineIndex, 0, lineIndex, Number.MAX_VALUE);
            // We do a naive approach: remove all decorations from that line, then add the accepted color
            // (Because we can't partially remove from just one line, we reapply everything.)
            
            // If we want to highlight the newly accepted line in red or green:
            if (side === 'original') {
                // Mark this line in red
                currentEditor.setDecorations(decorationRed, [singleLineRange]);
                // Remove green highlight for this line if it existed
                currentEditor.setDecorations(decorationGreen, []);
            } else {
                // Mark this line in green
                currentEditor.setDecorations(decorationGreen, [singleLineRange]);
                // Remove red highlight
                currentEditor.setDecorations(decorationRed, []);
            }

            // Re-apply all decorations to keep other lines consistent
            provider.applyAllDecorations(currentEditor);
        }
    });

    vscode.commands.registerCommand('mergeai.declineLineChange', (lineIndex: number, side: 'original' | 'incoming') => {
        // "Decline" does nothing
        vscode.window.showInformationMessage(`Declined change from ${side} on line ${lineIndex + 1}.`);
    });

    return provider;
}
