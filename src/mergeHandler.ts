import * as vscode from 'vscode';
import OpenAI from 'openai';


export class MergeConflictHandler {
    private openai: OpenAI | undefined;

    constructor(private context: vscode.ExtensionContext) {
        this.initializeOpenAI();
    }

    /**
     * Initialize the OpenAI client with the API key from settings
     */
    private initializeOpenAI() {
        const config = vscode.workspace.getConfiguration('mergeai');
        const apiKey = '';
        if (apiKey) {
            this.openai = new OpenAI({ apiKey });
        }
    }

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
            } else if (message.command === 'aiResolve') {
                try {
                    // Get the current conflict
                    const conflict = message.conflicts[message.currentConflict];
                    if (!conflict) {
                        panel.webview.postMessage({
                            command: 'aiResponse',
                            error: 'No conflict selected'
                        });
                        return;
                    }

                    // Prepare the prompt for the AI
                    const prompt = `Given a merge conflict between these two versions:

Local version:
${conflict.local}

Remote version:
${conflict.remote}

User request: ${message.prompt}

Please analyze both versions and provide a resolved version that best addresses the user's request. Return ONLY the resolved code, no explanations.`;

                    // Call the AI API (this is a placeholder - you'll need to implement the actual AI call)
                    const resolution = await this.callAI(prompt);

                    // Send the resolution back to the webview
                    panel.webview.postMessage({
                        command: 'aiResponse',
                        resolution: resolution
                    });
                } catch (error: any) {
                    panel.webview.postMessage({
                        command: 'aiResponse',
                        error: error?.message || 'Unknown error occurred'
                    });
                }
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
                        overflow: hidden; /* Prevent default body scrolling */
                    }

                    body {
                        display: flex;
                        flex-direction: column;
                        box-sizing: border-box;
                    }

                    .main-container {
                        display: flex;
                        flex-direction: column;
                        height: 100vh;
                        overflow: hidden;
                    }

                    .scroll-container {
                        flex: 1;
                        position: relative;
                        overflow: hidden;
                    }

                    .bottom-container {
                        flex-shrink: 0;
                        padding: 10px;
                        background: var(--vscode-editor-background);
                        border-top: 1px solid var(--vscode-panel-border);
                    }

                    .panels-container {
                        height: 100%;
                        padding: 10px;
                    }

                    .commit-button {
                        margin-bottom: 10px;
                        width: 100%;
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
                        overflow: hidden; /* Hide overflow */
                    }
                    
                    /* AI Panel styles */
                    .ai-panel {
                        background: var(--vscode-editor-background);
                        border-top: 1px solid var(--vscode-panel-border);
                        padding: 15px;
                        margin-top: 10px;
                        display: flex;
                        flex-direction: column;
                        gap: 10px;
                    }

                    .ai-input-container {
                        display: flex;
                        gap: 10px;
                    }

                    .ai-input {
                        flex: 1;
                        padding: 8px 12px;
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 4px;
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        font-family: inherit;
                        font-size: 14px;
                    }

                    .ai-button {
                        padding: 8px 16px;
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 14px;
                    }

                    .ai-button:hover {
                        background: var(--vscode-button-hoverBackground);
                    }

                    .ai-status {
                        font-size: 14px;
                        color: var(--vscode-descriptionForeground);
                        min-height: 20px;
                    }
                    
                    /* Main scrollable container with vertical scrollbar */
                    .scroll-content {
                        width: 100%;
                        height: 0; /* Will be set dynamically */
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
                        
                        /* Only allow horizontal scrolling */
                        overflow-y: hidden;
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
                    
                    /* Hide scrollbar for Chrome, Safari and Opera */
                    .panel-content::-webkit-scrollbar {
                        display: none;
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
                    
                    /* Resolved content from local changes */
                    .conflict-resolved.from-local {
                        border-left: 2px solid #2ea043;
                    }
                    .conflict-resolved.from-local::before {
                        background-color: var(--vscode-diffEditor-insertedTextBackground, rgba(46, 160, 67, 0.1));
                    }
                    
                    /* Resolved content from remote changes */
                    .conflict-resolved.from-remote {
                        border-left: 2px solid #f85149;
                    }
                    .conflict-resolved.from-remote::before {
                        background-color: var(--vscode-diffEditor-removedTextBackground, rgba(248, 81, 73, 0.1));
                    }

                    /* Editable content styling */
                    [contenteditable="true"] {
                        outline: none;
                        min-height: 1em;
                        white-space: pre;
                        cursor: text;
                        border-left: 2px solid #0366d6;
                    }
                    
                    [contenteditable="true"]:focus {
                        background-color: var(--vscode-editor-selectionBackground, rgba(3, 102, 214, 0.2));
                    }
                    
                    [contenteditable="true"]:empty::before {
                        content: " ";
                        color: transparent;
                        display: inline-block;
                    }
                    
                    /* Maintain syntax highlighting in editable content */
                    [contenteditable="true"] .token {
                        pointer-events: none; /* Prevent issues with text selection */
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
                    
                    /* Individual clear button for each resolved section */
                    .clear-section-button {
                        width: 16px;
                        height: 16px;
                        border-radius: 50%;
                        background: #6e7681;
                        color: white;
                        border: none;
                        font-size: 10px;
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
                        right: 5px;
                        top: 5px;
                        z-index: 20;
                        opacity: 0.7;
                    }
                    
                    .clear-section-button:hover {
                        transform: scale(1.1);
                        opacity: 1;
                    }
                </style>
            </head>
            <body>
                <div class="main-container">
                    <div class="scroll-container" id="main-scroll">
                        <div class="scroll-content" id="scroll-content">
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
                        </div>
                    </div>
                    <div class="bottom-container">
                        <button id="commit" class="commit-button">Commit Resolution</button>
                        <div class="ai-panel">
                            <div class="ai-input-container">
                                <input type="text" class="ai-input" id="ai-prompt" placeholder="Ask AI to help resolve conflicts (e.g., 'Choose the version with better error handling')" />
                                <button class="ai-button" id="ai-submit">Ask AI</button>
                            </div>
                            <div class="ai-status" id="ai-status"></div>
                        </div>
                    </div>
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
                        
                        // For resolved sections, make the content editable
                        if (type === 'resolved') {
                            div.contentEditable = 'true';
                            div.spellcheck = false;
                            div.dataset.originalText = text; // Store original text for reference
                        }
                        
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
                            
                            // Add clear button for this specific resolved section
                            const clearSectionButton = document.createElement('button');
                            clearSectionButton.className = 'clear-section-button';
                            clearSectionButton.textContent = 'X';
                            clearSectionButton.title = 'Clear this section';
                            clearSectionButton.onclick = (e) => {
                                e.stopPropagation(); // Prevent triggering section click
                                window.clearResolvedSection(index);
                            };
                            resolvedSection.appendChild(clearSectionButton);

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

                            // Add click handlers to update current conflict index
                            localSection.addEventListener('click', () => {
                                currentConflict = index;
                            });
                            
                            remoteSection.addEventListener('click', () => {
                                currentConflict = index;
                            });
                            
                            resolvedSection.addEventListener('click', () => {
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
                    }

                    function acceptChange(index, source) {
                        const conflict = conflicts[index];
                        const lines = source === 'local' ? conflict.local.split('\\n') : conflict.remote.split('\\n');
                        
                        const resolvedSection = document.getElementById(\`resolved-section-\${index}\`);
                        if (!resolvedSection) return;
                        
                        // Clear previous content
                        const resolvedLines = resolvedSection.querySelectorAll('.conflict-resolved');
                        Array.from(resolvedLines).forEach(line => line.remove());
                        
                        // Add new content with appropriate source class
                        lines.forEach(line => {
                            const lineElement = createCodeElement(line, true, 'resolved');
                            // Add class based on source
                            lineElement.classList.add(source === 'local' ? 'from-local' : 'from-remote');
                            resolvedSection.appendChild(lineElement);
                        });
                    }

                    function clearResolvedSection(index) {
                        const resolvedSection = document.getElementById(\`resolved-section-\${index}\`);
                        if (!resolvedSection) return;
                        
                        // Clear content
                        const resolvedLines = resolvedSection.querySelectorAll('.conflict-resolved');
                        Array.from(resolvedLines).forEach(line => {
                            // Remove source-specific classes
                            line.classList.remove('from-local', 'from-remote');
                            line.remove();
                        });
                        
                        // Add empty lines
                        const conflict = conflicts[index];
                        const maxLines = Math.max(
                            conflict.local.split('\\n').length,
                            conflict.remote.split('\\n').length
                        );
                        
                        for (let i = 0; i < maxLines; i++) {
                            // Create empty line with default styling (no source class)
                            resolvedSection.appendChild(createCodeElement('', true, 'resolved'));
                        }
                    }

                    // Make functions available to the window object so they can be called from HTML
                    window.acceptChange = acceptChange;
                    window.clearResolvedSection = clearResolvedSection;

                    // Improved scroll synchronization for all panels
                    function setupScrollSync() {
                        const panels = document.querySelectorAll('.panel-content');
                        const mainScroll = document.getElementById('main-scroll');
                        const scrollContent = document.getElementById('scroll-content');
                        
                        // Function to update the height of the scroll content
                        function updateScrollHeight() {
                            // Find the maximum height among all panels
                            const maxHeight = Math.max(...Array.from(panels).map(panel => {
                                const content = panel.querySelector('.code-container');
                                return content ? content.scrollHeight : 0;
                            }));
                            
                            // Set the height of the scroll content
                            scrollContent.style.height = (maxHeight + 100) + 'px';
                        }
                        
                        // Function to sync panel positions with main scroll
                        function syncPanelsToScroll() {
                            const scrollTop = mainScroll.scrollTop;
                            
                            // Update all panels' scroll position
                            panels.forEach(panel => {
                                panel.scrollTop = scrollTop;
                            });
                        }
                        
                        // Listen for scroll events on the main scroll container
                        mainScroll.addEventListener('scroll', syncPanelsToScroll, { passive: true });
                        
                        // Update the scroll height when content changes
                        const observer = new MutationObserver(updateScrollHeight);
                        panels.forEach(panel => {
                            observer.observe(panel, { childList: true, subtree: true });
                        });
                        
                        // Initial height update
                        setTimeout(updateScrollHeight, 100);
                        
                        // Update height on window resize
                        window.addEventListener('resize', updateScrollHeight);
                    }
                    
                    // Set up scroll synchronization after content is rendered
                    window.addEventListener('message', event => {
                        const message = event.data;
                        if (message.command === 'setContent') {
                            conflicts = message.conflicts;
                            fileContent = message.fullContent;
                            renderContent();
                            
                            // Set up scroll sync after content is rendered
                            setTimeout(setupScrollSync, 100);
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
                                return Array.from(lines).every(line => !line.textContent.trim());
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
                        const codeContainer = resolvedContent.querySelector('.code-container');
                        if (codeContainer) {
                            Array.from(codeContainer.childNodes).forEach(node => {
                                if (node.classList && node.classList.contains('conflict-section')) {
                                    // Get resolved lines from conflict section
                                    const lines = node.querySelectorAll('.conflict-resolved');
                                    Array.from(lines).forEach(line => {
                                        // Get the actual text content, not the HTML with syntax highlighting
                                        allLines.push(line.textContent);
                                    });
                                } else if (node.classList && node.classList.contains('code-line')) {
                                    // Regular non-conflict line
                                    allLines.push(node.textContent);
                                }
                            });
                        }
                        
                        vscode.postMessage({ 
                            command: 'commitResolution', 
                            resolvedCode: allLines.join('\\n')
                        });
                    });

                    // AI functionality
                    document.getElementById('ai-submit').addEventListener('click', () => {
                        const prompt = document.getElementById('ai-prompt').value;
                        if (!prompt.trim()) {
                            vscode.postMessage({ 
                                command: 'showError', 
                                message: 'Please enter a prompt for the AI.'
                            });
                            return;
                        }

                        // Show loading state
                        const aiStatus = document.getElementById('ai-status');
                        aiStatus.textContent = 'AI is analyzing the conflicts...';
                        
                        // Send request to extension
                        vscode.postMessage({
                            command: 'aiResolve',
                            prompt: prompt,
                            currentConflict: currentConflict,
                            conflicts: conflicts
                        });
                    });

                    // Handle AI response
                    window.addEventListener('message', event => {
                        const message = event.data;
                        if (message.command === 'setContent') {
                            conflicts = message.conflicts;
                            fileContent = message.fullContent;
                            renderContent();
                            
                            // Set up scroll sync after content is rendered
                            setTimeout(setupScrollSync, 100);
                        } else if (message.command === 'aiResponse') {
                            const aiStatus = document.getElementById('ai-status');
                            if (message.error) {
                                aiStatus.textContent = 'Error: ' + message.error;
                                return;
                            }
                            
                            // Apply AI's resolution to the current conflict
                            const resolvedSection = document.getElementById(\`resolved-section-\${currentConflict}\`);
                            if (resolvedSection) {
                                // Clear previous content
                                const resolvedLines = resolvedSection.querySelectorAll('.conflict-resolved');
                                Array.from(resolvedLines).forEach(line => line.remove());
                                
                                // Add AI's resolved content
                                message.resolution.split('\\n').forEach(line => {
                                    const lineElement = createCodeElement(line, true, 'resolved');
                                    lineElement.classList.add('from-ai');
                                    resolvedSection.appendChild(lineElement);
                                });
                                
                                aiStatus.textContent = 'AI resolution applied successfully!';
                            }
                        }
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
        try {
            const document = editor.document;
            const edit = new vscode.WorkspaceEdit();
            
            // Get the original text and conflicts
            const originalText = document.getText();
            const conflicts = this.parseMergeConflicts(originalText);
            
            // Create the new text by replacing each conflict with its resolution
            let newText = originalText;
            for (const conflict of conflicts.reverse()) { // Process in reverse to maintain indices
                const conflictText = originalText.substring(conflict.start, conflict.end);
                newText = newText.substring(0, conflict.start) + resolvedCode + newText.substring(conflict.end);
            }
            
            // Replace the entire file content
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(document.getText().length)
            );
            
            edit.replace(document.uri, fullRange, newText);
            await vscode.workspace.applyEdit(edit);
            await document.save();
            
            vscode.window.showInformationMessage('Merge conflicts resolved successfully!');
        } catch (error) {
            vscode.window.showErrorMessage('Failed to apply resolution: ' + (error instanceof Error ? error.message : String(error)));
        }
    }

    /**
     * Gets AI resolution for a merge conflict with user preference
     */
    private async getAIResolutionWithPreference(conflict: string, preference: string): Promise<string> {
        if (!this.openai) {
            throw new Error('OpenAI API key not configured. Please set it in the extension settings.');
        }

        // Parse the conflict to extract current and incoming changes
        const startMarker = '<<<<<<<';
        const middleMarker = '=======';
        const endMarker = '>>>>>>>';

        const startMarkerPos = conflict.indexOf(startMarker);
        const middleMarkerPos = conflict.indexOf(middleMarker);
        const endMarkerPos = conflict.indexOf(endMarker);

        if (startMarkerPos === -1 || middleMarkerPos === -1 || endMarkerPos === -1) {
            throw new Error('Invalid conflict format');
        }

        // Extract current branch (HEAD) content
        const currentStartPos = startMarkerPos + startMarker.length;
        const currentBranch = conflict.substring(currentStartPos, middleMarkerPos).trim();

        // Extract incoming content
        const incomingStartPos = middleMarkerPos + middleMarker.length;
        const incomingBranch = conflict.substring(incomingStartPos, endMarkerPos).trim();

        // Create prompt for the AI with the user's preference
        const promptText = `
You are a merge conflict resolver. Below is a Git merge conflict. Please analyze both versions and suggest the best resolution, following the user's preference.

CURRENT BRANCH (HEAD):
\`\`\`
${currentBranch}
\`\`\`

INCOMING BRANCH:
\`\`\`
${incomingBranch}
\`\`\`

USER PREFERENCE:
${preference}

Analyze both versions and provide the resolved code that:
1. Follows the user's stated preference for how to handle the merge
2. Preserves the intended functionality from both versions according to the preference
3. Resolves any logical conflicts
4. Maintains consistent style and formatting
5. Does not include conflict markers

ONLY RETURN THE RESOLVED CODE ITSELF, NO EXPLANATION OR ADDITIONAL TEXT.`;

        try {
            const response = await this.openai.chat.completions.create({
                model: "gpt-4",
                messages: [
                    { role: "system", content: "You are a code merge conflict resolution assistant. Your task is to analyze Git merge conflicts and suggest the best resolution. Only provide the resolved code without explanation or conflict markers." },
                    { role: "user", content: promptText },
                ]
            });

            const resolution = response.choices[0]?.message?.content?.trim() || "No resolution provided";
            
            // Clean up any remaining markdown code blocks if the AI included them
            return resolution.replace(/```[\w]*\n|```$/g, '').trim();
        } catch (error) {
            console.error('Error fetching AI resolution with preference:', error);
            throw error;
        }
    }

    /**
     * Makes a call to the AI service to get a resolution for the conflict.
     */
    private async callAI(prompt: string): Promise<string> {
        try {
            // The conflict object is already properly parsed in the aiResolve handler
            // We don't need to parse the prompt text again
            const conflict = `<<<<<<< HEAD
${prompt.split('Local version:\n')[1].split('\n\nRemote version:')[0].trim()}
=======
${prompt.split('Remote version:\n')[1].split('\n\nUser request:')[0].trim()}
>>>>>>> branch`;
            const preference = prompt.split('User request:')[1].trim();

            // Get AI resolution
            const resolution = await this.getAIResolutionWithPreference(conflict, preference);
            return resolution;
        } catch (error) {
            console.error('Error in AI resolution:', error);
            throw error;
        }
    }
}