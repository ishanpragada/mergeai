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
                        position: relative; /* For positioning action buttons */
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

                    /* Conflict section container */
                    .conflict-section {
                        position: relative;
                        margin-bottom: 10px;
                        padding-top: 30px; /* Add space for the buttons at the top */
                    }

                    /* Action buttons for each conflict section */
                    .action-buttons {
                        position: absolute;
                        right: 10px;
                        top: 0;
                        display: flex;
                        gap: 5px;
                        z-index: 10; /* Ensure buttons are above code */
                        background: rgba(255, 255, 255, 0.9); /* Semi-transparent background */
                        padding: 3px;
                        border-radius: 3px;
                    }

                    .action-button {
                        background: #f6f8fa;
                        border: 1px solid #d1d5da;
                        border-radius: 3px;
                        padding: 2px 6px;
                        font-size: 12px;
                        cursor: pointer;
                        transition: background-color 0.2s;
                        z-index: 10; /* Ensure buttons are above code */
                        position: relative; /* Establish stacking context */
                    }

                    .accept-button {
                        background: #2ea043;
                        color: white;
                        border-color: #2ea043;
                    }

                    .reject-button {
                        background: #f85149;
                        color: white;
                        border-color: #f85149;
                    }

                    .action-button:hover {
                        opacity: 0.9;
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

                            // Create conflict section containers
                            const localSection = document.createElement('div');
                            localSection.className = 'conflict-section';
                            localSection.dataset.conflictIndex = index.toString();
                            
                            const remoteSection = document.createElement('div');
                            remoteSection.className = 'conflict-section';
                            remoteSection.dataset.conflictIndex = index.toString();
                            
                            const resolvedSection = document.createElement('div');
                            resolvedSection.className = 'conflict-section';
                            resolvedSection.dataset.conflictIndex = index.toString();
                            resolvedSection.id = \`resolved-section-\${index}\`;

                            // Add conflict code
                            const localLines = conflict.local.split('\\n');
                            const remoteLines = conflict.remote.split('\\n');
                            const maxLines = Math.max(localLines.length, remoteLines.length);

                            // Add the conflict lines to their respective sections
                            for (let i = 0; i < maxLines; i++) {
                                const localLine = localLines[i] || '';
                                const remoteLine = remoteLines[i] || '';
                                
                                localSection.appendChild(createCodeElement(localLine, true, 'local'));
                                remoteSection.appendChild(createCodeElement(remoteLine, true, 'remote'));
                                resolvedSection.appendChild(createCodeElement('', true, 'resolved'));
                            }

                            // Add action buttons to local section
                            const localButtons = document.createElement('div');
                            localButtons.className = 'action-buttons';
                            localButtons.innerHTML = \`
                                <button class="action-button accept-button" onclick="window.acceptChange(\${index}, 'local')">Accept</button>
                            \`;
                            localSection.appendChild(localButtons);

                            // Add action buttons to remote section
                            const remoteButtons = document.createElement('div');
                            remoteButtons.className = 'action-buttons';
                            remoteButtons.innerHTML = \`
                                <button class="action-button accept-button" onclick="window.acceptChange(\${index}, 'remote')">Accept</button>
                            \`;
                            remoteSection.appendChild(remoteButtons);

                            // Add action buttons to resolved section
                            const resolvedButtons = document.createElement('div');
                            resolvedButtons.className = 'action-buttons';
                            resolvedButtons.innerHTML = \`
                                <button class="action-button reject-button" onclick="window.clearResolvedSection(\${index})">Clear</button>
                            \`;
                            resolvedSection.appendChild(resolvedButtons);

                            // Append sections to their respective panels
                            localContent.appendChild(localSection);
                            remoteContent.appendChild(remoteSection);
                            resolvedContent.appendChild(resolvedSection);

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
                        
                        const resolvedSection = document.getElementById(\`resolved-section-\${index}\`);
                        if (!resolvedSection) return;
                        
                        // Clear previous content
                        const resolvedLines = resolvedSection.querySelectorAll('.conflict-resolved');
                        Array.from(resolvedLines).forEach(line => line.remove());
                        
                        // Add new content
                        lines.forEach(line => {
                            resolvedSection.appendChild(createCodeElement(line, true, 'resolved'));
                        });
                        
                        // Add the clear button back
                        const buttons = resolvedSection.querySelector('.action-buttons');
                        if (buttons) {
                            resolvedSection.appendChild(buttons);
                        }
                    }

                    function clearResolvedSection(index) {
                        const resolvedSection = document.getElementById(\`resolved-section-\${index}\`);
                        if (!resolvedSection) return;
                        
                        // Clear content except for buttons
                        const resolvedLines = resolvedSection.querySelectorAll('.conflict-resolved');
                        Array.from(resolvedLines).forEach(line => line.remove());
                        
                        // Add empty lines
                        const conflict = conflicts[index];
                        const maxLines = Math.max(
                            conflict.local.split('\\n').length,
                            conflict.remote.split('\\n').length
                        );
                        
                        for (let i = 0; i < maxLines; i++) {
                            resolvedSection.appendChild(createCodeElement('', true, 'resolved'));
                        }
                        
                        // Add the clear button back
                        const buttons = resolvedSection.querySelector('.action-buttons');
                        if (buttons) {
                            resolvedSection.appendChild(buttons);
                        }
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
                        // Check if all conflicts have been resolved
                        const unresolvedSections = Array.from(document.querySelectorAll('.conflict-section'))
                            .filter(section => {
                                const index = section.dataset.conflictIndex;
                                const resolvedSection = document.getElementById(\`resolved-section-\${index}\`);
                                if (!resolvedSection) return false;
                                
                                const lines = resolvedSection.querySelectorAll('.conflict-resolved');
                                return Array.from(lines).every(line => line.textContent === '');
                            });
                            
                        if (unresolvedSections.length > 0) {
                            vscode.postMessage({ 
                                command: 'showError', 
                                message: 'Please resolve all conflicts before committing.'
                            });
                            return;
                        }
                        
                        // Collect all content including resolved conflicts
                        const resolvedContent = document.getElementById('resolved-content');
                        const allLines = [];
                        
                        // Process non-conflict lines and resolved conflict sections
                        Array.from(resolvedContent.childNodes).forEach(node => {
                            if (node.classList && node.classList.contains('conflict-section')) {
                                // Get resolved lines from conflict section
                                const lines = node.querySelectorAll('.conflict-resolved');
                                Array.from(lines).forEach(line => {
                                    allLines.push(line.textContent);
                                });
                            } else if (node.classList && node.classList.contains('code-line')) {
                                // Regular non-conflict line
                                allLines.push(node.textContent);
                            }
                        });
                        
                        vscode.postMessage({ 
                            command: 'commitResolution', 
                            resolvedCode: allLines.join('\\n')
                        });
                    });

                    // Make functions available to the window object so they can be called from HTML
                    window.acceptChange = acceptChange;
                    window.clearResolvedSection = clearResolvedSection;
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
