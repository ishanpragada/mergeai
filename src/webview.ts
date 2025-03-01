import * as vscode from 'vscode';

export function createMergePanel(context: vscode.ExtensionContext) {
    const panel = vscode.window.createWebviewPanel(
        'mergePanel',
        'Merge Conflict Resolution',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'webview')]
        }
    );

    // Get URIs for webview resources
    const scriptUri = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'webview', 'scripts.js')
    );
    const styleUri = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'webview', 'styles.css')
    );

    // Set webview HTML content
    panel.webview.html = getWebviewContent(panel.webview.cspSource, scriptUri, styleUri);
    
    return panel;
}

function getWebviewContent(cspSource: string, scriptUri: vscode.Uri, styleUri: vscode.Uri): string {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource}; script-src ${cspSource};">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${styleUri}" rel="stylesheet">
            <title>Merge Conflict Resolution</title>
        </head>
        <body>
            <div id="keyboard-hints"></div>
            <div class="editor-container">
                <div class="panel">
                    <div class="panel-header">Local Changes</div>
                    <div id="local-editor" class="editor-panel"></div>
                </div>
                <div class="panel">
                    <div class="panel-header">Resolved Code</div>
                    <div id="merged-editor" class="editor-panel"></div>
                </div>
                <div class="panel">
                    <div class="panel-header">Remote Changes</div>
                    <div id="remote-editor" class="editor-panel"></div>
                </div>
            </div>
            <div class="controls">
                <button id="commitChanges">Commit Resolution</button>
            </div>
            <script src="${scriptUri}"></script>
        </body>
        </html>
    `;
}
