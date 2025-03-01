// extension.js

const vscode = require('vscode');

/**
 * Activate the extension
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log('Merge Conflict Resolution Extension is now active');

  // Register the command to show the improved merge conflict resolution UI
  let disposable = vscode.commands.registerCommand(
    'mergeConflictResolution.showMergeUI',
    showImprovedMergeUI
  );

  context.subscriptions.push(disposable);
}

/**
 * Display improved merge conflict resolution UI
 */
async function showImprovedMergeUI() {
  // Get the active text editor
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor found');
    return;
  }

  // Check if the document has merge conflicts
  const document = editor.document;
  const text = document.getText();
  if (!hasMergeConflicts(text)) {
    vscode.window.showInformationMessage('No merge conflicts found in the current file');
    return;
  }

  // Create and show webview panel with improved UI
  const panel = vscode.window.createWebviewPanel(
    'mergeConflictResolution',
    'Merge Conflict Resolution',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  // Extract conflict information from the document
  const conflicts = extractMergeConflicts(text);
  
  // Set the webview's HTML content with the improved UI
  panel.webview.html = getWebviewContent(conflicts, document.fileName);
  
  // Handle messages from the webview
  panel.webview.onDidReceiveMessage(
    message => {
      switch (message.command) {
        case 'acceptOriginal':
          resolveWithOriginal(message.conflictIndex);
          return;
        case 'acceptIncoming':
          resolveWithIncoming(message.conflictIndex);
          return;
        case 'acceptCurrent':
          resolveWithCurrent(message.conflictIndex);
          return;
        case 'acceptCustom':
          resolveWithCustom(message.conflictIndex, message.customText);
          return;
        case 'close':
          panel.dispose();
          return;
      }
    },
    undefined,
    context.subscriptions
  );
}

/**
 * Check if the document text contains merge conflicts
 * @param {string} text - Document text
 * @returns {boolean} True if merge conflicts are found
 */
function hasMergeConflicts(text) {
  return text.includes('<<<<<<<') && text.includes('=======') && text.includes('>>>>>>>');
}

/**
 * Extract merge conflict sections from the document
 * @param {string} text - Document text
 * @returns {Array} Conflict sections with their content
 */
function extractMergeConflicts(text) {
  const conflicts = [];
  let startIndex = -1;
  let separatorIndex = -1;
  let endIndex = -1;
  let commonAncestorStart = -1;
  let commonAncestorEnd = -1;
  
  const lines = text.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.startsWith('<<<<<<<')) {
      startIndex = i;
    } else if (line.startsWith('|||||||')) {
      commonAncestorStart = i;
    } else if (line.startsWith('=======') && startIndex !== -1) {
      separatorIndex = i;
      if (commonAncestorStart !== -1) {
        commonAncestorEnd = i;
      }
    } else if (line.startsWith('>>>>>>>') && separatorIndex !== -1) {
      endIndex = i;
      
      // Extract conflict sections
      const current = lines.slice(startIndex + 1, commonAncestorStart !== -1 ? commonAncestorStart : separatorIndex).join('\n');
      const original = commonAncestorStart !== -1 ? 
        lines.slice(commonAncestorStart + 1, commonAncestorEnd).join('\n') : 
        '';
      const incoming = lines.slice(separatorIndex + 1, endIndex).join('\n');
      
      // Create context for the conflict (lines before and after)
      const contextBefore = lines.slice(Math.max(0, startIndex - 3), startIndex).join('\n');
      const contextAfter = lines.slice(endIndex + 1, Math.min(lines.length, endIndex + 4)).join('\n');
      
      // Get the conflict marker information
      const currentMarker = lines[startIndex];
      const incomingMarker = lines[endIndex];
      
      conflicts.push({
        index: conflicts.length,
        current,
        original,
        incoming,
        contextBefore,
        contextAfter,
        startLine: startIndex,
        endLine: endIndex,
        currentMarker,
        incomingMarker,
        hasCommonAncestor: commonAncestorStart !== -1
      });
      
      // Reset markers
      startIndex = -1;
      separatorIndex = -1;
      endIndex = -1;
      commonAncestorStart = -1;
      commonAncestorEnd = -1;
    }
  }
  
  return conflicts;
}

/**
 * Generate the HTML content for the webview
 * @param {Array} conflicts - Extracted conflict information
 * @param {string} fileName - Name of the file being edited
 * @returns {string} HTML content
 */
function getWebviewContent(conflicts, fileName) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Merge Conflict Resolution</title>
  <style>
    :root {
      --editor-bg: #1e1e1e;
      --editor-fg: #d4d4d4;
      --line-number-fg: #858585;
      --line-number-bg: #1e1e1e;
      --gutter-bg: #1e1e1e;
      --header-bg: #1e1e1e;
      --header-fg: #d4d4d4;
      --added-bg: rgba(0, 255, 0, 0.1);
      --deleted-bg: rgba(255, 0, 0, 0.1);
      --modified-bg: rgba(0, 255, 255, 0.1);
      --conflict-current-bg: rgba(83, 83, 181, 0.2);
      --conflict-incoming-bg: rgba(64, 181, 64, 0.2);
      --conflict-original-bg: rgba(181, 64, 64, 0.2);
      --border-color: #464646;
      --button-bg: #2d2d2d;
      --button-hover-bg: #3d3d3d;
      --button-active-bg: #0e639c;
      --scrollbar-thumb: #424242;
      --scrollbar-track: #1e1e1e;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      margin: 0;
      padding: 0;
      background-color: var(--editor-bg);
      color: var(--editor-fg);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      height: 100vh;
    }
    
    .header {
      background-color: var(--header-bg);
      color: var(--header-fg);
      padding: 5px 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border-color);
      font-size: 12px;
      height: 30px;
    }
    
    .title {
      font-weight: 500;
    }
    
    .file-name {
      color: #9cdcfe;
      margin-left: 8px;
    }
    
    .actions {
      display: flex;
      gap: 8px;
    }
    
    .button {
      background-color: var(--button-bg);
      color: var(--editor-fg);
      border: none;
      padding: 4px 8px;
      font-size: 12px;
      cursor: pointer;
      border-radius: 2px;
    }
    
    .button:hover {
      background-color: var(--button-hover-bg);
    }
    
    .button.active {
      background-color: var(--button-active-bg);
    }
    
    .container {
      display: flex;
      flex: 1;
      overflow: hidden;
    }
    
    .editor-container {
      display: flex;
      flex: 1;
      flex-direction: column;
      border-right: 1px solid var(--border-color);
      overflow: hidden;
    }
    
    .editor-container:last-child {
      border-right: none;
    }
    
    .editor-header {
      padding: 4px 10px;
      font-size: 12px;
      background-color: var(--header-bg);
      border-bottom: 1px solid var(--border-color);
      height: 20px;
      display: flex;
      align-items: center;
    }
    
    .editor {
      flex: 1;
      overflow: auto;
      position: relative;
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 12px;
      line-height: 18px;
    }
    
    .editor::-webkit-scrollbar {
      width: 10px;
      height: 10px;
    }
    
    .editor::-webkit-scrollbar-thumb {
      background: var(--scrollbar-thumb);
      border-radius: 5px;
    }
    
    .editor::-webkit-scrollbar-track {
      background: var(--scrollbar-track);
    }
    
    .code-container {
      display: flex;
      position: relative;
      min-height: 100%;
    }
    
    .line-numbers {
      user-select: none;
      text-align: right;
      padding: 0 4px 0 10px;
      color: var(--line-number-fg);
      background-color: var(--line-number-bg);
      white-space: pre;
    }
    
    .code {
      padding-left: 8px;
      white-space: pre;
      position: relative;
      min-width: calc(100% - 50px);
    }
    
    .line {
      height: 18px;
    }
    
    .line.added {
      background-color: var(--added-bg);
    }
    
    .line.deleted {
      background-color: var(--deleted-bg);
    }
    
    .line.modified {
      background-color: var(--modified-bg);
    }
    
    .line.current {
      background-color: var(--conflict-current-bg);
    }
    
    .line.original {
      background-color: var(--conflict-original-bg);
    }
    
    .line.incoming {
      background-color: var(--conflict-incoming-bg);
    }
    
    .navigation {
      padding: 5px;
      display: flex;
      gap: 8px;
      justify-content: center;
      background-color: var(--header-bg);
      border-top: 1px solid var(--border-color);
    }
    
    .status-bar {
      font-size: 12px;
      padding: 2px 10px;
      background-color: var(--header-bg);
      border-top: 1px solid var(--border-color);
      display: flex;
      justify-content: space-between;
    }
    
    .conflict-info {
      color: #9cdcfe;
    }
    
    .conflict-selector {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .minimap {
      width: 60px;
      position: absolute;
      right: 0;
      top: 0;
      bottom: 0;
      background-color: var(--editor-bg);
      opacity: 0.7;
      overflow: hidden;
    }
    
    .minimap-content {
      transform: scale(0.2);
      transform-origin: top right;
      position: absolute;
      right: 0;
      top: 0;
      pointer-events: none;
    }
    
    .conflict-indicator {
      position: absolute;
      right: 0;
      width: 3px;
      background-color: #cc6633;
    }
    
    .gutter-marker {
      position: absolute;
      left: 0;
      width: 3px;
      height: 18px;
    }
    
    .gutter-marker.current {
      background-color: #569cd6;
    }
    
    .gutter-marker.incoming {
      background-color: #6a9955;
    }
    
    .gutter-marker.original {
      background-color: #ce9178;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">Merge Conflict Resolution <span class="file-name">${fileName}</span></div>
    <div class="actions">
      <button class="button" id="prev-conflict">Previous Conflict</button>
      <button class="button" id="next-conflict">Next Conflict</button>
      <button class="button" onclick="closeUI()">Close</button>
    </div>
  </div>
  
  <div class="container" id="editors-container">
    <div class="editor-container">
      <div class="editor-header">Original</div>
      <div class="editor" id="original-editor">
        <div class="code-container">
          <div class="line-numbers" id="original-line-numbers"></div>
          <div class="code" id="original-code"></div>
          <div class="minimap" id="original-minimap">
            <div class="minimap-content" id="original-minimap-content"></div>
          </div>
        </div>
      </div>
    </div>
    
    <div class="editor-container">
      <div class="editor-header">Current (HEAD)</div>
      <div class="editor" id="current-editor">
        <div class="code-container">
          <div class="line-numbers" id="current-line-numbers"></div>
          <div class="code" id="current-code"></div>
          <div class="minimap" id="current-minimap">
            <div class="minimap-content" id="current-minimap-content"></div>
          </div>
        </div>
      </div>
    </div>
    
    <div class="editor-container">
      <div class="editor-header">Incoming</div>
      <div class="editor" id="incoming-editor">
        <div class="code-container">
          <div class="line-numbers" id="incoming-line-numbers"></div>
          <div class="code" id="incoming-code"></div>
          <div class="minimap" id="incoming-minimap">
            <div class="minimap-content" id="incoming-minimap-content"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
  
  <div class="navigation">
    <button class="button" id="accept-original">Accept Original</button>
    <button class="button" id="accept-current">Accept Current (HEAD)</button>
    <button class="button" id="accept-incoming">Accept Incoming</button>
  </div>
  
  <div class="status-bar">
    <div class="conflict-selector">
      <label for="conflict-select">Conflict:</label>
      <select id="conflict-select" class="button"></select>
    </div>
    <div class="conflict-info" id="conflict-info"></div>
  </div>
  
  <script>
    // Store conflicts data
    const conflicts = ${JSON.stringify(conflicts)};
    let currentConflictIndex = 0;
    
    // Initialize the UI
    function initialize() {
      if (conflicts.length === 0) {
        document.getElementById('editors-container').innerHTML = '<div style="padding: 20px; text-align: center;">No merge conflicts found in this file.</div>';
        return;
      }
      
      // Populate conflict selector
      const selectElement = document.getElementById('conflict-select');
      conflicts.forEach((conflict, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = \`Conflict \${index + 1}\`;
        selectElement.appendChild(option);
      });
      
      // Set up event listeners
      selectElement.addEventListener('change', (e) => {
        currentConflictIndex = parseInt(e.target.value);
        showConflict(currentConflictIndex);
      });
      
      document.getElementById('prev-conflict').addEventListener('click', () => {
        if (currentConflictIndex > 0) {
          currentConflictIndex--;
          selectElement.value = currentConflictIndex;
          showConflict(currentConflictIndex);
        }
      });
      
      document.getElementById('next-conflict').addEventListener('click', () => {
        if (currentConflictIndex < conflicts.length - 1) {
          currentConflictIndex++;
          selectElement.value = currentConflictIndex;
          showConflict(currentConflictIndex);
        }
      });
      
      document.getElementById('accept-original').addEventListener('click', () => {
        acceptOriginal(currentConflictIndex);
      });
      
      document.getElementById('accept-current').addEventListener('click', () => {
        acceptCurrent(currentConflictIndex);
      });
      
      document.getElementById('accept-incoming').addEventListener('click', () => {
        acceptIncoming(currentConflictIndex);
      });
      
      // Synchronize scrolling between editors
      const editors = [
        document.getElementById('original-editor'),
        document.getElementById('current-editor'),
        document.getElementById('incoming-editor')
      ];
      
      editors.forEach(editor => {
        editor.addEventListener('scroll', () => {
          const scrollTop = editor.scrollTop;
          const scrollLeft = editor.scrollLeft;
          
          editors.forEach(otherEditor => {
            if (otherEditor !== editor) {
              otherEditor.scrollTop = scrollTop;
              otherEditor.scrollLeft = scrollLeft;
            }
          });
        });
      });
      
      // Show the first conflict
      showConflict(currentConflictIndex);
    }
    
    // Display a specific conflict
    function showConflict(index) {
      const conflict = conflicts[index];
      
      // Show conflict information
      document.getElementById('conflict-info').textContent = \`Line \${conflict.startLine + 1} to \${conflict.endLine + 1}\`;
      
      // Prepare code and line numbers for each editor
      renderEditor('original', conflict.hasCommonAncestor ? conflict.original : conflict.current, conflict.startLine);
      renderEditor('current', conflict.current, conflict.startLine);
      renderEditor('incoming', conflict.incoming, conflict.startLine);
      
      // Update editor styles to highlight conflicts
      highlightConflict(conflict);
      
      // Update conflict indicators in minimaps
      updateMinimaps();
    }
    
    // Render code in an editor
    function renderEditor(editorId, content, startLineNumber) {
      const codeElement = document.getElementById(\`\${editorId}-code\`);
      const lineNumbersElement = document.getElementById(\`\${editorId}-line-numbers\`);
      
      // Split content into lines
      const lines = content.split('\\n');
      
      // Clear previous content
      codeElement.innerHTML = '';
      lineNumbersElement.innerHTML = '';
      
      // Render each line
      lines.forEach((line, index) => {
        // Code line
        const lineElement = document.createElement('div');
        lineElement.className = 'line';
        lineElement.textContent = line;
        lineElement.setAttribute('data-line-number', startLineNumber + index + 1);
        codeElement.appendChild(lineElement);
        
        // Line number
        const lineNumberElement = document.createElement('div');
        lineNumberElement.className = 'line';
        lineNumberElement.textContent = (startLineNumber + index + 1).toString();
        lineNumbersElement.appendChild(lineNumberElement);
      });
      
      // Update minimap
      const minimapContentElement = document.getElementById(\`\${editorId}-minimap-content\`);
      minimapContentElement.innerHTML = codeElement.innerHTML;
    }
    
    // Highlight conflict lines in editors
    function highlightConflict(conflict) {
      // Add appropriate classes to highlight different sections
      const originalLines = document.querySelectorAll('#original-code .line');
      const currentLines = document.querySelectorAll('#current-code .line');
      const incomingLines = document.querySelectorAll('#incoming-code .line');
      
      originalLines.forEach(line => line.classList.add('original'));
      currentLines.forEach(line => line.classList.add('current'));
      incomingLines.forEach(line => line.classList.add('incoming'));
      
      // Add gutter markers
      addGutterMarkers('original', originalLines.length, 'original');
      addGutterMarkers('current', currentLines.length, 'current');
      addGutterMarkers('incoming', incomingLines.length, 'incoming');
    }
    
    // Add gutter markers to indicate conflict sections
    function addGutterMarkers(editorId, lineCount, markerClass) {
      const codeElement = document.getElementById(\`\${editorId}-code\`);
      
      for (let i = 0; i < lineCount; i++) {
        const marker = document.createElement('div');
        marker.className = \`gutter-marker \${markerClass}\`;
        marker.style.top = \`\${i * 18}px\`;
        codeElement.appendChild(marker);
      }
    }
    
    // Update minimaps with conflict indicators
    function updateMinimaps() {
      const editors = ['original', 'current', 'incoming'];
      
      editors.forEach(editorId => {
        const editorElement = document.getElementById(\`\${editorId}-editor\`);
        const minimapElement = document.getElementById(\`\${editorId}-minimap\`);
        const totalHeight = editorElement.scrollHeight;
        
        // Add conflict indicators to minimap
        conflicts.forEach((conflict, index) => {
          const indicator = document.createElement('div');
          indicator.className = 'conflict-indicator';
          
          // Calculate position based on line numbers
          const startPercent = (conflict.startLine * 18) / totalHeight;
          const endPercent = (conflict.endLine * 18) / totalHeight;
          const height = Math.max(2, (endPercent - startPercent) * minimapElement.offsetHeight);
          
          indicator.style.top = \`\${startPercent * minimapElement.offsetHeight}px\`;
          indicator.style.height = \`\${height}px\`;
          
          // Highlight current conflict
          if (index === currentConflictIndex) {
            indicator.style.backgroundColor = '#569cd6';
          }
          
          minimapElement.appendChild(indicator);
        });
      });
    }
    
    // Accept original version of the conflict
    function acceptOriginal(index) {
      const vscode = acquireVsCodeApi();
      vscode.postMessage({
        command: 'acceptOriginal',
        conflictIndex: index
      });
    }
    
    // Accept current (HEAD) version of the conflict
    function acceptCurrent(index) {
      const vscode = acquireVsCodeApi();
      vscode.postMessage({
        command: 'acceptCurrent',
        conflictIndex: index
      });
    }
    
    // Accept incoming version of the conflict
    function acceptIncoming(index) {
      const vscode = acquireVsCodeApi();
      vscode.postMessage({
        command: 'acceptIncoming',
        conflictIndex: index
      });
    }
    
    // Close the UI
    function closeUI() {
      const vscode = acquireVsCodeApi();
      vscode.postMessage({
        command: 'close'
      });
    }
    
    // Helper function to acquire VS Code API
    function acquireVsCodeApi() {
      return window.vscode || {
        postMessage: function(message) {
          console.log('Message to VS Code:', message);
        }
      };
    }
    
    // Initialize on load
    document.addEventListener('DOMContentLoaded', initialize);
  </script>
</body>
</html>`;
}

/**
 * Resolve conflict with original version
 * @param {number} conflictIndex - Index of the conflict to resolve
 */
function resolveWithOriginal(conflictIndex) {
  // Implementation to replace the conflict with original content
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  
  const document = editor.document;
  const text = document.getText();
  const conflicts = extractMergeConflicts(text);
  
  if (conflictIndex >= conflicts.length) return;
  
  const conflict = conflicts[conflictIndex];
  
  // Replace the conflict with the original content
  const startPos = document.positionAt(document.offsetAt(new vscode.Position(conflict.startLine, 0)));
  const endPos = document.positionAt(document.offsetAt(new vscode.Position(conflict.endLine + 1, 0)));
  
  editor.edit(editBuilder => {
    editBuilder.replace(new vscode.Range(startPos, endPos), conflict.hasCommonAncestor ? conflict.original : conflict.current);
  });
}

/**
 * Resolve conflict with current (HEAD) version
 * @param {number} conflictIndex - Index of the conflict to resolve
 */
function resolveWithCurrent(conflictIndex) {
  // Implementation to replace the conflict with current content
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  
  const document = editor.document;
  const text = document.getText();
  const conflicts = extractMergeConflicts(text);
  
  if (conflictIndex >= conflicts.length) return;
  
  const conflict = conflicts[conflictIndex];
  
  // Replace the conflict with the current content
  const startPos = document.positionAt(document.offsetAt(new vscode.Position(conflict.startLine, 0)));
  const endPos = document.positionAt(document.offsetAt(new vscode.Position(conflict.endLine + 1, 0)));
  
  editor.edit(editBuilder => {
    editBuilder.replace(new vscode.Range(startPos, endPos), conflict.current);
  });
}

/**
 * Resolve conflict with incoming version
 * @param {number} conflictIndex - Index of the conflict to resolve
 */
function resolveWithIncoming(conflictIndex) {
  // Implementation to replace the conflict with incoming content
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  
  const document = editor.document;
  const text = document.getText();
  const conflicts = extractMergeConflicts(text);
  
  if (conflictIndex >= conflicts.length) return;
  
  const conflict = conflicts[conflictIndex];
  
  // Replace the conflict with the incoming content
  const startPos = document.positionAt(document.offsetAt(new vscode.Position(conflict.startLine, 0)));
  const endPos = document.positionAt(document.offsetAt(new vscode.Position(conflict.endLine + 1, 0)));
  
  editor.edit(editBuilder => {
    editBuilder.replace(new vscode.Range(startPos, endPos), conflict.incoming);
  });
}

/**
 * Resolve conflict with custom content
 * @param {number} conflictIndex - Index of the conflict to resolve
 * @param {string} customText - Custom text to replace the conflict with
 */
function resolveWithCustom(conflictIndex, customText) {
  // Implementation to replace the conflict with custom content
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  
  const document = editor.document;
  const text = document.getText();
  const conflicts = extractMergeConflicts(text);
  
  if (conflictIndex >= conflicts.length) return;
  
  const conflict = conflicts[conflictIndex];
  
  // Replace the conflict with the custom content
  const startPos = document.positionAt(document.offsetAt(new vscode.Position(conflict.startLine, 0)));
  const endPos = document.positionAt(document.offsetAt(new vscode.Position(conflict.endLine + 1, 0)));
  
  editor.edit(editBuilder => {
    editBuilder.replace(new vscode.Range(startPos, endPos), customText);
  });
}

/**
 * Deactivate the extension
 */
function deactivate() {}

module.exports = {
  activate,
  deactivate
};