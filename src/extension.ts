import * as vscode from 'vscode';

/**
 * A single conflict chunk: original, current, incoming, plus text range in the real file.
 */
interface ConflictChunk {
    original: string; // text from "||||||| original" to "======="
    current: string;  // text from "<<<<<<< HEAD" to "||||||| original"
    incoming: string; // text from "=======" to ">>>>>>>"
    startIndex: number;
    endIndex: number;
    headStartLine: number;  // The line in the real doc where HEAD code begins
    headLineCount: number;  // Number of lines in HEAD code
}

export function activate(context: vscode.ExtensionContext) {
    const cmd = vscode.commands.registerCommand('mergeai.openCustomMergeView', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        }

        // 1) Parse the file for a single 3-way conflict chunk
        const conflict = parseThreeWayConflict(editor.document);
        if (!conflict) {
            vscode.window.showErrorMessage('No three-way conflict found in the active file.');
            return;
        }

        // 2) Create a custom webview panel
        const panel = vscode.window.createWebviewPanel(
            'mergeView',
            '3-Panel Merge View',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        // 3) Handle messages from the webview
        panel.webview.onDidReceiveMessage(async (msg) => {
            if (msg.command === 'applyLineChange') {
                await applyLineChange(msg, editor);
                // Re-render the webview with updated HEAD code
                panel.webview.html = getWebviewContent(conflict, editor.document);
            } else if (msg.command === 'doNothing') {
                // X was clicked: do nothing
                vscode.window.showInformationMessage(msg.info);
            }
        });

        // 4) Set the webview HTML
        panel.webview.html = getWebviewContent(conflict, editor.document);
    });

    context.subscriptions.push(cmd);
}

/**
 * Parse a single 3‑way conflict:
 *   <<<<<<< HEAD
 *       [current code]
 *   ||||||| original
 *       [original code]
 *   =======
 *       [incoming code]
 *   >>>>>>> branch
 * 
 * Also determine which lines in the real doc correspond to HEAD code,
 * so we can actually replace them line-by-line.
 */
function parseThreeWayConflict(doc: vscode.TextDocument): ConflictChunk | null {
    const text = doc.getText();
    const startMarker = '<<<<<<< HEAD';
    const baseMarker = '|||||||';
    const sepMarker = '=======';
    const endMarker = '>>>>>>>';
    
    const startIndex = text.indexOf(startMarker);
    if (startIndex === -1) return null;
    
    const baseIndex = text.indexOf(baseMarker, startIndex);
    const sepIndex = text.indexOf(sepMarker, baseIndex);
    const endIndex = text.indexOf(endMarker, sepIndex);
    if (baseIndex === -1 || sepIndex === -1 || endIndex === -1) return null;
    
    // Extract raw strings
    const currentCode = text.substring(startIndex + startMarker.length, baseIndex).trimEnd();
    const originalCode = text.substring(baseIndex + baseMarker.length, sepIndex).trimEnd();
    const incomingCode = text.substring(sepIndex + sepMarker.length, endIndex).trimEnd();

    // Find the line in the real doc where HEAD code starts
    // We'll assume it's right after "<<<<<<< HEAD"
    const headStartPos = doc.positionAt(startIndex + startMarker.length);
    const headStartLine = headStartPos.line;

    // Count how many lines are in HEAD code
    const headLineCount = currentCode.split('\n').length;

    return {
        original: originalCode,
        current: currentCode,
        incoming: incomingCode,
        startIndex,
        endIndex: endIndex + endMarker.length,
        headStartLine,
        headLineCount
    };
}

/**
 * Actually replace one line in the real file's HEAD code with the chosen line
 * from Original or Incoming.
 */
async function applyLineChange(msg: any, editor: vscode.TextEditor) {
    const doc = editor.document;
    const lineIndex = msg.lineIndex as number;
    const fromSide = msg.fromSide as 'original' | 'incoming';
    const newLine = msg.newLine as string;

    // Replace that line in the doc
    await editor.edit(editBuilder => {
        if (lineIndex >= 0 && lineIndex < doc.lineCount) {
            const lineRange = doc.lineAt(lineIndex).range;
            editBuilder.replace(lineRange, newLine);
        }
    });

    vscode.window.showInformationMessage(`Accepted line ${lineIndex + 1} from ${fromSide}.`);
}

/**
 * Build the 3-column layout (Original | Current | Incoming).
 * 
 * We map lines in the real doc's HEAD section to compare them with Original & Incoming lines.
 * Then place check (✓) / X icons on the side that differs from HEAD.
 * Clicking ✓ actually replaces that line in the real doc.
 */
function getWebviewContent(conflict: ConflictChunk, doc: vscode.TextDocument): string {
    // Lines from Original & Incoming
    const origLines = conflict.original.split('\n');
    const incLines = conflict.incoming.split('\n');

    // We'll read the real doc lines for HEAD
    // The HEAD code starts at conflict.headStartLine and spans conflict.headLineCount lines
    const headDocLines: string[] = [];
    for (let i = 0; i < conflict.headLineCount; i++) {
        const docLineIndex = conflict.headStartLine + i;
        if (docLineIndex < doc.lineCount) {
            headDocLines.push(doc.lineAt(docLineIndex).text);
        } else {
            headDocLines.push(''); // in case of mismatch
        }
    }

    // The maximum lines to display is the max of original, HEAD, incoming
    const maxLines = Math.max(origLines.length, headDocLines.length, incLines.length);

    let rows = '';

    for (let i = 0; i < maxLines; i++) {
        const orig = origLines[i] ?? '';
        const head = headDocLines[i] ?? '';
        const inc  = incLines[i] ?? '';

        // We do not highlight blank lines
        const differsOrig = (orig.trim() !== '' && orig !== head);
        const differsInc  = (inc.trim()  !== '' && inc  !== head);

        const origBg = differsOrig ? 'background-color: rgba(255,0,0,0.2);' : '';
        const incBg  = differsInc  ? 'background-color: rgba(0,255,0,0.2);' : '';

        // If there's a difference in Original, put icons on the left
        const leftIcons = differsOrig
            ? `
              <div class="icons">
                <span class="icon accept" data-line="${conflict.headStartLine + i}" data-side="original" data-text="${escapeHtml(orig)}">✓</span>
                <span class="icon reject" data-line="${conflict.headStartLine + i}" data-side="original">×</span>
              </div>
            `
            : '';

        // If there's a difference in Incoming, put icons on the right
        const rightIcons = differsInc
            ? `
              <div class="icons">
                <span class="icon accept" data-line="${conflict.headStartLine + i}" data-side="incoming" data-text="${escapeHtml(inc)}">✓</span>
                <span class="icon reject" data-line="${conflict.headStartLine + i}" data-side="incoming">×</span>
              </div>
            `
            : '';

        // We'll skip the row entirely if all lines are identical & blank
        const allSameBlank = (orig === '' && head === '' && inc === '');
        const allIdentical = (orig === head && head === inc);
        if (allSameBlank || allIdentical) {
            continue;
        }

        rows += `
          <tr>
            <!-- Original column -->
            <td class="cell" style="${origBg}">
              <div class="lineNum">${conflict.headStartLine + i + 1}</div>
              <div class="codeLine">${escapeHtml(orig)}</div>
              ${leftIcons}
            </td>

            <!-- HEAD (real doc) column -->
            <td class="cell">
              <div class="lineNum">${conflict.headStartLine + i + 1}</div>
              <div class="codeLine">${escapeHtml(head)}</div>
            </td>

            <!-- Incoming column -->
            <td class="cell" style="${incBg}">
              <div class="lineNum">${conflict.headStartLine + i + 1}</div>
              <div class="codeLine">${escapeHtml(inc)}</div>
              ${rightIcons}
            </td>
          </tr>
        `;
    }

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <style>
        body { margin: 0; padding: 0; font-family: sans-serif; }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        .cell {
          vertical-align: top;
          border-right: 1px solid #ccc;
          padding: 6px;
          position: relative;
        }
        .cell:last-child {
          border-right: none;
        }
        .lineNum {
          display: inline-block;
          width: 2.5em;
          text-align: right;
          margin-right: 8px;
          color: #999;
          user-select: none;
        }
        .codeLine {
          display: inline-block;
          white-space: pre;
        }
        .icons {
          margin-top: 4px;
        }
        .icon {
          display: inline-block;
          margin-right: 4px;
          cursor: pointer;
          color: #444;
          font-weight: bold;
          font-size: 1.1em;
        }
        .icon:hover {
          color: #000;
        }
      </style>
    </head>
    <body>
      <table>
        <tbody>
          ${rows}
        </tbody>
      </table>

      <script>
        const vscode = acquireVsCodeApi();

        document.addEventListener('click', (event) => {
          const target = event.target;
          if (target.classList.contains('icon')) {
            const lineIndex = parseInt(target.getAttribute('data-line'), 10);
            const side = target.getAttribute('data-side');
            const text = target.getAttribute('data-text') || '';

            if (target.classList.contains('accept')) {
              vscode.postMessage({
                command: 'applyLineChange',
                lineIndex,
                fromSide: side,
                newLine: text
              });
            } else if (target.classList.contains('reject')) {
              vscode.postMessage({
                command: 'doNothing',
                info: 'Rejected line ' + (lineIndex+1) + ' from ' + side
              });
            }
          }
        });

        function escapeHtml(html) {
          return html
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        }
      </script>
    </body>
    </html>
    `;
}

/** Escape special HTML chars */
function escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
}

export function deactivate() {}
