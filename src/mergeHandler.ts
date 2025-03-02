import * as vscode from 'vscode';
import { OpenAI } from 'openai';

export class MergeConflictHandler {
    private openai: OpenAI | null = null;

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
            { 
                enableScripts: true,
                retainContextWhenHidden: true // Keep the webview state when hidden
            }
        );

        panel.webview.html = this.getWebviewContent(panel.webview);
        
        // Send the full file content and conflict positions
        panel.webview.postMessage({
            command: 'setContent',
            fullContent: text,
            conflicts: conflicts
        });

        // Handle visibility changes
        panel.onDidChangeViewState(e => {
            if (e.webviewPanel.visible) {
                // Re-render content when the panel becomes visible again
                panel.webview.postMessage({
                    command: 'refreshView'
                });
            }
        });

        panel.webview.onDidReceiveMessage(async message => {
            if (message.command === 'commitResolution') {
                await this.applyResolution(editor, message.resolvedCode);
            } else if (message.command === 'showError') {
                vscode.window.showErrorMessage(message.message);
            } else if (message.command === 'aiResolve') {
                try {
                    // Get all conflicts
                    const conflicts = message.conflicts;
                    if (!conflicts || conflicts.length === 0) {
                        panel.webview.postMessage({
                            command: 'aiResponse',
                            error: 'No conflicts found'
                        });
                        return;
                    }

                    // Process each conflict with the same user request
                    for (let i = 0; i < conflicts.length; i++) {
                        const conflict = conflicts[i];
                        const prompt = `Given a merge conflict between these two versions:

Local version:
${conflict.local}

Remote version:
${conflict.remote}

User request: ${message.prompt}

Please analyze both versions and provide a resolved version that best addresses the user's request. Return ONLY the resolved code, no explanations.`;

                        // Call the AI API
                        const resolution = await this.callAI(prompt);

                        // Send each resolution back to the webview with the current index
                        panel.webview.postMessage({
                            command: 'aiResponse',
                            resolution: resolution,
                            currentConflict: i
                        });
                    }
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

                    /* Fixed overlay for buttons that should not scroll */
                    #fixed-overlay {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        pointer-events: none; /* Allow clicks to pass through by default */
                        z-index: 2000; /* Above everything else */
                    }

                    /* SVG container for bridges */
                    .bridges-container {
                        position: fixed; /* Keep fixed positioning */
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        pointer-events: none; /* Allow clicks to pass through */
                        z-index: 50; /* Above content but below buttons */
                        overflow: visible; /* Allow bridges to extend beyond container */
                    }

                    /* Bridge path styling */
                    .bridge-path {
                        fill: none;
                        stroke: none; /* Remove stroke, we'll use fill instead */
                        opacity: 1; /* Match section opacity exactly */
                        transition: none; /* Remove transitions for exact matching */
                    }

                    /* Match colors exactly with the conflict sections */
                    .bridge-path.conflict.left {
                        fill: rgba(46, 160, 67, 0.1);
                    }

                    .bridge-path.conflict.right {
                        fill: rgba(248, 81, 73, 0.1);
                    }

                    .bridge-path.resolved.from-local {
                        fill: rgba(46, 160, 67, 0.1);
                    }

                    .bridge-path.resolved.from-remote {
                        fill: rgba(248, 81, 73, 0.1);
                    }

                    .bridge-path.highlighted {
                        filter: brightness(1.2);
                    }

                    .bridge-path.fading {
                        opacity: 0;
                        transition: opacity 0.5s;
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
                        gap: 0px; /* Remove gap as we'll use button columns instead */
                        /* Optional: padding around the container edges */
                        padding: 10px;
                        box-sizing: border-box;
                        position: relative; /* For positioning the between-panel buttons */
                        overflow: hidden; /* Hide overflow */
                    }
                    
                    /* Button columns between panels */
                    .button-column {
                        width: 30px; /* Width of the column between panels */
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        position: relative;
                        z-index: 100;
                        overflow: visible; /* Allow buttons to be visible */
                    }
                    
                    /* Main scrollable container with vertical scrollbar */
                    .scroll-container {
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        overflow-y: scroll;
                        overflow-x: hidden;
                        padding-bottom: 120px; /* Space for the fixed AI panel */
                    }
                    
                    /* Content wrapper that will be as tall as the tallest panel */
                    .scroll-content {
                        width: 100%;
                        height: 0; /* Will be set dynamically */
                    }

                    .panel {
                        /* Fix each panel to one-third of the container minus button columns */
                        width: calc(33% - 20px);
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
                        overflow: visible; /* Ensure buttons outside the container are visible */
                    }
                    
                    /* Make sure the conflict sections have proper positioning context */
                    .panel-content .code-container .conflict-section {
                        position: relative;
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
                        background-color: rgba(246, 248, 250, 0.1);
                    }
                    
                    /* Resolved content from local changes */
                    .conflict-resolved.from-local {
                        border-left: 2px solid #2ea043;
                    }
                    .conflict-resolved.from-local::before {
                        background-color: rgba(46, 160, 67, 0.1);
                    }
                    
                    /* Resolved content from remote changes */
                    .conflict-resolved.from-remote {
                        border-left: 2px solid #f85149;
                    }
                    .conflict-resolved.from-remote::before {
                        background-color: rgba(248, 81, 73, 0.1);
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
                        width: 24px;
                        height: 24px;
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
                        position: fixed; /* Use fixed positioning to keep buttons in place */
                        z-index: 1000; /* Ensure buttons are above everything */
                        left: 3px; /* Position in the middle of the button column */
                    }

                    .arrow-button:hover {
                        transform: scale(1.1);
                    }

                    .arrow-button.left {
                        background: #2ea043;
                    }

                    .arrow-button.right {
                        background: #f85149;
                    }

                    .arrow-button.clear {
                        background: #6e7681;
                    }
                    
                    /* Individual clear button for each resolved section */
                    .clear-section-button {
                        width: 18px;
                        height: 18px;
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
                        position: fixed; /* Keep fixed positioning */
                        z-index: 2001; /* Above the fixed overlay */
                        opacity: 0.8; /* Slightly more visible */
                        pointer-events: auto; /* Ensure it can be clicked */
                    }
                    
                    .clear-section-button:hover {
                        transform: scale(1.1);
                        opacity: 1;
                    }
                    
                    /* Button containers for proper positioning */
                    .button-container {
                        position: absolute;
                        width: 30px;
                        z-index: 100;
                    }
                    
                    .left-button-container {
                        right: 0;
                    }
                    
                    .right-button-container {
                        left: 0;
                    }
                    
                    .clear-button-container {
                        position: sticky;
                        left: 0;
                        top: 0;
                        z-index: 100;
                        width: 30px;
                        height: 30px;
                        pointer-events: auto;
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

                    /* AI Panel styles */
                    .ai-panel {
                        position: fixed;
                        bottom: 0;
                        left: 0;
                        right: 0;
                        background: var(--vscode-editor-background);
                        border-top: 1px solid var(--vscode-panel-border);
                        padding: 20px;
                        display: flex;
                        flex-direction: column;
                        gap: 10px;
                        z-index: 3000;
                        box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.2);
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
                </style>
            </head>
            <body>
                <div id="fixed-overlay"></div>
                <div class="scroll-container" id="main-scroll">
                    <div class="scroll-content" id="scroll-content">
                        <!-- SVG container for bridges -->
                        <svg class="bridges-container" id="bridges-svg"></svg>
                        <div class="panels-container">
                            <div class="panel">
                                <div class="panel-header">Local Changes</div>
                                <div id="local-content" class="panel-content"></div>
                            </div>
                            <div class="button-column" id="left-buttons-column"></div>
                            <div class="panel">
                                <div class="panel-header">Resolved Code</div>
                                <div id="resolved-content" class="panel-content"></div>
                            </div>
                            <div class="button-column" id="right-buttons-column"></div>
                            <div class="panel">
                                <div class="panel-header">Remote Changes</div>
                                <div id="remote-content" class="panel-content"></div>
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
                                const leftButtonsColumn = document.getElementById('left-buttons-column');
                                const rightButtonsColumn = document.getElementById('right-buttons-column');
                        
                        localContent.innerHTML = '';
                        resolvedContent.innerHTML = '';
                        remoteContent.innerHTML = '';
                                leftButtonsColumn.innerHTML = '';
                                rightButtonsColumn.innerHTML = '';

                                // Clear existing bridges
                                document.getElementById('bridges-svg').innerHTML = '';

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
                                    clearSectionButton.id = \`clear-button-\${index}\`;
                            clearSectionButton.textContent = 'X';
                            clearSectionButton.title = 'Clear this section';
                                    clearSectionButton.style.pointerEvents = 'auto'; // Make sure it can be clicked
                            clearSectionButton.onclick = (e) => {
                                e.stopPropagation(); // Prevent triggering section click
                                window.clearResolvedSection(index);
                            };
                                    
                                    // Append to the fixed overlay instead of document body
                                    document.getElementById('fixed-overlay').appendChild(clearSectionButton);
                                    
                                    // Store the initial position of the section for the button
                                    resolvedSection.dataset.initialRight = '0';
                                    resolvedSection.dataset.initialTop = '0';
                                    
                                    // Position the button initially with a slightly longer delay to ensure section is fully rendered
                                    setTimeout(() => {
                                        positionClearButtonFixed(index);
                                    }, 100);

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

                                    // Append sections to their respective panels
                                    localCodeContainer.appendChild(localSection);
                                    remoteCodeContainer.appendChild(remoteSection);
                                    resolvedCodeContainer.appendChild(resolvedSection);

                            // Create arrow buttons for this conflict
                                    // Left arrow (local to resolved) - placed in the left button column
                            const leftArrow = document.createElement('button');
                            leftArrow.className = 'arrow-button left';
                            leftArrow.textContent = '→';
                            leftArrow.title = 'Accept local changes';
                            leftArrow.onclick = () => window.acceptChange(index, 'local');
                                    leftArrow.dataset.conflictIndex = index.toString();

                                    // Right arrow (remote to resolved) - placed in the right button column
                            const rightArrow = document.createElement('button');
                            rightArrow.className = 'arrow-button right';
                            rightArrow.textContent = '←';
                            rightArrow.title = 'Accept remote changes';
                            rightArrow.onclick = () => window.acceptChange(index, 'remote');
                                    rightArrow.dataset.conflictIndex = index.toString();

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

                                    // Add hover effects for highlighting bridges
                                    localSection.addEventListener('mouseenter', () => {
                                        highlightBridges(index);
                                    });
                                    localSection.addEventListener('mouseleave', () => {
                                        unhighlightBridges();
                                    });
                                    
                                    remoteSection.addEventListener('mouseenter', () => {
                                        highlightBridges(index);
                                    });
                                    remoteSection.addEventListener('mouseleave', () => {
                                        unhighlightBridges();
                                    });
                                    
                                    resolvedSection.addEventListener('mouseenter', () => {
                                        highlightBridges(index);
                                    });
                                    resolvedSection.addEventListener('mouseleave', () => {
                                        unhighlightBridges();
                                    });

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

                                // After all content is rendered, draw the bridges
                                setTimeout(() => {
                                    drawBridges();
                                }, 200);
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
                                
                                // Make sure buttons stay in place after accepting changes
                                setTimeout(() => {
                                    const localSection = document.querySelector(\`#local-content .conflict-section[data-conflict-index="\${index}"]\`);
                                    const remoteSection = document.querySelector(\`#remote-content .conflict-section[data-conflict-index="\${index}"]\`);
                                    
                                    if (localSection) {
                                        const rect = localSection.getBoundingClientRect();
                                        const leftArrow = document.getElementById(\`left-arrow-\${index}\`);
                                        if (leftArrow) {
                                            leftArrow.style.top = (rect.top + rect.height/2) + 'px';
                                        }
                                    }
                                    
                                    if (remoteSection) {
                                        const rect = remoteSection.getBoundingClientRect();
                                        const rightArrow = document.getElementById(\`right-arrow-\${index}\`);
                                        if (rightArrow) {
                                            rightArrow.style.top = (rect.top + rect.height/2) + 'px';
                                        }
                                    }
                                    
                                    // Update bridges after content changes
                                    updateBridges(index, source);
                                }, 10);
                    }

                    function clearResolvedSection(index) {
                                const resolvedSection = document.getElementById('resolved-section-' + index);
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
                                
                                // Reset bridges to conflict state
                                resetBridges(index);
                                
                                // Reposition the clear button
                                setTimeout(() => {
                                    positionClearButtonFixed(index);
                                }, 50);
                            }

                            // Bridge visualization functions
                            function drawBridges() {
                                const svgContainer = document.getElementById('bridges-svg');
                                svgContainer.innerHTML = ''; // Clear existing bridges
                                
                                // Get all conflict sections from local panel
                                const localSections = document.querySelectorAll('#local-content .conflict-section');
                                
                                // Draw bridges for each conflict
                                for (let i = 0; i < localSections.length; i++) {
                                    const localSection = localSections[i];
                                    const index = localSection.dataset.conflictIndex;
                                    
                                    // Find corresponding sections in other panels
                                    const resolvedSection = document.getElementById('resolved-content')
                                        .querySelector('.conflict-section[data-conflict-index="' + index + '"]');
                                    const remoteSection = document.getElementById('remote-content')
                                        .querySelector('.conflict-section[data-conflict-index="' + index + '"]');
                                    
                                    if (!resolvedSection || !remoteSection) continue;
                                    
                                    // Get bounding rectangles relative to the viewport (not the document)
                                    const localRect = localSection.getBoundingClientRect();
                                    const resolvedRect = resolvedSection.getBoundingClientRect();
                                    const remoteRect = remoteSection.getBoundingClientRect();
                                    
                                    // Get horizontal scroll positions of each panel
                                    const localScroll = document.getElementById('local-content').scrollLeft;
                                    const resolvedScroll = document.getElementById('resolved-content').scrollLeft;
                                    const remoteScroll = document.getElementById('remote-content').scrollLeft;
                                    
                                    // Create left bridge (local to resolved) using path for curved edges
                                    const leftBridge = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                                    leftBridge.classList.add('bridge-path', 'conflict', 'left');
                                    leftBridge.setAttribute('data-conflict-index', index);
                                    leftBridge.setAttribute('data-side', 'left');
                                    
                                    // Create right bridge (resolved to remote) using path for curved edges
                                    const rightBridge = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                                    rightBridge.classList.add('bridge-path', 'conflict', 'right');
                                    rightBridge.setAttribute('data-conflict-index', index);
                                    rightBridge.setAttribute('data-side', 'right');
                                    
                                    // Calculate points for the bridges - use viewport coordinates directly
                                    // Adjust for horizontal scroll position
                                    const leftTop = localRect.top;
                                    const leftBottom = localRect.bottom;
                                    const resolvedTop = resolvedRect.top;
                                    const resolvedBottom = resolvedRect.bottom;
                                    const remoteTop = remoteRect.top;
                                    const remoteBottom = remoteRect.bottom;
                                    
                                    // Adjust right edge positions based on horizontal scroll
                                    const localRight = localRect.right + localScroll;
                                    const resolvedLeft = resolvedRect.left + resolvedScroll;
                                    const resolvedRight = resolvedRect.right + resolvedScroll;
                                    const remoteLeft = remoteRect.left + remoteScroll;
                                    
                                    // Calculate control points for bezier curves (25% of the distance between panels)
                                    const leftControlX = localRight + (resolvedLeft - localRight) * 0.25;
                                    const rightControlX = resolvedRight + (remoteLeft - resolvedRight) * 0.25;
                                    
                                    // Set path data with bezier curves for smooth edges
                                    // Adjust the path to perfectly align with the section edges
                                    // M = move to, C = cubic bezier curve
                                    leftBridge.setAttribute('d', 
                                        'M ' + localRight + ' ' + leftTop + ' ' +
                                        'C ' + leftControlX + ' ' + leftTop + ', ' + (resolvedLeft - 0) + ' ' + resolvedTop + ', ' + resolvedLeft + ' ' + resolvedTop + ' ' +
                                        'L ' + resolvedLeft + ' ' + resolvedBottom + ' ' +
                                        'C ' + (resolvedLeft - 0) + ' ' + resolvedBottom + ', ' + leftControlX + ' ' + leftBottom + ', ' + localRight + ' ' + leftBottom + ' ' +
                                        'Z'
                                    );
                                    
                                    rightBridge.setAttribute('d', 
                                        'M ' + resolvedRight + ' ' + resolvedTop + ' ' +
                                        'C ' + (resolvedRight + 0) + ' ' + resolvedTop + ', ' + rightControlX + ' ' + remoteTop + ', ' + remoteLeft + ' ' + remoteTop + ' ' +
                                        'L ' + remoteLeft + ' ' + remoteBottom + ' ' +
                                        'C ' + rightControlX + ' ' + remoteBottom + ', ' + (resolvedRight + 0) + ' ' + resolvedBottom + ', ' + resolvedRight + ' ' + resolvedBottom + ' ' +
                                        'Z'
                                    );
                                    
                                    // Check if this conflict is resolved
                                    const resolvedLines = resolvedSection.querySelectorAll('.conflict-resolved');
                                    const isResolved = Array.from(resolvedLines).some(function(line) {
                                        return line.classList.contains('from-local') || line.classList.contains('from-remote');
                                    });
                                    
                                    if (isResolved) {
                                        // Check which side was accepted
                                        const fromLocal = Array.from(resolvedLines).some(function(line) {
                                            return line.classList.contains('from-local');
                                        });
                                        
                                        if (fromLocal) {
                                            leftBridge.classList.remove('conflict');
                                            leftBridge.classList.add('resolved', 'from-local');
                                            rightBridge.classList.add('fading');
                                        } else {
                                            rightBridge.classList.remove('conflict');
                                            rightBridge.classList.add('resolved', 'from-remote');
                                            leftBridge.classList.add('fading');
                                        }
                                    }
                                    
                                    // Add bridges to SVG
                                    svgContainer.appendChild(leftBridge);
                                    svgContainer.appendChild(rightBridge);
                                }
                            }
                            
                            function updateBridges(index, source) {
                                // Update bridge visualization when a conflict is resolved
                                const leftBridge = document.querySelector('.bridge-path[data-conflict-index="' + index + '"][data-side="left"]');
                                const rightBridge = document.querySelector('.bridge-path[data-conflict-index="' + index + '"][data-side="right"]');
                                
                                if (leftBridge && rightBridge) {
                                    if (source === 'local') {
                                        // Local was accepted
                                        leftBridge.classList.remove('conflict');
                                        leftBridge.classList.add('resolved', 'from-local');
                                        rightBridge.classList.add('fading');
                                    } else {
                                        // Remote was accepted
                                        rightBridge.classList.remove('conflict');
                                        rightBridge.classList.add('resolved', 'from-remote');
                                        leftBridge.classList.add('fading');
                                    }
                                } else {
                                    // If bridges weren't found, redraw them
                                    setTimeout(drawBridges, 50);
                                }
                            }
                            
                            function resetBridges(index) {
                                // Reset bridges to conflict state when a resolved section is cleared
                                const leftBridge = document.querySelector('.bridge-path[data-conflict-index="' + index + '"][data-side="left"]');
                                const rightBridge = document.querySelector('.bridge-path[data-conflict-index="' + index + '"][data-side="right"]');
                                
                                if (leftBridge && rightBridge) {
                                    leftBridge.classList.remove('resolved', 'from-local', 'fading');
                                    rightBridge.classList.remove('resolved', 'from-remote', 'fading');
                                    leftBridge.classList.add('conflict');
                                    rightBridge.classList.add('conflict');
                                } else {
                                    // If bridges weren't found, redraw them
                                    setTimeout(drawBridges, 50);
                                }
                            }
                            
                            function highlightBridges(index) {
                                // Highlight bridges on hover
                                const bridges = document.querySelectorAll('.bridge-path[data-conflict-index="' + index + '"]');
                                bridges.forEach(bridge => {
                                    if (!bridge.classList.contains('fading')) {
                                        bridge.classList.add('highlighted');
                                    }
                                });
                            }
                            
                            function unhighlightBridges() {
                                // Remove highlight from all bridges
                                document.querySelectorAll('.bridge-path.highlighted').forEach(bridge => {
                                    bridge.classList.remove('highlighted');
                                });
                            }

                    // Improved scroll synchronization for all panels
                    function setupScrollSync() {
                        const panels = document.querySelectorAll('.panel-content');
                        const mainScroll = document.getElementById('main-scroll');
                        const scrollContent = document.getElementById('scroll-content');
                                const leftButtonsColumn = document.getElementById('left-buttons-column');
                                const rightButtonsColumn = document.getElementById('right-buttons-column');
                                
                                // Function to position clear buttons
                                function positionClearButtonFixed(index) {
                                    const resolvedSection = document.getElementById('resolved-section-' + index);
                                    const clearButton = document.getElementById('clear-button-' + index);
                                    const resolvedPanel = document.getElementById('resolved-content');
                                    
                                    if (resolvedSection && clearButton && resolvedPanel) {
                                        const rect = resolvedSection.getBoundingClientRect();
                                        const panelRect = resolvedPanel.getBoundingClientRect();
                                        
                                        // Position at the top right corner of the section relative to the panel
                                        // This ensures the button stays fixed at the right edge of the panel regardless of horizontal scrolling
                                        clearButton.style.position = 'fixed';
                                        
                                        // Use the right edge of the panel instead of the section's right edge
                                        // This keeps the button at the right edge of the panel
                                        clearButton.style.left = (panelRect.right - 23) + 'px';
                                        clearButton.style.top = (rect.top + 5) + 'px';
                                        
                                        // Store the current position for reference
                                        resolvedSection.dataset.initialRight = panelRect.right;
                                        resolvedSection.dataset.initialTop = rect.top;
                                    }
                                }
                                
                                // Original function kept for compatibility
                                function positionClearButton(index) {
                                    positionClearButtonFixed(index);
                                }
                                
                                // Add specific listener for the resolved panel's horizontal scroll
                                const resolvedPanel = document.getElementById('resolved-content');
                                if (resolvedPanel) {
                                    resolvedPanel.addEventListener('scroll', () => {
                                        // Update all clear buttons immediately on horizontal scroll of resolved panel
                                        document.querySelectorAll('.conflict-section').forEach(section => {
                                            const index = section.dataset.conflictIndex;
                                            if (index) {
                                                // Use requestAnimationFrame for smoother updates
                                                requestAnimationFrame(() => {
                                                    positionClearButtonFixed(index);
                                                });
                                            }
                                        });
                                        
                                        // Also redraw bridges when horizontally scrolling
                                        requestAnimationFrame(drawBridges);
                                    }, { passive: true });
                                }
                        
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
                                    
                                    // Redraw bridges on scroll to ensure they stay in the correct position
                                    requestAnimationFrame(drawBridges);
                                    
                                    // Update all clear buttons
                                    document.querySelectorAll('.conflict-section').forEach(section => {
                                        const index = section.dataset.conflictIndex;
                                        if (index) {
                                            positionClearButton(index);
                                        }
                                    });
                        }
                        
                        // Listen for scroll events on the main scroll container
                        mainScroll.addEventListener('scroll', syncPanelsToScroll, { passive: true });
                                
                                // Listen for horizontal scroll events on each panel
                                panels.forEach(panel => {
                                    panel.addEventListener('scroll', () => {
                                        // Redraw bridges when any panel is horizontally scrolled
                                        requestAnimationFrame(drawBridges);
                                        
                                        // Update all clear buttons immediately without delay
                                        document.querySelectorAll('.conflict-section').forEach(section => {
                                            const index = section.dataset.conflictIndex;
                                            if (index) {
                                                positionClearButtonFixed(index);
                                            }
                                        });
                                    }, { passive: true });
                                });
                        
                        // Update the scroll height when content changes
                                const observer = new MutationObserver(() => {
                                    updateScrollHeight();
                                    // Only position buttons initially, not on every content change
                                    if (!window.buttonsPositioned) {
                                        positionButtons();
                                        window.buttonsPositioned = true;
                                    }
                                    // Redraw bridges when content changes
                                    setTimeout(drawBridges, 100);
                                    
                                    // Update clear button positions
                                    document.querySelectorAll('.conflict-section').forEach(section => {
                                        const index = section.dataset.conflictIndex;
                                        if (index) {
                                            setTimeout(() => {
                                                positionClearButtonFixed(index);
                                            }, 100);
                                        }
                                    });
                                });
                                
                        panels.forEach(panel => {
                            observer.observe(panel, { childList: true, subtree: true });
                        });
                        
                                // Position buttons correctly based on conflict sections
                                function positionButtons() {
                                    // Clear existing buttons
                                    document.querySelectorAll('.arrow-button').forEach(btn => btn.remove());
                                    leftButtonsColumn.innerHTML = '';
                                    rightButtonsColumn.innerHTML = '';
                                    
                                    // Get all conflict sections
                                    const localSections = document.querySelectorAll('#local-content .conflict-section');
                                    const remoteSections = document.querySelectorAll('#remote-content .conflict-section');
                                    
                                    // Calculate column positions
                                    const leftColumnRect = leftButtonsColumn.getBoundingClientRect();
                                    const rightColumnRect = rightButtonsColumn.getBoundingClientRect();
                                    
                                    // Position buttons for each conflict section
                                    localSections.forEach(section => {
                                        const index = section.dataset.conflictIndex;
                                        const rect = section.getBoundingClientRect();
                                        
                                        // Create left arrow button with fixed positioning
                                        const leftArrow = document.createElement('button');
                                        leftArrow.className = 'arrow-button left';
                                        leftArrow.id = \`left-arrow-\${index}\`;
                                        leftArrow.textContent = '→';
                                        leftArrow.title = 'Accept local changes';
                                        
                                        // Use a wrapper function to preserve the index value
                                        leftArrow.onclick = (function(idx) {
                                            return function() {
                                                window.acceptChange(idx, 'local');
                                            };
                                        })(index);
                                        
                                        // Position relative to viewport
                                        leftArrow.style.left = (leftColumnRect.left + leftColumnRect.width/2 - 12) + 'px';
                                        leftArrow.style.top = (rect.top + rect.height/2) + 'px';
                                        leftArrow.style.transform = 'translateY(-50%)';
                                        
                                        // Append to document body
                                        document.body.appendChild(leftArrow);
                                    });
                                    
                                    remoteSections.forEach(section => {
                                        const index = section.dataset.conflictIndex;
                                        const rect = section.getBoundingClientRect();
                                        
                                        // Create right arrow button with fixed positioning
                                        const rightArrow = document.createElement('button');
                                        rightArrow.className = 'arrow-button right';
                                        rightArrow.id = \`right-arrow-\${index}\`;
                                        rightArrow.textContent = '←';
                                        rightArrow.title = 'Accept remote changes';
                                        
                                        // Use a wrapper function to preserve the index value
                                        rightArrow.onclick = (function(idx) {
                                            return function() {
                                                window.acceptChange(idx, 'remote');
                                            };
                                        })(index);
                                        
                                        // Position relative to viewport
                                        rightArrow.style.left = (rightColumnRect.left + rightColumnRect.width/2 - 12) + 'px';
                                        rightArrow.style.top = (rect.top + rect.height/2) + 'px';
                                        rightArrow.style.transform = 'translateY(-50%)';
                                        
                                        // Append to document body
                                        document.body.appendChild(rightArrow);
                                    });
                                }
                                
                                // Initial updates
                                setTimeout(() => {
                                    updateScrollHeight();
                                    positionButtons();
                                    window.buttonsPositioned = true;
                                    // Draw bridges after everything is set up
                                    drawBridges();
                                }, 100);
                                
                                // Update on window resize
                                window.addEventListener('resize', () => {
                                    updateScrollHeight();
                                    // Remove existing buttons and reposition them on resize
                                    document.querySelectorAll('.arrow-button').forEach(btn => btn.remove());
                                    window.buttonsPositioned = false;
                                    positionButtons();
                                    // Redraw bridges on resize
                                    setTimeout(drawBridges, 100);
                                    
                                    // Update clear button positions with a slight delay to ensure panels are properly resized
                                    setTimeout(() => {
                                        document.querySelectorAll('.conflict-section').forEach(section => {
                                            const index = section.dataset.conflictIndex;
                                            if (index) {
                                                positionClearButtonFixed(index);
                                            }
                                        });
                                    }, 200);
                                });
                                
                                // Update button positions on scroll
                                mainScroll.addEventListener('scroll', () => {
                                    // Update fixed button positions based on their sections
                                    const localSections = document.querySelectorAll('#local-content .conflict-section');
                                    const remoteSections = document.querySelectorAll('#remote-content .conflict-section');
                                    
                                    localSections.forEach(section => {
                                        const index = section.dataset.conflictIndex;
                                        const rect = section.getBoundingClientRect();
                                        const leftArrow = document.getElementById(\`left-arrow-\${index}\`);
                                        if (leftArrow) {
                                            leftArrow.style.top = (rect.top + rect.height/2) + 'px';
                                        }
                                    });
                                    
                                    remoteSections.forEach(section => {
                                        const index = section.dataset.conflictIndex;
                                        const rect = section.getBoundingClientRect();
                                        const rightArrow = document.getElementById(\`right-arrow-\${index}\`);
                                        if (rightArrow) {
                                            rightArrow.style.top = (rect.top + rect.height/2) + 'px';
                                        }
                                    });
                                }, { passive: true });
                    }
                    
                    // Set up scroll synchronization after content is rendered
                    window.addEventListener('message', event => {
                        const message = event.data;
                        if (message.command === 'setContent') {
                            conflicts = message.conflicts;
                            fileContent = message.fullContent;
                            renderContent();
                            
                            // Set up scroll sync after content is rendered
                                    setTimeout(() => {
                                        setupScrollSync();
                                        // Ensure bridges are drawn after everything is rendered
                                        setTimeout(drawBridges, 300);
                                        // Draw bridges again after a longer delay to ensure all elements are properly positioned
                                        setTimeout(drawBridges, 1000);
                                    }, 100);
                                } else if (message.command === 'refreshView') {
                                    // Re-render the view when the panel becomes visible again
                                    if (conflicts.length > 0 && fileContent) {
                                        // Clear any existing state
                                        document.querySelectorAll('.arrow-button').forEach(btn => btn.remove());
                                        window.buttonsPositioned = false;
                                        
                                        // Re-render content
                                        renderContent();
                                        
                                        // Re-setup scroll sync
                                        setTimeout(() => {
                                            setupScrollSync();
                                            // Make sure bridges are drawn with a longer delay
                                            setTimeout(drawBridges, 300);
                                            // Draw bridges again after a longer delay
                                            setTimeout(drawBridges, 1000);
                                        }, 100);
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
                                    
                                    // Apply AI's resolution to the specified conflict
                                    const resolvedSection = document.getElementById(\`resolved-section-\${message.currentConflict}\`);
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
                                        
                                        aiStatus.textContent = \`AI resolution applied to conflict \${message.currentConflict + 1} of \${conflicts.length}\`;
                                    }
                                }
                            });

                            // Make functions available to the window object so they can be called from HTML
                            window.acceptChange = acceptChange;
                            window.clearResolvedSection = clearResolvedSection;
                </script>
                    </div>
                </div>
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

    /**
     * Makes a call to the AI service to get a resolution for the conflict.
     */
    private async callAI(prompt: string): Promise<string> {
        try {
            if (!this.openai) {
                throw new Error('OpenAI API key not configured. Please set it in the extension settings.');
            }

            const response = await this.openai.chat.completions.create({
                model: "gpt-4",
                messages: [
                    { role: "system", content: "You are a code merge conflict resolution assistant. Your task is to analyze Git merge conflicts and suggest the best resolution. Only provide the resolved code without explanation or conflict markers." },
                    { role: "user", content: prompt },
                ]
            });

            const resolution = response.choices[0]?.message?.content?.trim() || "No resolution provided";
            
            // Clean up any remaining markdown code blocks if the AI included them
            return resolution.replace(/```[\w]*\n|```$/g, '').trim();
        } catch (error) {
            console.error('Error in AI resolution:', error);
            throw error;
        }
    }
}