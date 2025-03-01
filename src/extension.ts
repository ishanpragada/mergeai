import * as vscode from 'vscode';
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: '' });

export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "mergeai" is now active!');

	// Register command to resolve merge conflicts
	const disposable = vscode.commands.registerCommand('mergeai.helloWorld', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showWarningMessage('No active editor found');
			return;
		}

		// Get the document text
		const document = editor.document;
		const text = document.getText();

		// Check if there are merge conflicts
		if (!text.includes('<<<<<<<') || !text.includes('>>>>>>>')) {
			vscode.window.showInformationMessage('No merge conflicts found in this file');
			return;
		}

		// Show progress notification
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Analyzing merge conflicts...",
			cancellable: false
		}, async (progress) => {
			progress.report({ increment: 0 });

			// Extract all merge conflicts
			const conflicts = extractMergeConflicts(text);
			if (conflicts.length === 0) {
				vscode.window.showInformationMessage('No valid merge conflicts found');
				return;
			}

			progress.report({ increment: 30, message: `Found ${conflicts.length} conflict(s)` });

			// Create a webview panel to display conflicts and resolutions
			const panel = vscode.window.createWebviewPanel(
				'mergeConflictPanel',
				'Merge Conflict Resolver',
				vscode.ViewColumn.Beside,
				{ enableScripts: true }
			);

			// Initialize the webview content
			updateWebviewContent(panel, conflicts, []);

			// Process each conflict
			const resolutions: string[] = [];
			for (let i = 0; i < conflicts.length; i++) {
				const conflict = conflicts[i];
				progress.report({ 
					increment: 50 / conflicts.length, 
					message: `Resolving conflict ${i + 1}/${conflicts.length}...` 
				});

				try {
					// Get AI suggestion for this conflict
					const resolution = await getAIResolution(conflict);
					resolutions.push(resolution);
					
					// Update the webview with the current resolutions
					updateWebviewContent(panel, conflicts, resolutions);
				} catch (error) {
					console.error('Error resolving conflict:', error);
					resolutions.push("Error: Failed to get AI resolution");
					updateWebviewContent(panel, conflicts, resolutions);
				}
			}

			progress.report({ increment: 20, message: "Completed" });

			// Set up message handling from webview
			panel.webview.onDidReceiveMessage(
				async message => {
					if (message.command === 'applyResolution') {
						await applyResolution(editor, message.index, message.resolution, conflicts[message.index]);
						vscode.window.showInformationMessage(`Applied resolution for conflict #${message.index + 1}`);
					} else if (message.command === 'applyAll') {
						for (let i = 0; i < conflicts.length; i++) {
							if (resolutions[i] && !resolutions[i].startsWith("Error:")) {
								await applyResolution(editor, i, resolutions[i], conflicts[i]);
							}
						}
						vscode.window.showInformationMessage('Applied all resolutions');
					} else if (message.command === 'regenerate') {
						vscode.window.showInformationMessage(`Regenerating resolution for conflict #${message.index + 1}...`);
						try {
							const newResolution = await getAIResolution(conflicts[message.index], true);
							resolutions[message.index] = newResolution;
							updateWebviewContent(panel, conflicts, resolutions);
						} catch (error) {
							console.error('Error regenerating resolution:', error);
							resolutions[message.index] = "Error: Failed to regenerate resolution";
							updateWebviewContent(panel, conflicts, resolutions);
						}
					}
				},
				undefined,
				context.subscriptions
			);
		});
	});

	context.subscriptions.push(disposable);
}

// Extract merge conflicts from text
function extractMergeConflicts(text: string): string[] {
	const conflicts: string[] = [];
	let position = 0;

	while (true) {
		const startMarker = '<<<<<<<';
		const middleMarker = '=======';
		const endMarker = '>>>>>>>';

		const startPos = text.indexOf(startMarker, position);
		if (startPos === -1) break;

		const middlePos = text.indexOf(middleMarker, startPos);
		if (middlePos === -1) break;

		const endPos = text.indexOf(endMarker, middlePos);
		if (endPos === -1) break;

		// Find the end of the line where the end marker is
		const endLinePos = text.indexOf('\n', endPos);
		const conflictEndPos = endLinePos !== -1 ? endLinePos : text.length;

		// Extract the entire conflict block
		const conflict = text.substring(startPos, conflictEndPos);
		conflicts.push(conflict);

		// Move position forward
		position = conflictEndPos;
	}

	return conflicts;
}

// Get AI resolution for a conflict
async function getAIResolution(conflict: string, isRegeneration: boolean = false): Promise<string> {
	// Parse the conflict to extract current and incoming changes
	const startMarker = '<<<<<<<';
	const middleMarker = '=======';
	const endMarker = '>>>>>>>';

	const startMarkerPos = conflict.indexOf(startMarker);
	const middleMarkerPos = conflict.indexOf(middleMarker);
	const endMarkerPos = conflict.indexOf(endMarker);

	if (startMarkerPos === -1 || middleMarkerPos === -1 || endMarkerPos === -1) {
		return "Error: Invalid conflict format";
	}

	// Extract current branch (HEAD) content
	const currentStartPos = startMarkerPos + startMarker.length;
	const currentBranch = conflict.substring(currentStartPos, middleMarkerPos).trim();

	// Extract incoming content
	const incomingStartPos = middleMarkerPos + middleMarker.length;
	const incomingBranch = conflict.substring(incomingStartPos, endMarkerPos).trim();

	// Get context if available (a few lines before/after the conflict)
	let contextBefore = "";
	let contextAfter = "";

	// Create prompt for the AI
	const promptText = `
You are a merge conflict resolver. Below is a Git merge conflict. Please analyze both versions and suggest the best resolution.

CURRENT BRANCH (HEAD):
\`\`\`
${currentBranch}
\`\`\`

INCOMING BRANCH:
\`\`\`
${incomingBranch}
\`\`\`

${contextBefore ? `CONTEXT BEFORE:\n\`\`\`\n${contextBefore}\`\`\`\n` : ''}
${contextAfter ? `CONTEXT AFTER:\n\`\`\`\n${contextAfter}\`\`\`\n` : ''}

${isRegeneration ? 'Please provide an alternative resolution approach.' : ''}

Analyze both versions and provide the resolved code that:
1. Preserves the intended functionality from both versions if possible
2. Resolves any logical conflicts
3. Maintains consistent style and formatting
4. Does not include conflict markers

ONLY RETURN THE RESOLVED CODE ITSELF, NO EXPLANATION OR ADDITIONAL TEXT.`;

	try {
		const response = await openai.chat.completions.create({
			model: "gpt-4o",
			messages: [
				{ role: "system", content: "You are a code merge conflict resolution assistant. Your task is to analyze Git merge conflicts and suggest the best resolution. Only provide the resolved code without explanation or conflict markers." },
				{ role: "user", content: promptText },
			]
		});

		const resolution = response.choices[0]?.message?.content?.trim() || "No resolution provided";
		
		// Clean up any remaining markdown code blocks if the AI included them
		return resolution.replace(/```[\w]*\n|```$/g, '').trim();
	} catch (error) {
		console.error('Error fetching AI resolution:', error);
		throw error;
	}
}

// Apply a resolution to the document
async function applyResolution(editor: vscode.TextEditor, index: number, resolution: string, originalConflict: string): Promise<void> {
	const document = editor.document;
	const text = document.getText();
	
	// Find the start and end positions of the conflict in the document
	const startPos = text.indexOf(originalConflict);
	if (startPos === -1) {
		vscode.window.showErrorMessage('Cannot locate the conflict in the document. It may have been modified.');
		return;
	}
	
	const endPos = startPos + originalConflict.length;
	
	// Create a range covering the conflict
	const startPosition = document.positionAt(startPos);
	const endPosition = document.positionAt(endPos);
	const range = new vscode.Range(startPosition, endPosition);
	
	// Replace the conflict with the resolution
	await editor.edit(editBuilder => {
		editBuilder.replace(range, resolution);
	});
}

// Update the webview content
function updateWebviewContent(panel: vscode.WebviewPanel, conflicts: string[], resolutions: string[]): void {
	panel.webview.html = `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Merge Conflict Resolver</title>
			<style>
				body {
					font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
					padding: 20px;
					color: #333;
					background-color: #f9f9f9;
				}
				.conflict-container {
					margin-bottom: 30px;
					border: 1px solid #ddd;
					border-radius: 5px;
					overflow: hidden;
				}
				.conflict-header {
					background-color: #e8eaed;
					padding: 10px 15px;
					font-weight: bold;
					display: flex;
					justify-content: space-between;
					align-items: center;
				}
				.conflict-content {
					padding: 15px;
					background-color: #f5f5f5;
					white-space: pre-wrap;
					font-family: 'Courier New', monospace;
					font-size: 14px;
					overflow-x: auto;
				}
				.resolution-container {
					background-color: #fff;
					border-top: 1px solid #ddd;
				}
				.resolution-header {
					background-color: #e0f2f1;
					padding: 10px 15px;
					font-weight: bold;
					display: flex;
					justify-content: space-between;
					align-items: center;
				}
				.resolution-content {
					padding: 15px;
					white-space: pre-wrap;
					font-family: 'Courier New', monospace;
					font-size: 14px;
					overflow-x: auto;
				}
				.btn {
					background-color: #0078d7;
					color: white;
					border: none;
					padding: 8px 12px;
					border-radius: 4px;
					cursor: pointer;
					font-size: 12px;
					margin-left: 5px;
				}
				.btn:hover {
					background-color: #106ebe;
				}
				.btn:disabled {
					background-color: #cccccc;
					cursor: not-allowed;
				}
				.regenerate-btn {
					background-color: #5c2d91;
				}
				.regenerate-btn:hover {
					background-color: #4b2977;
				}
				.apply-all-btn {
					background-color: #107c10;
					padding: 10px 16px;
					font-size: 14px;
					margin-bottom: 20px;
				}
				.apply-all-btn:hover {
					background-color: #0b5e0b;
				}
				.loading {
					font-style: italic;
					color: #666;
				}
			</style>
		</head>
		<body>
			<h1>Merge Conflict Resolver</h1>
			<p>Review the AI-suggested resolutions for each merge conflict and apply them as needed.</p>
			
			<button id="applyAllBtn" class="btn apply-all-btn">Apply All Resolutions</button>
			
			<div id="conflicts-container">
				${conflicts.map((conflict, index) => {
					const current = conflict.substring(
						conflict.indexOf('<<<<<<<'), 
						conflict.indexOf('=======')
					).replace('<<<<<<<', '').trim();
					
					const incoming = conflict.substring(
						conflict.indexOf('======='), 
						conflict.indexOf('>>>>>>>')
					).replace('=======', '').trim();
					
					return `
						<div class="conflict-container" id="conflict-${index}">
							<div class="conflict-header">
								<span>Conflict #${index + 1}</span>
							</div>
							<div class="conflict-content">
								<div style="color: #d73a49; margin-bottom: 10px;">&lt;&lt;&lt;&lt;&lt;&lt;&lt; HEAD</div>
								<div style="padding-left: 10px; border-left: 2px solid #d73a49; margin-bottom: 10px;">${escapeHtml(current)}</div>
								<div style="color: #6f42c1; margin-bottom: 10px;">======</div>
								<div style="padding-left: 10px; border-left: 2px solid #6f42c1; margin-bottom: 10px;">${escapeHtml(incoming)}</div>
								<div style="color: #22863a;">&gt;&gt;&gt;&gt;&gt;&gt;&gt;</div>
							</div>
							
							<div class="resolution-container">
								<div class="resolution-header">
									<span>AI Resolution</span>
									<div>
										<button class="btn regenerate-btn" onclick="regenerateResolution(${index})">Regenerate</button>
										<button class="btn" onclick="applyResolution(${index})" ${!resolutions[index] || resolutions[index].startsWith('Error:') ? 'disabled' : ''}>Apply Resolution</button>
									</div>
								</div>
								<div class="resolution-content" id="resolution-${index}">
									${resolutions[index] 
										? (resolutions[index].startsWith('Error:') 
											? `<span style="color: red;">${resolutions[index]}</span>` 
											: escapeHtml(resolutions[index]))
										: '<span class="loading">Generating resolution...</span>'}
								</div>
							</div>
						</div>
					`;
				}).join('')}
			</div>
			
			<script>
				const vscode = acquireVsCodeApi();
				
				function applyResolution(index) {
					const resolution = document.getElementById('resolution-' + index).innerText;
					vscode.postMessage({
						command: 'applyResolution',
						index: index,
						resolution: resolution
					});
				}
				
				function regenerateResolution(index) {
					document.getElementById('resolution-' + index).innerHTML = '<span class="loading">Regenerating resolution...</span>';
					vscode.postMessage({
						command: 'regenerate',
						index: index
					});
				}
				
				document.getElementById('applyAllBtn').addEventListener('click', function() {
					vscode.postMessage({
						command: 'applyAll'
					});
				});
			</script>
		</body>
		</html>
	`;
}

// Helper function to escape HTML special characters
function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

export function deactivate() {}