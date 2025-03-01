import * as vscode from 'vscode';

export class MergeConflictHandler {
    constructor(private context: vscode.ExtensionContext) {}

    /**
     * Main entry point to handle merge conflicts in the active editor.
     */
    async handleMergeConflict(editor: vscode.TextEditor) {
        const document = editor.document;
        const text = document.getText();
        
        const conflicts = this.parseMergeConflicts(text);
        if (!conflicts.length) {
            vscode.window.showInformationMessage('No merge conflicts found.');
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'mergePanel',
            'Merge Conflict Resolution',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        panel.webview.html = this.getWebviewContent(panel.webview);
        
        // Send the full file content and conflict positions
        panel.webview.postMessage({
            command: 'setContent',
            fullContent: text,
            conflicts: conflicts
        });

        panel.webview.onDidReceiveMessage(async message => {
            if (message.command === 'commitResolution') {
                await this.applyResolution(editor, message.resolvedCode);
            } else if (message.command === 'showError') {
                vscode.window.showErrorMessage(message.message);
            }
        });
    }

    /**
     * Parse merge conflicts (<<<, ===, >>>) from the file text.
     */
    private parseMergeConflicts(text: string) {
        const conflicts = [];
        const regex = /<<<<<<< (.*?)\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> (.*?)(?:\n|$)/g;
        let match;

        while ((match = regex.exec(text)) !== null) {
            conflicts.push({
                start: match.index,
                end: match.index + match[0].length,
                header: match[1],
                local: match[2],
                remote: match[3],
                footer: match[4]
            });
        }

        return conflicts;
    }

    /**
     * Returns the HTML content for the merge conflict resolution panel,
     * with fixed-width panels and horizontal scrollbars.
     */
    private getWebviewContent(webview: vscode.Webview): string {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>Merge Conflict Resolution</title>
                <style>
                    html, body {
                        height: 100%;
                        margin: 0;
                        padding: 0;
                        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                    }

                    body {
                        display: flex;
                        flex-direction: column;
                        box-sizing: border-box;
                    }

                    .panels-container {
                        display: flex;
                        /* Make sure panels are side by side and do not wrap */
                        flex-direction: row;
                        justify-content: space-between;
                        align-items: stretch;

                        /* Ensure the container takes up remaining space to show all 3 panels */
                        flex: 1;

                        /* Gap between panels */
                        gap: 20px;
                        /* Optional: padding around the container edges */
                        padding: 10px;
                        box-sizing: border-box;
                    }

                    .panel {
                        /* Fix each panel to one-third of the container */
                        width: 33%;
                        min-width: 0; /* Important: prevents panel from growing when content is wide */
                        border: 1px solid #ddd;
                        border-radius: 6px;
                        background: #fff;
                        display: flex;
                        flex-direction: column;
                        overflow: hidden; /* Hide overflow here; child will scroll */
                    }

                    .panel-header {
                        font-weight: 600;
                        padding: 15px;
                        border-bottom: 1px solid #eee;
                        background: #f6f8fa;
                        border-radius: 6px 6px 0 0;
                    }

                    .panel-content {
                        /* This is the scrollable area inside each panel */
                        flex: 1;
                        padding: 15px;

                        /* Enable vertical and horizontal scrolling inside the panel */
                        overflow-y: auto;
                        overflow-x: auto;

                        /* Do not wrap long lines; let them scroll horizontally */
                        white-space: pre;
                        position: relative; /* Add position relative for absolute positioning of children */
                    }

                    .code-line {
                        font-family: monospace;
                        padding: 2px 4px;
                        white-space: pre; /* Ensures code lines do not wrap */
                        min-height: 1em;
                        position: relative; /* Position relative for the pseudo-element */
                        z-index: 1; /* Ensure text is above the background */
                    }

                    /* Use pseudo-elements to create full-width backgrounds */
                    .conflict-local::before,
                    .conflict-remote::before,
                    .conflict-resolved::before {
                        content: "";
                        position: absolute;
                        left: 0;
                        top: 0;
                        height: 100%;
                        width: 100vw; /* Use viewport width to ensure it extends beyond visible area */
                        z-index: -1; /* Place behind the text */
                    }

                    .conflict-local {
                        border-left: 2px solid #2ea043;
                    }
                    .conflict-local::before {
                        background-color: rgba(46, 160, 67, 0.1);
                    }

                    .conflict-remote {
                        border-left: 2px solid #f85149;
                    }
                    .conflict-remote::before {
                        background-color: rgba(248, 81, 73, 0.1);
                    }

                    .conflict-resolved {
                        border-left: 2px solid #0366d6;
                    }
                    .conflict-resolved::before {
                        background-color: rgba(246, 248, 250, 0.5);
                    }

                    /* Arrow buttons for local/remote acceptance */
                    .arrow-buttons {
                        position: absolute;
                        display: flex;
                        gap: 10px;
                        transform: translateX(-50%);
                    }
                    .arrow-button {
                        background: #0366d6;
                        color: white;
                        border: none;
                        border-radius: 50%;
                        width: 24px;
                        height: 24px;
                        font-size: 14px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: transform 0.2s;
                    }
                    .arrow-button:hover {
                        transform: scale(1.1);
                    }
                    .arrow-button:active {
                        transform: scale(0.95);
                    }

                    .commit-button {
                        display: block;
                        margin: 20px auto;
                        padding: 8px 16px;
                        background: #2ea043;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        font-size: 14px;
                        cursor: pointer;
                        transition: background-color 0.2s;
                    }
                    .commit-button:hover {
                        background: #2c974b;
                    }

                    .keyboard-hint {
                        text-align: center;
                        color: #586069;
                        margin-top: 10px;
                        font-size: 12px;
                    }
                    kbd {
                        background: #fafbfc;
                        border: 1px solid #d1d5da;
                        border-radius: 3px;
                        padding: 2px 5px;
                        font-size: 11px;
                    }
                </style>
            </head>
            <body>
                <div class="panels-container">
                    <div class="panel">
                        <div class="panel-header">Local Changes</div>
                        <div id="local-content" class="panel-content"></div>
                    </div>
                    <div class="panel">
                        <div class="panel-header">Resolved Code</div>
                        <div id="resolved-content" class="panel-content"></div>
                    </div>
                    <div class="panel">
                        <div class="panel-header">Remote Changes</div>
                        <div id="remote-content" class="panel-content"></div>
                    </div>
                </div>
                <button id="commit" class="commit-button">Commit Resolution</button>
                <div class="keyboard-hint">
                    Press <kbd>←</kbd> to accept local changes • <kbd>→</kbd> to accept remote changes
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    let currentConflict = 0;
                    let conflicts = [];
                    let fileContent = '';

                    function createCodeElement(text, isConflict = false, type = '') {
                        const div = document.createElement('div');
                        div.className = 'code-line' + (isConflict ? ' conflict-' + type : '');
                        div.textContent = text;
                        return div;
                    }

                    function renderContent() {
                        const localContent = document.getElementById('local-content');
                        const resolvedContent = document.getElementById('resolved-content');
                        const remoteContent = document.getElementById('remote-content');
                        
                        localContent.innerHTML = '';
                        resolvedContent.innerHTML = '';
                        remoteContent.innerHTML = '';

                        let lastPos = 0;
                        conflicts.forEach((conflict, index) => {
                            // Add non-conflict code before this conflict
                            const beforeText = fileContent.substring(lastPos, conflict.start);
                            if (beforeText) {
                                const lines = beforeText.split('\\n');
                                lines.forEach(line => {
                                    localContent.appendChild(createCodeElement(line));
                                    resolvedContent.appendChild(createCodeElement(line));
                                    remoteContent.appendChild(createCodeElement(line));
                                });
                            }

                            // Add conflict code
                            const localLines = conflict.local.split('\\n');
                            const remoteLines = conflict.remote.split('\\n');
                            const maxLines = Math.max(localLines.length, remoteLines.length);

                            // Create arrow buttons for this conflict
                            const arrowButtons = document.createElement('div');
                            arrowButtons.className = 'arrow-buttons';
                            arrowButtons.style.left = '50%';
                            arrowButtons.style.top = resolvedContent.offsetTop + 'px';
                            arrowButtons.innerHTML = \`
                                <button class="arrow-button" onclick="acceptChange(\${index}, 'local')">←</button>
                                <button class="arrow-button" onclick="acceptChange(\${index}, 'remote')">→</button>
                            \`;
                            resolvedContent.appendChild(arrowButtons);

                            // Add the conflict lines
                            for (let i = 0; i < maxLines; i++) {
                                const localLine = localLines[i] || '';
                                const remoteLine = remoteLines[i] || '';
                                
                                localContent.appendChild(createCodeElement(localLine, true, 'local'));
                                remoteContent.appendChild(createCodeElement(remoteLine, true, 'remote'));
                                resolvedContent.appendChild(createCodeElement('', true, 'resolved'));
                            }

                            lastPos = conflict.end;
                        });

                        // Add remaining non-conflict code
                        const remainingText = fileContent.substring(lastPos);
                        if (remainingText) {
                            const lines = remainingText.split('\\n');
                            lines.forEach(line => {
                                localContent.appendChild(createCodeElement(line));
                                resolvedContent.appendChild(createCodeElement(line));
                                remoteContent.appendChild(createCodeElement(line));
                            });
                        }
                    }

                    function acceptChange(index, source) {
                        const conflict = conflicts[index];
                        const lines = source === 'local' ? conflict.local.split('\\n') : conflict.remote.split('\\n');
                        
                        const resolvedContent = document.getElementById('resolved-content');
                        const resolvedLines = resolvedContent.querySelectorAll('.conflict-resolved');
                        
                        lines.forEach((line, i) => {
                            if (resolvedLines[i]) {
                                resolvedLines[i].textContent = line;
                            }
                        });
                    }

                    window.addEventListener('message', event => {
                        const message = event.data;
                        if (message.command === 'setContent') {
                            conflicts = message.conflicts;
                            fileContent = message.fullContent;
                            renderContent();
                        }
                    });

                    document.addEventListener('keydown', (e) => {
                        if (e.key === 'ArrowLeft') {
                            acceptChange(currentConflict, 'local');
                        } else if (e.key === 'ArrowRight') {
                            acceptChange(currentConflict, 'remote');
                        } else if (e.key === 'ArrowDown' || e.key === ' ') {
                            if (currentConflict < conflicts.length - 1) {
                                currentConflict++;
                            }
                        } else if (e.key === 'ArrowUp') {
                            if (currentConflict > 0) {
                                currentConflict--;
                            }
                        }
                    });

                    document.getElementById('commit').addEventListener('click', () => {
                        const resolvedContent = document.getElementById('resolved-content');
                        const lines = Array.from(resolvedContent.querySelectorAll('.code-line'))
                            .map(line => line.textContent);
                        
                        vscode.postMessage({ 
                            command: 'commitResolution', 
                            resolvedCode: lines.join('\\n')
                        });
                    });
                </script>
            </body>
            </html>
        `;
    }

    /**
     * Applies the resolved code back into the editor and saves the file.
     */
    private async applyResolution(editor: vscode.TextEditor, resolvedCode: string) {
        const document = editor.document;
        const edit = new vscode.WorkspaceEdit();
        
        // Replace the entire file content
        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
        );
        
        edit.replace(document.uri, fullRange, resolvedCode);
        await vscode.workspace.applyEdit(edit);
        await document.save();
        
        vscode.window.showInformationMessage('Merge conflicts resolved successfully!');
    }
}
