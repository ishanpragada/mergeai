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
            <div class="app-container">
                <div id="keyboard-hints" class="keyboard-hints"></div>
                <div class="editor-container">
                    <div class="panel local-panel">
                        <div class="panel-header">
                            <span class="panel-title">Local Changes</span>
                            <div class="panel-indicator local-indicator"></div>
                        </div>
                        <div id="local-editor" class="editor-panel"></div>
                    </div>
                    <div class="panel merged-panel">
                        <div class="panel-header">
                            <span class="panel-title">Resolved Code</span>
                            <div class="panel-indicator merged-indicator"></div>
                        </div>
                        <div id="merged-editor" class="editor-panel"></div>
                    </div>
                    <div class="panel remote-panel">
                        <div class="panel-header">
                            <span class="panel-title">Remote Changes</span>
                            <div class="panel-indicator remote-indicator"></div>
                        </div>
                        <div id="remote-editor" class="editor-panel"></div>
                    </div>
                </div>
                <div class="controls">
                    <button id="commitChanges" class="commit-button">Commit Resolution</button>
                </div>
            </div>
            <script src="${scriptUri}"></script>
        </body>
        </html>
    `;
}
