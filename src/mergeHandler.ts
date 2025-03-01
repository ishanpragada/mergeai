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
                <link href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.24.1/themes/prism-tomorrow.min.css" rel="stylesheet" />
                <style>
                    html, body {
                        height: 100%;
                        margin: 0;
                        padding: 0;
                        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                        background-color: var(--vscode-editor-background, #1e1e1e);
                        color: var(--vscode-editor-foreground, #d4d4d4);
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
                        position: relative; /* For positioning the between-panel buttons */
                    }

                    .panel {
                        /* Fix each panel to one-third of the container */
                        width: 33%;
                        min-width: 0; /* Important: prevents panel from growing when content is wide */
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 6px;
                        background: var(--vscode-editor-background);
                        display: flex;
                        flex-direction: column;
                        overflow: hidden; /* Hide overflow here; child will scroll */
                        position: relative; /* For positioning action buttons */
                    }

                    .panel-header {
                        font-weight: 600;
                        padding: 15px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        background: var(--vscode-titleBar-activeBackground);
                        color: var(--vscode-titleBar-activeForeground);
                        border-radius: 6px 6px 0 0;
                    }

                    .panel-content {
                        /* This is the scrollable area inside each panel */
                        flex: 1;
                        padding: 0;

                        /* Enable vertical and horizontal scrolling inside the panel */
                        overflow-y: auto;
                        overflow-x: auto;

                        /* Do not wrap long lines; let them scroll horizontally */
                        white-space: pre;
                        position: relative; /* Add position relative for absolute positioning of children */
                        
                        /* VSCode editor styling */
                        font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
                        font-size: 12px;
                        line-height: 1.5;
                        tab-size: 4;
                    }

                    /* Line number gutter */
                    .line-numbers {
                        position: absolute;
                        left: 0;
                        top: 0;
                        bottom: 0;
                        width: 40px;
                        background-color: var(--vscode-editorGutter-background);
                        color: var(--vscode-editorLineNumber-foreground);
                        text-align: right;
                        padding: 0 5px;
                        user-select: none;
                    }

                    .code-container {
                        margin-left: 40px; /* Space for line numbers */
                        padding: 0 10px;
                    }

                    .code-line {
                        font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
                        padding: 0 4px;
                        white-space: pre; /* Ensures code lines do not wrap */
                        min-height: 1em;
                        position: relative; /* Position relative for the pseudo-element */
                        z-index: 1; /* Ensure text is above the background */
                    }

                    /* Override Prism.js default styles */
                    code[class*="language-"],
                    pre[class*="language-"] {
                        color: #d4d4d4;
                        background: none;
                        font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
                        font-size: 12px;
                        text-align: left;
                        white-space: pre;
                        word-spacing: normal;
                        word-break: normal;
                        word-wrap: normal;
                        line-height: 1.5;
                        tab-size: 4;
                        hyphens: none;
                    }

                    /* Additional token styles to ensure proper coloring */
                    .token.comment { color: #6A9955 !important; }
                    .token.string { color: #CE9178 !important; }
                    .token.keyword { color: #569CD6 !important; }
                    .token.function { color: #DCDCAA !important; }
                    .token.number { color: #B5CEA8 !important; }
                    .token.operator { color: #D4D4D4 !important; }
                    .token.class-name { color: #4EC9B0 !important; }
                    .token.variable { color: #9CDCFE !important; }
                    .token.property { color: #9CDCFE !important; }
                    .token.punctuation { color: #D4D4D4 !important; }

                    /* Conflict section container */
                    .conflict-section {
                        position: relative;
                        margin-bottom: 0;
                        padding: 0;
                        border: none;
                    }

                    /* Active conflict section */
                    .conflict-section.active {
                        background-color: var(--vscode-editor-selectionBackground, rgba(3, 102, 214, 0.05));
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
                        background-color: var(--vscode-diffEditor-insertedTextBackground, rgba(46, 160, 67, 0.1));
                    }

                    .conflict-remote {
                        border-left: 2px solid #f85149;
                    }
                    .conflict-remote::before {
                        background-color: var(--vscode-diffEditor-removedTextBackground, rgba(248, 81, 73, 0.1));
                    }

                    .conflict-resolved {
                        border-left: 2px solid #0366d6;
                    }
                    .conflict-resolved::before {
                        background-color: var(--vscode-editor-inactiveSelectionBackground, rgba(246, 248, 250, 0.1));
                    }

                    /* Arrow button styling */
                    .arrow-button {
                        width: 20px;
                        height: 20px;
                        border-radius: 50%;
                        color: white;
                        border: none;
                        font-size: 12px;
                        font-weight: bold;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
                        transition: transform 0.2s, background-color 0.2s;
                        padding: 0;
                        line-height: 1;
                        position: absolute;
                        z-index: 20;
                    }

                    .arrow-button:hover {
                        transform: scale(1.1);
                    }

                    .arrow-button.left {
                        background: #2ea043;
                        right: -10px; /* Position at the right edge of the section */
                    }

                    .arrow-button.right {
                        background: #f85149;
                        left: -10px; /* Position at the left edge of the section */
                    }

                    .arrow-button.clear {
                        background: #6e7681;
                    }

                    .commit-button {
                        display: block;
                        margin: 20px auto;
                        padding: 8px 16px;
                        background: var(--vscode-button-background, #2ea043);
                        color: var(--vscode-button-foreground, white);
                        border: none;
                        border-radius: 6px;
                        font-size: 14px;
                        cursor: pointer;
                        transition: background-color 0.2s;
                    }
                    .commit-button:hover {
                        background: var(--vscode-button-hoverBackground, #2c974b);
                    }

                    .keyboard-hint {
                        text-align: center;
                        color: var(--vscode-descriptionForeground, #586069);
                        margin-top: 10px;
                        font-size: 12px;
                    }
                    kbd {
                        background: var(--vscode-keybindingLabel-background, #fafbfc);
                        border: 1px solid var(--vscode-keybindingLabel-border, #d1d5da);
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
                <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.24.1/prism.min.js"></script>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.24.1/components/prism-javascript.min.js"></script>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.24.1/components/prism-typescript.min.js"></script>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.24.1/components/prism-jsx.min.js"></script>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.24.1/components/prism-tsx.min.js"></script>
                <script>
                    // Initialize Prism.js manually to prevent automatic highlighting
                    Prism.manual = true;
                    
                    // Ensure Prism.js is loaded
                    if (!window.Prism) {
                        console.error('Prism.js not loaded!');
                    }
                    
                    const vscode = acquireVsCodeApi();
                    let currentConflict = 0;
                    let conflicts = [];
                    let fileContent = '';

                    function createCodeElement(text, isConflict = false, type = '') {
                        const div = document.createElement('div');
                        div.className = 'code-line' + (isConflict ? ' conflict-' + type : '');
                        
                        // Apply syntax highlighting with Prism.js
                        if (text) {
                            try {
                                // Determine language based on file extension
                                const fileExt = getFileExtension(fileContent);
                                let language = 'typescript'; // Default to typescript
                                
                                if (fileExt === 'js') language = 'javascript';
                                else if (fileExt === 'jsx') language = 'jsx';
                                else if (fileExt === 'tsx') language = 'tsx';
                                
                                // Use Prism for syntax highlighting
                                const highlighted = Prism.highlight(text, Prism.languages[language], language);
                                div.innerHTML = highlighted;
                            } catch (e) {
                                // Fallback if Prism.js fails
                                console.error('Syntax highlighting error:', e);
                                div.textContent = text;
                            }
                        } else {
                            div.textContent = text;
                        }
                        
                        return div;
                    }

                    function getFileExtension(content) {
                        // Try to determine file type from content
                        if (content.includes('import React') || content.includes('from "react"')) {
                            return content.includes('<') ? 'tsx' : 'ts';
                        }
                        return 'ts'; // Default to TypeScript
                    }

                    function renderContent() {
                        // Clear any existing Prism.js styling
                        document.querySelectorAll('.prism-code').forEach(el => el.remove());
                        
                        const localContent = document.getElementById('local-content');
                        const resolvedContent = document.getElementById('resolved-content');
                        const remoteContent = document.getElementById('remote-content');
                        
                        localContent.innerHTML = '';
                        resolvedContent.innerHTML = '';
                        remoteContent.innerHTML = '';

                        // Create line number containers and code containers for each panel
                        const localLineNumbers = document.createElement('div');
                        localLineNumbers.className = 'line-numbers';
                        const localCodeContainer = document.createElement('div');
                        localCodeContainer.className = 'code-container';
                        localContent.appendChild(localLineNumbers);
                        localContent.appendChild(localCodeContainer);

                        const resolvedLineNumbers = document.createElement('div');
                        resolvedLineNumbers.className = 'line-numbers';
                        const resolvedCodeContainer = document.createElement('div');
                        resolvedCodeContainer.className = 'code-container';
                        resolvedContent.appendChild(resolvedLineNumbers);
                        resolvedContent.appendChild(resolvedCodeContainer);

                        const remoteLineNumbers = document.createElement('div');
                        remoteLineNumbers.className = 'line-numbers';
                        const remoteCodeContainer = document.createElement('div');
                        remoteCodeContainer.className = 'code-container';
                        remoteContent.appendChild(remoteLineNumbers);
                        remoteContent.appendChild(remoteCodeContainer);

                        // Remove any existing between-panel buttons containers
                        document.querySelectorAll('.between-panel-buttons').forEach(el => el.remove());

                        let lastPos = 0;
                        let lineNumber = 1;
                        
                        conflicts.forEach((conflict, index) => {
                            // Add non-conflict code before this conflict
                            const beforeText = fileContent.substring(lastPos, conflict.start);
                            if (beforeText) {
                                const lines = beforeText.split('\\n');
                                lines.forEach(line => {
                                    // Add line numbers
                                    const localLineNum = document.createElement('div');
                                    localLineNum.textContent = lineNumber;
                                    localLineNumbers.appendChild(localLineNum);
                                    
                                    const resolvedLineNum = document.createElement('div');
                                    resolvedLineNum.textContent = lineNumber;
                                    resolvedLineNumbers.appendChild(resolvedLineNum);
                                    
                                    const remoteLineNum = document.createElement('div');
                                    remoteLineNum.textContent = lineNumber;
                                    remoteLineNumbers.appendChild(remoteLineNum);
                                    
                                    // Add code lines
                                    localCodeContainer.appendChild(createCodeElement(line));
                                    resolvedCodeContainer.appendChild(createCodeElement(line));
                                    remoteCodeContainer.appendChild(createCodeElement(line));
                                    
                                    lineNumber++;
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
                                
                                // Add line numbers for conflict sections
                                const localLineNum = document.createElement('div');
                                localLineNum.textContent = lineNumber;
                                localLineNum.style.color = 'var(--vscode-editorLineNumber-activeForeground)';
                                localLineNumbers.appendChild(localLineNum);
                                
                                const resolvedLineNum = document.createElement('div');
                                resolvedLineNum.textContent = lineNumber;
                                resolvedLineNum.style.color = 'var(--vscode-editorLineNumber-activeForeground)';
                                resolvedLineNumbers.appendChild(resolvedLineNum);
                                
                                const remoteLineNum = document.createElement('div');
                                remoteLineNum.textContent = lineNumber;
                                remoteLineNum.style.color = 'var(--vscode-editorLineNumber-activeForeground)';
                                remoteLineNumbers.appendChild(remoteLineNum);
                                
                                localSection.appendChild(createCodeElement(localLine, true, 'local'));
                                remoteSection.appendChild(createCodeElement(remoteLine, true, 'remote'));
                                resolvedSection.appendChild(createCodeElement('', true, 'resolved'));
                                
                                lineNumber++;
                            }

                            // Create arrow buttons for this conflict
                            // Left arrow (local to resolved) - attached directly to the local section
                            const leftArrow = document.createElement('button');
                            leftArrow.className = 'arrow-button left';
                            leftArrow.textContent = '→';
                            leftArrow.title = 'Accept local changes';
                            leftArrow.onclick = () => window.acceptChange(index, 'local');
                            localSection.appendChild(leftArrow);

                            // Right arrow (remote to resolved) - attached directly to the remote section
                            const rightArrow = document.createElement('button');
                            rightArrow.className = 'arrow-button right';
                            rightArrow.textContent = '←';
                            rightArrow.title = 'Accept remote changes';
                            rightArrow.onclick = () => window.acceptChange(index, 'remote');
                            remoteSection.appendChild(rightArrow);

                            // Add click handler to make section active
                            localSection.addEventListener('click', () => {
                                document.querySelectorAll('.conflict-section').forEach(s => s.classList.remove('active'));
                                resolvedSection.classList.add('active');
                                currentConflict = index;
                            });
                            
                            remoteSection.addEventListener('click', () => {
                                document.querySelectorAll('.conflict-section').forEach(s => s.classList.remove('active'));
                                resolvedSection.classList.add('active');
                                currentConflict = index;
                            });
                            
                            resolvedSection.addEventListener('click', () => {
                                document.querySelectorAll('.conflict-section').forEach(s => s.classList.remove('active'));
                                resolvedSection.classList.add('active');
                                currentConflict = index;
                            });

                            // Append sections to their respective panels
                            localCodeContainer.appendChild(localSection);
                            remoteCodeContainer.appendChild(remoteSection);
                            resolvedCodeContainer.appendChild(resolvedSection);

                            lastPos = conflict.end;
                        });

                        // Add remaining non-conflict code
                        const remainingText = fileContent.substring(lastPos);
                        if (remainingText) {
                            const lines = remainingText.split('\\n');
                            lines.forEach(line => {
                                // Add line numbers
                                const localLineNum = document.createElement('div');
                                localLineNum.textContent = lineNumber;
                                localLineNumbers.appendChild(localLineNum);
                                
                                const resolvedLineNum = document.createElement('div');
                                resolvedLineNum.textContent = lineNumber;
                                resolvedLineNumbers.appendChild(resolvedLineNum);
                                
                                const remoteLineNum = document.createElement('div');
                                remoteLineNum.textContent = lineNumber;
                                remoteLineNumbers.appendChild(remoteLineNum);
                                
                                // Add code lines
                                localCodeContainer.appendChild(createCodeElement(line));
                                resolvedCodeContainer.appendChild(createCodeElement(line));
                                remoteCodeContainer.appendChild(createCodeElement(line));
                                
                                lineNumber++;
                            });
                        }

                        // Add clear button at the top of the resolved panel
                        const clearButton = document.createElement('button');
                        clearButton.className = 'arrow-button clear';
                        clearButton.textContent = 'X';
                        clearButton.title = 'Clear current selection';
                        clearButton.style.position = 'absolute';
                        clearButton.style.top = '10px';
                        clearButton.style.left = '50%';
                        clearButton.style.transform = 'translateX(-50%)';
                        clearButton.onclick = () => {
                            window.clearResolvedSection(currentConflict);
                        };
                        document.querySelector('.panels-container').appendChild(clearButton);
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
                        
                        // Highlight the active section
                        document.querySelectorAll('.conflict-section').forEach(section => {
                            section.classList.remove('active');
                        });
                        resolvedSection.classList.add('active');
                    }

                    function clearResolvedSection(index) {
                        const resolvedSection = document.getElementById(\`resolved-section-\${index}\`);
                        if (!resolvedSection) return;
                        
                        // Clear content
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
                        
                        // Highlight the active section
                        document.querySelectorAll('.conflict-section').forEach(section => {
                            section.classList.remove('active');
                        });
                        resolvedSection.classList.add('active');
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

                    // Flag to prevent recursive scroll events
                    let isScrolling = false;
                    
                    // Synchronize only vertical scrolling across all panels
                    function syncVerticalScroll(event) {
                        if (isScrolling) return;
                        
                        isScrolling = true;
                        const source = event.target;
                        const panels = document.querySelectorAll('.panel-content');
                        
                        panels.forEach(panel => {
                            if (panel !== source) {
                                panel.scrollTop = source.scrollTop;
                            }
                        });
                        
                        // Reset the flag after a short delay
                        setTimeout(() => {
                            isScrolling = false;
                        }, 10);
                    }

                    // Add scroll event listeners to all panels
                    document.querySelectorAll('.panel-content').forEach(panel => {
                        panel.addEventListener('scroll', syncVerticalScroll, { passive: true });
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
